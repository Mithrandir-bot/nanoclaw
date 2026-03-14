#!/usr/bin/env python3
"""
Fix invalid emails by:
1. Cross-referencing with OCR cache to find source screenshots
2. Re-OCR'ing with Gemini vision to get correct emails
3. Swapping valid secondary emails into primary field for non-BlockFi contacts
"""

import json
import os
import re
import sys
import time
import base64
import urllib.request
import urllib.parse
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

# Load .env
env_path = Path(__file__).resolve().parent.parent / '.env'
if env_path.exists():
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip())

OPENROUTER_API_KEY = os.environ.get('OPENROUTER_API_KEY', '')
SHEET_ID = os.environ.get('GOOGLE_CONTACTS_SHEET_ID', '1znTsVDzQe9m8xJHxlasy4uMjKtXwzYSn31TPWekOJPA')
TAB_NAME = 'Enriched Data'
PROJECT_ROOT = Path(__file__).resolve().parent.parent
UPLOADS_DIR = PROJECT_ROOT / 'groups' / 'contacts' / 'uploads'
OCR_CACHE_PATH = PROJECT_ROOT / 'groups' / 'contacts' / 'ocr_cache_blockfi.json'
DEBOUNCE_API_URL = 'https://api.debounce.io/v1/'

# Decrypt deBounce key
def decrypt_secret(name):
    db_path = PROJECT_ROOT / 'store' / 'messages.db'
    import sqlite3
    conn = sqlite3.connect(str(db_path))
    row = conn.execute("SELECT encrypted_value FROM secrets WHERE name=?", (name,)).fetchone()
    conn.close()
    if not row: return None
    key = os.environ.get('SECRETS_ENCRYPTION_KEY', '')
    result = subprocess.run(['node', '-e', f"""
const crypto=require('crypto');
const [iv,tag,enc]='{row[0]}'.split(':');
const d=crypto.createDecipheriv('aes-256-gcm',Buffer.from('{key}','hex'),Buffer.from(iv,'hex'));
d.setAuthTag(Buffer.from(tag,'hex'));
let r=d.update(enc,'hex','utf8');r+=d.final('utf8');
process.stdout.write(r);"""], capture_output=True, text=True)
    return result.stdout

DEBOUNCE_API_KEY = decrypt_secret('debounce_api_key')


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


def validate_email_debounce(email, retries=2):
    """Validate a single email via deBounce."""
    for attempt in range(retries):
        try:
            params = urllib.parse.urlencode({'api': DEBOUNCE_API_KEY, 'email': email})
            req = urllib.request.Request(f'{DEBOUNCE_API_URL}?{params}')
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read())
            db = result.get('debounce', {})
            code = db.get('code', '7')
            STATUS_MAP = {'1':'Not an Email','2':'Spam Trap','3':'Disposable',
                          '4':'Accept-All (Risky)','5':'Valid','6':'Invalid','7':'Unknown','8':'Role-based'}
            return STATUS_MAP.get(code, f'Code {code}'), db.get('reason', '')
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2)
                continue
            return 'Error', str(e)


def gemini_ocr_batch(image_path, invalid_emails):
    """Send a screenshot to Gemini with a list of invalid emails to re-verify."""
    if not image_path.exists():
        return []

    with open(image_path, 'rb') as f:
        img_data = base64.b64encode(f.read()).decode()

    # Determine mime type
    ext = image_path.suffix.lower()
    mime = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
            'webp': 'image/webp'}.get(ext.lstrip('.'), 'image/jpeg')

    email_list = "\n".join([f"- Row {e['row']}: \"{e['email']}\" (Name: {e['name']}, Company: {e['company']})"
                            for e in invalid_emails])

    prompt = f"""You are reviewing a screenshot of a contact spreadsheet (HubSpot export from BlockFi).
I extracted emails via OCR but some are garbled or truncated. Look at this screenshot carefully and find the CORRECT email addresses for these contacts.

For each contact below, find their row in the screenshot and read the exact email address character by character. Pay special attention to:
- Truncated emails ending in "..." — read the full email from the screenshot
- Garbled characters — compare what I have vs what you see
- Domain names that don't match the company name
- Missing TLDs (.com, .net, etc.)

Invalid emails to verify:
{email_list}

Respond in JSON format ONLY. Return an array of objects, one per email you can find/fix:
[
  {{"row": 5959, "old_email": "macarena.wiedemann@ideal...", "new_email": "macarena.wiedemann@idealcapitalgroup.com", "confidence": "high", "notes": "Truncated domain visible in screenshot"}},
  ...
]

If you CANNOT find a contact in this screenshot, omit it from the array.
If the email in the screenshot is the same as what I have, omit it.
Only include entries where you can provide a CORRECTED email.
Return [] if no corrections found."""

    body = json.dumps({
        "model": "google/gemini-2.5-flash",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{img_data}"}},
                    {"type": "text", "text": prompt}
                ]
            }
        ],
        "max_tokens": 4096,
        "temperature": 0.1,
    }).encode()

    req = urllib.request.Request(
        'https://openrouter.ai/api/v1/chat/completions',
        data=body,
        headers={
            'Authorization': f'Bearer {OPENROUTER_API_KEY}',
            'Content-Type': 'application/json',
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read())
        text = result['choices'][0]['message']['content']
        # Extract JSON from response (may be wrapped in ```json ... ```)
        json_match = re.search(r'\[[\s\S]*\]', text)
        if json_match:
            return json.loads(json_match.group())
        return []
    except Exception as e:
        print(f"    Gemini error for {image_path.name}: {e}")
        return []


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true', help='Show fixes without applying')
    parser.add_argument('--skip-gemini', action='store_true', help='Skip Gemini OCR, only do secondary swap')
    args = parser.parse_args()

    print("=== Fix Invalid Emails ===\n")

    # Load OCR cache
    ocr_cache = {}
    if OCR_CACHE_PATH.exists():
        with open(OCR_CACHE_PATH) as f:
            ocr_cache = json.load(f)
        print(f"  OCR cache: {len(ocr_cache)} screenshot files, {sum(len(v) for v in ocr_cache.values())} contacts")

    # Build reverse index: email → screenshot file
    email_to_file = {}
    for filename, contacts in ocr_cache.items():
        for c in contacts:
            email = (c.get('email') or '').strip().lower()
            if email:
                email_to_file[email] = filename

    # Read sheet data
    token = get_access_token()
    print("  Reading sheet...")
    rows = sheets_get(token, f"'{TAB_NAME}'!A2:Y")
    print(f"  Total rows: {len(rows)}")

    # Find all invalid emails
    COL_FIRST = 0; COL_LAST = 1; COL_FULL = 2; COL_EMAIL = 3
    COL_SEC_EMAIL = 7; COL_COMPANY = 10; COL_SOURCE = 15
    COL_STATUS = 23; COL_DETAIL = 24

    invalid_rows = []
    for i, row in enumerate(rows):
        while len(row) <= COL_DETAIL:
            row.append('')
        status = row[COL_STATUS].strip()
        if not status.startswith('Invalid'):
            continue
        email = row[COL_EMAIL].strip()
        sec_email = row[COL_SEC_EMAIL].strip()
        name = row[COL_FULL].strip() or f"{row[COL_FIRST].strip()} {row[COL_LAST].strip()}".strip()
        company = row[COL_COMPANY].strip()
        source = row[COL_SOURCE].strip()
        sheet_row = i + 2
        invalid_rows.append({
            'idx': i, 'row': sheet_row, 'email': email, 'sec_email': sec_email,
            'name': name, 'company': company, 'source': source,
        })

    print(f"  Invalid emails: {len(invalid_rows)}")

    # --- PART 1: Secondary email swap ---
    print(f"\n--- Part 1: Secondary Email Swap ---")
    with_secondary = [r for r in invalid_rows if r['sec_email']]
    print(f"  Invalid with secondary email: {len(with_secondary)}")

    swap_updates = []
    swap_count = 0

    for r in with_secondary:
        sec_emails = [e.strip() for e in r['sec_email'].split(';') if e.strip()]
        for sec in sec_emails:
            status, reason = validate_email_debounce(sec)
            if status == 'Valid':
                print(f"  Row {r['row']}: SWAP {r['email']} → {sec} (Valid)")
                today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
                old_primary = r['email']
                swap_updates.extend([
                    {'range': f"'{TAB_NAME}'!D{r['row']}", 'values': [[sec]]},
                    {'range': f"'{TAB_NAME}'!H{r['row']}", 'values': [[old_primary]]},
                    {'range': f"'{TAB_NAME}'!X{r['row']}", 'values': [['Valid (Swapped)']]},
                    {'range': f"'{TAB_NAME}'!Y{r['row']}", 'values': [[f"deBounce {today} | Swapped from secondary; old primary ({old_primary}) was Invalid"]]},
                ])
                swap_count += 1
                break
            elif status == 'Accept-All (Risky)':
                # Still better than Invalid
                print(f"  Row {r['row']}: SWAP {r['email']} → {sec} (Accept-All, better than Invalid)")
                today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
                old_primary = r['email']
                swap_updates.extend([
                    {'range': f"'{TAB_NAME}'!D{r['row']}", 'values': [[sec]]},
                    {'range': f"'{TAB_NAME}'!H{r['row']}", 'values': [[old_primary]]},
                    {'range': f"'{TAB_NAME}'!X{r['row']}", 'values': [['Accept-All (Swapped)']]},
                    {'range': f"'{TAB_NAME}'!Y{r['row']}", 'values': [[f"deBounce {today} | Swapped from secondary; old primary ({old_primary}) was Invalid"]]},
                ])
                swap_count += 1
                break
            else:
                print(f"  Row {r['row']}: secondary {sec} is {status}, skipping")
            time.sleep(0.2)

    print(f"\n  Secondary swaps: {swap_count}")

    if not args.dry_run and swap_updates:
        token = get_access_token()
        for cs in range(0, len(swap_updates), 500):
            sheets_batch_update(token, swap_updates[cs:cs + 500])
        print(f"  Written {len(swap_updates)} cell updates")

    if args.skip_gemini:
        print("\n  Skipping Gemini OCR (--skip-gemini)")
        return

    # --- PART 2: Gemini OCR re-verification ---
    print(f"\n--- Part 2: Gemini OCR Re-Verification ---")

    # Find BlockFi-sourced invalid emails that might be OCR errors
    blockfi_invalid = [r for r in invalid_rows if r['source'] == 'BlockFi']
    print(f"  BlockFi-sourced invalid emails: {len(blockfi_invalid)}")

    # Map invalid emails to their source screenshots
    file_groups = {}  # filename → list of invalid email records
    unmatched = []
    for r in blockfi_invalid:
        email_lower = r['email'].lower()
        filename = email_to_file.get(email_lower)
        if filename:
            file_groups.setdefault(filename, []).append(r)
        else:
            # Try fuzzy match — email might have been fixed already
            unmatched.append(r)

    matched_count = sum(len(v) for v in file_groups.values())
    print(f"  Matched to screenshots: {matched_count} across {len(file_groups)} files")
    print(f"  Unmatched (no screenshot): {len(unmatched)}")

    # Process each screenshot with Gemini
    gemini_fixes = []
    processed_files = 0

    for filename, emails in sorted(file_groups.items()):
        # Check both regular and rotated paths
        img_path = UPLOADS_DIR / filename
        if not img_path.exists():
            img_path = UPLOADS_DIR / 'rotated' / filename
        if not img_path.exists():
            print(f"  SKIP {filename}: file not found")
            continue

        processed_files += 1
        print(f"  [{processed_files}/{len(file_groups)}] {filename} ({len(emails)} invalid emails)...")

        fixes = gemini_ocr_batch(img_path, emails)
        if fixes:
            for fix in fixes:
                fix['filename'] = filename
            gemini_fixes.extend(fixes)
            for fix in fixes:
                print(f"    Fix: Row {fix.get('row')}: {fix.get('old_email')} → {fix.get('new_email')} ({fix.get('confidence', '?')})")

        time.sleep(1)  # Rate limit Gemini calls

    print(f"\n  Gemini suggested {len(gemini_fixes)} fixes from {processed_files} screenshots")

    # Validate Gemini's suggested corrections via deBounce
    verified_fixes = []
    for fix in gemini_fixes:
        new_email = fix.get('new_email', '').strip()
        if not new_email or not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', new_email):
            print(f"  SKIP Row {fix.get('row')}: suggested email '{new_email}' fails syntax check")
            continue

        status, reason = validate_email_debounce(new_email)
        if status in ('Valid', 'Accept-All (Risky)'):
            print(f"  VERIFIED Row {fix['row']}: {fix['old_email']} → {new_email} ({status})")
            fix['validated_status'] = status
            verified_fixes.append(fix)
        else:
            print(f"  REJECTED Row {fix['row']}: {new_email} is {status}")
        time.sleep(0.2)

    print(f"\n  Verified fixes: {len(verified_fixes)}")

    # Apply verified fixes
    ocr_updates = []
    for fix in verified_fixes:
        row_num = fix['row']
        today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        status_str = fix['validated_status']
        if status_str == 'Accept-All (Risky)':
            status_str = 'Accept-All (OCR Fix)'
        else:
            status_str = 'Valid (OCR Fix)'
        ocr_updates.extend([
            {'range': f"'{TAB_NAME}'!D{row_num}", 'values': [[fix['new_email']]]},
            {'range': f"'{TAB_NAME}'!X{row_num}", 'values': [[status_str]]},
            {'range': f"'{TAB_NAME}'!Y{row_num}", 'values': [[f"deBounce {today} | OCR corrected from {fix['old_email']} via Gemini re-verification of {fix.get('filename', '?')}"]]},
        ])

    if not args.dry_run and ocr_updates:
        token = get_access_token()
        for cs in range(0, len(ocr_updates), 500):
            sheets_batch_update(token, ocr_updates[cs:cs + 500])
        print(f"  Written {len(ocr_updates)} cell updates for OCR fixes")

    # Save fix log
    log_path = PROJECT_ROOT / 'groups' / 'contacts' / 'logs' / 'email_fix_run.json'
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with open(log_path, 'w') as f:
        json.dump({
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'secondary_swaps': swap_count,
            'gemini_suggestions': len(gemini_fixes),
            'verified_fixes': len(verified_fixes),
            'fixes': verified_fixes,
            'dry_run': args.dry_run,
        }, f, indent=2)
    print(f"\n  Log saved to {log_path}")

    # Final summary
    print(f"\n=== Summary ===")
    print(f"  Secondary email swaps: {swap_count}")
    print(f"  OCR fixes (Gemini verified): {len(verified_fixes)}")
    print(f"  Total emails fixed: {swap_count + len(verified_fixes)}")


if __name__ == '__main__':
    main()
