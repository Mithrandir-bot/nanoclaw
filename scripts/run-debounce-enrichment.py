#!/usr/bin/env python3
"""
Run deBounce data enrichment on valid emails missing names.
Uses append=true to do reverse email lookup for contact names.
"""

import json
import os
import re
import sys
import time
import urllib.request
import urllib.parse
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Load .env
env_path = PROJECT_ROOT / '.env'
if env_path.exists():
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip())

def decrypt_secret(name):
    db_path = PROJECT_ROOT / 'store' / 'messages.db'
    import sqlite3
    conn = sqlite3.connect(str(db_path))
    row = conn.execute("SELECT encrypted_value FROM secrets WHERE name=?", (name,)).fetchone()
    conn.close()
    if not row: return None
    key = os.environ.get('SECRETS_ENCRYPTION_KEY', '')
    result = subprocess.run(['node', '-e', f"""
const c=require('crypto');const [i,t,e]='{row[0]}'.split(':');
const d=c.createDecipheriv('aes-256-gcm',Buffer.from('{key}','hex'),Buffer.from(i,'hex'));
d.setAuthTag(Buffer.from(t,'hex'));let r=d.update(e,'hex','utf8');r+=d.final('utf8');
process.stdout.write(r);"""], capture_output=True, text=True)
    return result.stdout

DEBOUNCE_API_KEY = decrypt_secret('debounce_api_key')
SHEET_ID = os.environ.get('GOOGLE_CONTACTS_SHEET_ID', '1znTsVDzQe9m8xJHxlasy4uMjKtXwzYSn31TPWekOJPA')
TAB_NAME = 'Enriched Data'
DEBOUNCE_API_URL = 'https://api.debounce.io/v1/'

COL_FIRST = 0; COL_LAST = 1; COL_FULL = 2; COL_EMAIL = 3
COL_STATUS = 23; COL_DETAIL = 24


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


def enrich_email(email, retries=3):
    """Call deBounce with append=true for reverse email lookup."""
    params = urllib.parse.urlencode({
        'api': DEBOUNCE_API_KEY,
        'email': email,
        'append': 'true',
    })
    url = f'{DEBOUNCE_API_URL}?{params}'
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read())
            db = result.get('debounce', {})
            full = (db.get('fullname') or '').strip()
            # Split full name into first/last
            first = ''
            last = ''
            if full:
                parts = full.split(None, 1)
                first = parts[0] if parts else ''
                last = parts[1] if len(parts) > 1 else ''
            return {
                'first': first,
                'last': last,
                'full': full,
                'found': bool(full),
            }
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(1 + attempt * 2)
                continue
            return {'first': '', 'last': '', 'full': '', 'found': False, 'error': str(e)}


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, default=800)
    parser.add_argument('--concurrency', type=int, default=5)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    if not DEBOUNCE_API_KEY:
        print("ERROR: Could not decrypt debounce_api_key")
        sys.exit(1)

    print("=== deBounce Data Enrichment ===")

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

    # Find valid emails with no name
    queue = []
    for i, row in enumerate(rows):
        while len(row) <= COL_DETAIL:
            row.append('')
        status = row[COL_STATUS].strip()
        if not status.startswith('Valid'):
            continue
        first = row[COL_FIRST].strip()
        last = row[COL_LAST].strip()
        full = row[COL_FULL].strip()
        if first or last or full:
            continue  # already has a name
        email = row[COL_EMAIL].strip()
        if not email:
            continue
        sheet_row = i + 2
        queue.append((sheet_row, email, i))

    total = min(len(queue), args.limit)
    print(f"  Valid emails with no name: {len(queue)}")
    print(f"  Will enrich: {total}")
    print(f"  Estimated max credits: {total} + {total * 20} = {total + total * 20}")

    if args.dry_run:
        print("\n  DRY RUN — first 20:")
        for row, email, _ in queue[:20]:
            print(f"    Row {row}: {email}")
        return

    if total == 0:
        print("  Nothing to enrich!")
        return

    # Enrich with concurrency
    lock = threading.Lock()
    updates = []
    enriched = 0
    found = 0
    not_found = 0
    errors = 0
    start_time = time.time()

    def process_one(item):
        sheet_row, email, row_idx = item
        result = enrich_email(email)
        return sheet_row, email, row_idx, result

    batch = queue[:total]
    token_container = [token]

    with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        futures = {executor.submit(process_one, item): item for item in batch}
        for future in as_completed(futures):
            sheet_row, email, row_idx, result = future.result()
            with lock:
                enriched += 1
                if result.get('error'):
                    errors += 1
                elif result['found']:
                    found += 1
                    row_updates = []
                    if result['first']:
                        row_updates.append({'range': f"'{TAB_NAME}'!A{sheet_row}", 'values': [[result['first']]]})
                    if result['last']:
                        row_updates.append({'range': f"'{TAB_NAME}'!B{sheet_row}", 'values': [[result['last']]]})
                    full = result['full'] or f"{result['first']} {result['last']}".strip()
                    if full:
                        row_updates.append({'range': f"'{TAB_NAME}'!C{sheet_row}", 'values': [[full]]})
                    # Update status to note enrichment
                    current_status = rows[row_idx][COL_STATUS]
                    if '[Enriched]' not in current_status:
                        row_updates.append({'range': f"'{TAB_NAME}'!X{sheet_row}",
                                           'values': [[current_status + ' [Enriched]']]})
                    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
                    current_detail = rows[row_idx][COL_DETAIL]
                    enrich_note = f" | Enriched {today}: {full}"
                    row_updates.append({'range': f"'{TAB_NAME}'!Y{sheet_row}",
                                       'values': [[current_detail + enrich_note]]})
                    updates.extend(row_updates)
                else:
                    not_found += 1

                if enriched % 50 == 0:
                    elapsed = time.time() - start_time
                    rate = enriched / elapsed if elapsed > 0 else 0
                    eta = (total - enriched) / rate if rate > 0 else 0
                    print(f"  [{enriched}/{total}] Found:{found} NotFound:{not_found} Err:{errors} ({rate:.1f}/s, ETA {eta/60:.0f}m)")

                # Batch write
                if len(updates) >= 300:
                    to_write = updates[:]
                    updates.clear()
                    if enriched % 1500 < args.concurrency:
                        token_container[0] = get_access_token()
                    for cs in range(0, len(to_write), 500):
                        sheets_batch_update(token_container[0], to_write[cs:cs + 500])

    # Final write
    if updates:
        token = token_container[0]
        for cs in range(0, len(updates), 500):
            sheets_batch_update(token, updates[cs:cs + 500])

    # Final balance
    try:
        with urllib.request.urlopen(urllib.request.Request(bal_url), timeout=10) as r:
            end_balance = json.loads(r.read()).get('balance', 'unknown')
    except:
        end_balance = 'unknown'

    elapsed = time.time() - start_time
    print(f"\n=== Enrichment Complete ===")
    print(f"  Processed: {enriched} in {elapsed/60:.1f} minutes")
    print(f"  Names found: {found} ({found * 100 // max(enriched, 1)}% hit rate)")
    print(f"  No match: {not_found}")
    print(f"  Errors: {errors}")
    print(f"  Credits remaining: {end_balance}")


if __name__ == '__main__':
    main()
