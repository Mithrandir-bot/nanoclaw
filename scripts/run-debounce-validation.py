#!/usr/bin/env python3
"""
Run full deBounce email validation from the host.
Reads from Google Sheet, validates via deBounce API, writes results back.
"""

import json
import os
import re
import sys
import time
import urllib.request
import urllib.parse
from datetime import datetime, timezone

# Load .env
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env')
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip())

# Decrypt deBounce API key from secrets store
import sqlite3
import hashlib

def decrypt_secret(name):
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'store', 'messages.db')
    conn = sqlite3.connect(db_path)
    row = conn.execute("SELECT encrypted_value FROM secrets WHERE name=?", (name,)).fetchone()
    conn.close()
    if not row:
        return None
    iv_hex, tag_hex, enc_hex = row[0].split(':')

    # Use pycryptodome-like approach with ctypes for AES-GCM
    # Actually, just shell out to node for decryption
    import subprocess
    key = os.environ.get('SECRETS_ENCRYPTION_KEY', '')
    result = subprocess.run(['node', '-e', f"""
const crypto = require('crypto');
const [iv,tag,enc] = '{row[0]}'.split(':');
const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from('{key}','hex'), Buffer.from(iv,'hex'));
d.setAuthTag(Buffer.from(tag,'hex'));
let r = d.update(enc,'hex','utf8');
r += d.final('utf8');
process.stdout.write(r);
"""], capture_output=True, text=True)
    return result.stdout


DEBOUNCE_API_KEY = decrypt_secret('debounce_api_key')
SHEET_ID = os.environ.get('GOOGLE_CONTACTS_SHEET_ID', '1znTsVDzQe9m8xJHxlasy4uMjKtXwzYSn31TPWekOJPA')
TAB_NAME = 'Enriched Data'
DEBOUNCE_API_URL = 'https://api.debounce.io/v1/'

STATUS_MAP = {
    '1': 'Not an Email', '2': 'Spam Trap', '3': 'Disposable',
    '4': 'Accept-All (Risky)', '5': 'Valid', '6': 'Invalid',
    '7': 'Unknown', '8': 'Role-based',
}

COL_FIRST_NAME = 0
COL_LAST_NAME = 1
COL_FULL_NAME = 2
COL_EMAIL = 3
COL_SEC_EMAIL = 7
COL_CATEGORY = 12
COL_EMAIL_STATUS = 23
COL_EMAIL_DETAIL = 24

CATEGORY_PRIORITY = {
    'Investor': 0, 'Partner': 1, 'Client': 2, 'Prospect': 3,
    'Colleague': 4, 'Vendor': 5, 'Personal': 6,
}


def get_access_token():
    data = urllib.parse.urlencode({
        'client_id': os.environ['GOOGLE_CLIENT_ID'],
        'client_secret': os.environ['GOOGLE_CLIENT_SECRET'],
        'refresh_token': os.environ['GOOGLE_REFRESH_TOKEN'],
        'grant_type': 'refresh_token',
    }).encode()
    req = urllib.request.Request('https://oauth2.googleapis.com/token', data=data, method='POST')
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())['access_token']


def sheets_get(token, range_str):
    encoded = urllib.parse.quote(range_str, safe='')
    url = f'https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/{encoded}'
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read()).get('values', [])


def sheets_batch_update(token, data):
    url = f'https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values:batchUpdate'
    body = json.dumps({'valueInputOption': 'RAW', 'data': data}).encode()
    req = urllib.request.Request(url, data=body, method='POST',
                                 headers={'Authorization': f'Bearer {token}',
                                          'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def validate_email(email, retries=3):
    params = urllib.parse.urlencode({'api': DEBOUNCE_API_KEY, 'email': email})
    url = f'{DEBOUNCE_API_URL}?{params}'
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read())
            db = result.get('debounce', {})
            code = db.get('code', '7')
            status = STATUS_MAP.get(code, f'Code {code}')
            role = db.get('role', '0')
            free = db.get('free_email', '0')
            disposable = db.get('disposable_email', '0')
            reason = db.get('reason', '')
            today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
            detail = {
                'status': status, 'role': role == 'true' or role == '1',
                'free': free == 'true' or free == '1',
                'disposable': disposable == 'true' or disposable == '1',
                'reason': reason, 'checked': today,
            }
            return status, detail
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(1 + attempt * 2)  # backoff: 1s, 3s
                continue
            return 'Error', {'error': str(e), 'checked': datetime.now(timezone.utc).strftime('%Y-%m-%d')}


def is_valid_email(email):
    return bool(re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email))


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, default=6000)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--batch-size', type=int, default=200, help='Write results every N validations')
    parser.add_argument('--concurrency', type=int, default=10, help='Concurrent API requests')
    args = parser.parse_args()

    if not DEBOUNCE_API_KEY:
        print("ERROR: Could not decrypt debounce_api_key")
        sys.exit(1)

    print(f"=== deBounce Full Validation ===")

    # Check balance
    try:
        bal_url = f'https://api.debounce.io/v1/balance/?{urllib.parse.urlencode({"api": DEBOUNCE_API_KEY})}'
        with urllib.request.urlopen(urllib.request.Request(bal_url), timeout=10) as r:
            balance = json.loads(r.read()).get('balance', 'unknown')
    except:
        balance = 'unknown'
    print(f"  Credits remaining: {balance}")

    token = get_access_token()
    print("  Reading sheet...")
    rows = sheets_get(token, f"'{TAB_NAME}'!A2:Y")
    print(f"  Total rows: {len(rows)}")

    # Build queue of emails needing validation
    queue = []
    for i, row in enumerate(rows):
        while len(row) <= COL_EMAIL_DETAIL:
            row.append('')

        existing = row[COL_EMAIL_STATUS].strip()
        if existing and existing not in ('', 'Error', 'Pending'):
            continue

        email = row[COL_EMAIL].strip() if len(row) > COL_EMAIL else ''
        category = row[COL_CATEGORY].strip() if len(row) > COL_CATEGORY else ''
        priority = CATEGORY_PRIORITY.get(category, 99)
        sheet_row = i + 2

        if email and is_valid_email(email):
            queue.append((priority, sheet_row, email, 'D', i))

        # Secondary emails
        sec = row[COL_SEC_EMAIL].strip() if len(row) > COL_SEC_EMAIL else ''
        if sec:
            for se in sec.split(';'):
                se = se.strip()
                if se and is_valid_email(se):
                    queue.append((priority + 0.5, sheet_row, se, 'H', i))

    queue.sort(key=lambda x: x[0])
    total = min(len(queue), args.limit)
    print(f"  Emails needing validation: {len(queue)}")
    print(f"  Will validate: {total}")

    if args.dry_run:
        print("\n  DRY RUN — first 20:")
        for _, rn, email, col, _ in queue[:20]:
            print(f"    Row {rn}, Col {col}: {email}")
        return

    if total == 0:
        print("  Nothing to validate!")
        return

    # Validate with concurrent requests
    from concurrent.futures import ThreadPoolExecutor, as_completed
    import threading

    lock = threading.Lock()
    updates = []
    validated = 0
    valid_count = 0
    invalid_count = 0
    risky_count = 0
    errors = 0
    start_time = time.time()
    concurrency = args.concurrency

    def process_one(item):
        _, sheet_row, email, col, row_idx = item
        status, detail = validate_email(email)
        status_str = status
        if detail.get('disposable'):
            status_str += ' (Disposable)'
        if detail.get('role'):
            status_str += ' (Role)'
        if detail.get('free'):
            status_str += ' (Free)'

        row_updates = []
        if col == 'D':
            detail_parts = [f"deBounce {detail.get('checked', '')}"]
            if detail.get('reason'):
                detail_parts.append(detail['reason'])
            row_updates.append({'range': f"'{TAB_NAME}'!X{sheet_row}", 'values': [[status_str]]})
            row_updates.append({'range': f"'{TAB_NAME}'!Y{sheet_row}", 'values': [[' | '.join(detail_parts)]]})
        else:
            existing = rows[row_idx][COL_EMAIL_DETAIL] if len(rows[row_idx]) > COL_EMAIL_DETAIL else ''
            sec_note = f"Sec email ({email}): {status_str}"
            new_detail = f"{existing}; {sec_note}" if existing else sec_note
            row_updates.append({'range': f"'{TAB_NAME}'!Y{sheet_row}", 'values': [[new_detail]]})

        return status, row_updates

    batch_items = queue[:total]
    token_lock = threading.Lock()
    token_container = [token]  # mutable container for token refresh
    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = {executor.submit(process_one, item): item for item in batch_items}
        for future in as_completed(futures):
            status, row_updates = future.result()
            with lock:
                validated += 1
                if status == 'Valid':
                    valid_count += 1
                elif status in ('Invalid', 'Spam Trap', 'Not an Email'):
                    invalid_count += 1
                elif status == 'Error':
                    errors += 1
                else:
                    risky_count += 1
                updates.extend(row_updates)

                if validated % 100 == 0:
                    elapsed = time.time() - start_time
                    rate = validated / elapsed if elapsed > 0 else 0
                    eta = (total - validated) / rate if rate > 0 else 0
                    print(f"  [{validated}/{total}] Valid:{valid_count} Invalid:{invalid_count} Risky:{risky_count} Err:{errors} ({rate:.1f}/s, ETA {eta/60:.0f}m)")

                # Write in chunks
                if len(updates) >= 400:
                    to_write = updates[:]
                    updates.clear()
                    # Refresh token periodically
                    if validated % 2000 < concurrency:
                        token_container[0] = get_access_token()
                    for cs in range(0, len(to_write), 500):
                        sheets_batch_update(token_container[0], to_write[cs:cs + 500])

    # Final batch write
    if updates:
        token = token_container[0]
        for chunk_start in range(0, len(updates), 500):
            sheets_batch_update(token, updates[chunk_start:chunk_start + 500])

    # Final balance
    try:
        with urllib.request.urlopen(urllib.request.Request(bal_url), timeout=10) as r:
            end_balance = json.loads(r.read()).get('balance', 'unknown')
    except:
        end_balance = 'unknown'

    elapsed = time.time() - start_time
    print(f"\n=== Validation Complete ===")
    print(f"  Validated: {validated} in {elapsed/60:.1f} minutes")
    print(f"  Valid: {valid_count}")
    print(f"  Invalid: {invalid_count}")
    print(f"  Risky/Unknown: {risky_count}")
    print(f"  Errors: {errors}")
    print(f"  Credits remaining: {end_balance}")


if __name__ == '__main__':
    main()
