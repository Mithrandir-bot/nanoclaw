#!/usr/bin/env python3
"""
OCR BlockFi HubSpot screenshots using OpenRouter Gemini Flash.
Extracts emails, deduplicates against existing sheet, and imports with BlockFi metadata.

Usage:
  DRY_RUN=1 python3 scripts/ocr-blockfi-screenshots.py   # Preview (default)
  DRY_RUN=0 python3 scripts/ocr-blockfi-screenshots.py   # Apply changes
"""

import json
import os
import sys
import base64
import time
import re
import urllib.request
import urllib.parse
from pathlib import Path

SHEET_ID = os.environ.get('GOOGLE_CONTACTS_SHEET_ID', '1znTsVDzQe9m8xJHxlasy4uMjKtXwzYSn31TPWekOJPA')
OPENROUTER_API_KEY = os.environ['OPENROUTER_API_KEY']
DRY_RUN = os.environ.get('DRY_RUN', '1') != '0'
UPLOADS_DIR = Path(__file__).parent.parent / 'groups' / 'contacts' / 'uploads'
OCR_CACHE_FILE = Path(__file__).parent.parent / 'groups' / 'contacts' / 'ocr_cache_blockfi.json'
REP_LOCATION_FILE = Path(__file__).parent.parent / 'groups' / 'contacts' / 'rep_location_map.json'

# BlockFi metadata
BLOCKFI_META = {
    'category': 'Investor',
    'tags': 'Crypto, HNW',
    'relationship': 'Client',
    'source': 'BlockFi',
    'notes': 'BlockFi client from HubSpot',
}


def get_google_token():
    data = urllib.parse.urlencode({
        'client_id': os.environ['GOOGLE_CLIENT_ID'],
        'client_secret': os.environ['GOOGLE_CLIENT_SECRET'],
        'refresh_token': os.environ['GOOGLE_REFRESH_TOKEN'],
        'grant_type': 'refresh_token'
    }).encode()
    req = urllib.request.Request('https://oauth2.googleapis.com/token', data=data, method='POST')
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read())['access_token']


def sheets_get(token, range_str):
    encoded = urllib.parse.quote(range_str)
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/{encoded}"
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read())


def sheets_batch_update(token, updates):
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values:batchUpdate"
    body = json.dumps({
        'valueInputOption': 'RAW',
        'data': updates
    }).encode()
    req = urllib.request.Request(url, data=body, method='POST',
                                headers={'Authorization': f'Bearer {token}',
                                         'Content-Type': 'application/json'})
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read())


def sheets_append(token, range_str, rows):
    encoded = urllib.parse.quote(range_str)
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/{encoded}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS"
    body = json.dumps({'values': rows}).encode()
    req = urllib.request.Request(url, data=body, method='POST',
                                headers={'Authorization': f'Bearer {token}',
                                         'Content-Type': 'application/json'})
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read())


def ocr_screenshot(image_path, retries=3):
    """Send image to OpenRouter Gemini Flash for OCR extraction."""
    with open(image_path, 'rb') as f:
        img_data = base64.b64encode(f.read()).decode('utf-8')

    # Determine mime type
    ext = image_path.suffix.lower()
    mime = 'image/jpeg' if ext in ('.jpg', '.jpeg') else 'image/png'

    prompt = """Extract ALL contact rows from this HubSpot screenshot as JSON.
The image may be rotated 90 degrees - read it in whatever orientation the text is readable.
Return ONLY a JSON array. Each object should have these fields:
- "name": full name (string, or null if only email shown)
- "email": email address (string, REQUIRED - skip rows without email)
- "phone": phone number (string, or null)
- "country": country/region (string, or null)
- "company": primary company (string, or null)
- "current_rep": if a "Current Rep" column is visible, include the rep name (string, or null)

Be precise with email addresses - every character matters. If text is truncated with "...",
try to infer the full value from context but mark uncertain values with [OCR] prefix.
Return empty array [] if no contacts visible."""

    body = json.dumps({
        'model': 'google/gemini-2.0-flash-001',
        'messages': [
            {
                'role': 'user',
                'content': [
                    {'type': 'image_url', 'image_url': {'url': f'data:{mime};base64,{img_data}'}},
                    {'type': 'text', 'text': prompt}
                ]
            }
        ],
        'temperature': 0,
        'max_tokens': 4096,
    }).encode()

    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                'https://openrouter.ai/api/v1/chat/completions',
                data=body,
                method='POST',
                headers={
                    'Authorization': f'Bearer {OPENROUTER_API_KEY}',
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://nanoclaw.local',
                }
            )
            resp = urllib.request.urlopen(req, timeout=60)
            result = json.loads(resp.read())
            content = result['choices'][0]['message']['content']

            # Parse JSON from response (may be wrapped in ```json ... ```)
            content = content.strip()
            if content.startswith('```'):
                content = re.sub(r'^```(?:json)?\s*', '', content)
                content = re.sub(r'\s*```$', '', content)

            # Try to find JSON array in response
            match = re.search(r'\[.*\]', content, re.DOTALL)
            if match:
                content = match.group(0)

            # Fix smart quotes and other unicode issues
            content = content.replace('\u201c', '"').replace('\u201d', '"')
            content = content.replace('\u2018', "'").replace('\u2019', "'")
            content = content.replace('\u00a0', ' ')  # non-breaking space

            contacts = json.loads(content)
            return contacts
        except Exception as e:
            if attempt < retries - 1:
                print(f'  Retry {attempt + 1} for {image_path.name}: {e}')
                time.sleep(2 ** attempt)
            else:
                print(f'  FAILED {image_path.name}: {e}')
                return []


def main():
    mode = "DRY RUN" if DRY_RUN else "LIVE"
    print(f"{'='*70}")
    print(f"OCR BLOCKFI SCREENSHOTS & IMPORT — {mode}")
    print(f"{'='*70}\n")

    # --- Step 1: OCR all screenshots ---
    files = sorted([
        UPLOADS_DIR / f'File_{i:03d}.jpeg'
        for i in range(0, 181)
        if (UPLOADS_DIR / f'File_{i:03d}.jpeg').exists()
    ])
    print(f"Screenshots to process: {len(files)}")

    # Load cache if exists
    cache = {}
    if OCR_CACHE_FILE.exists():
        cache = json.loads(OCR_CACHE_FILE.read_text())
        print(f"Cache loaded: {len(cache)} files already OCR'd")

    all_contacts = []
    files_to_ocr = [f for f in files if f.name not in cache]
    print(f"Files needing OCR: {len(files_to_ocr)}\n")

    for i, fpath in enumerate(files_to_ocr):
        print(f"  OCR [{i+1}/{len(files_to_ocr)}] {fpath.name}...", end=' ', flush=True)
        contacts = ocr_screenshot(fpath)
        cache[fpath.name] = contacts
        print(f"{len(contacts)} contacts")

        # Save cache after each file
        OCR_CACHE_FILE.write_text(json.dumps(cache, indent=2))

        # Rate limit: ~2 req/sec for Gemini Flash
        if i < len(files_to_ocr) - 1:
            time.sleep(0.5)

    # Collect all contacts from cache
    for f in files:
        if f.name in cache:
            all_contacts.extend(cache[f.name])

    print(f"\nTotal contacts extracted: {len(all_contacts)}")

    # --- Step 2: Deduplicate extracted emails ---
    email_map = {}  # email -> contact info
    no_email = 0
    truncated = 0
    for c in all_contacts:
        email = (c.get('email') or '').strip().lower()
        if not email or email.startswith('['):
            no_email += 1
            continue
        # Skip truncated emails
        if '...' in email or email.endswith('.') or '@' not in email:
            truncated += 1
            continue
        # Clean email: strip plus-tags
        email_clean = re.sub(r'\+[^@]*@', '@', email)
        if email_clean not in email_map:
            email_map[email_clean] = c

    print(f"Unique emails: {len(email_map)}")
    print(f"Skipped (no email): {no_email}")
    print(f"Skipped (truncated): {truncated}")

    # --- Step 3: Fetch existing sheet data ---
    print("\nFetching existing sheet data...")
    token = get_google_token()

    headers_data = sheets_get(token, 'Enriched Data!1:1')
    headers = headers_data.get('values', [[]])[0]
    col_map = {h: i for i, h in enumerate(headers)}

    # Key column indices
    email_idx = col_map.get('Email')
    tags_idx = col_map.get('Tags')
    category_idx = col_map.get('Category')
    relationship_idx = col_map.get('Relationship')
    source_idx = col_map.get('Source')
    notes_idx = col_map.get('Notes')
    location_idx = col_map.get('Location')
    first_name_idx = col_map.get('First Name')
    last_name_idx = col_map.get('Last Name')
    full_name_idx = col_map.get('Full Name')
    date_idx = col_map.get('Date Added')

    all_data = sheets_get(token, 'Enriched Data!A2:X')
    rows = all_data.get('values', [])
    print(f"Existing contacts: {len(rows)}")

    # Build email -> row mapping
    existing_emails = {}  # email -> (row_num, row_data)
    for i, row in enumerate(rows):
        if email_idx < len(row) and row[email_idx]:
            e = row[email_idx].strip().lower()
            e_clean = re.sub(r'\+[^@]*@', '@', e)
            existing_emails[e_clean] = (i + 2, row)  # 1-indexed + header

    # --- Step 4: Classify as duplicate vs new ---
    duplicates = []  # (row_num, row_data, extracted_contact)
    new_contacts = []  # extracted_contact

    for email, contact in email_map.items():
        if email in existing_emails:
            row_num, row_data = existing_emails[email]
            duplicates.append((row_num, row_data, contact))
        else:
            new_contacts.append(contact)

    print(f"\nDuplicates (already in sheet): {len(duplicates)}")
    print(f"New contacts to add: {len(new_contacts)}")

    # --- Step 5: Build updates ---
    tag_updates = []  # For existing rows: add HNW and Crypto tags
    location_updates = []  # For existing rows: set location from rep map
    new_rows = []  # For new contacts: full rows with BlockFi metadata

    # Build rep → location map from OCR data + saved file
    REP_TO_LOCATION = {
        'Jonathan Espinosa': 'United States',
        'John Malarney': 'United States',
        'Bryan Boder': 'United States',
        'Erin Self': 'United States',
        'Amin Araktingi': 'Europe',
        'Sahm Paymen': 'Europe',
        'Matthew Aman': 'Asia',
    }
    rep_location = {}
    # From saved file
    if REP_LOCATION_FILE.exists():
        rep_location = json.loads(REP_LOCATION_FILE.read_text())
    # From OCR data (contacts that have current_rep field)
    for c in all_contacts:
        rep = (c.get('current_rep') or '').strip()
        email = (c.get('email') or '').strip().lower()
        if rep and email and '@' in email:
            email_clean = re.sub(r'\+[^@]*@', '@', email)
            for rep_name, location in REP_TO_LOCATION.items():
                if rep_name.lower() in rep.lower():
                    rep_location[email_clean] = location
                    break
    print(f"Rep→Location map: {len(rep_location)} emails mapped")

    def safe_get(row, idx):
        if idx is not None and idx < len(row):
            return row[idx]
        return ''

    def add_tags(existing_tags, new_tags_list):
        """Add tags to existing comma-separated tags, avoiding duplicates."""
        tag_list = [t.strip() for t in existing_tags.split(',') if t.strip()] if existing_tags else []
        changed = False
        for tag in new_tags_list:
            if tag not in tag_list:
                tag_list.append(tag)
                changed = True
        return ', '.join(tag_list), changed

    tag_letter = chr(ord('A') + tags_idx)
    location_letter = chr(ord('A') + location_idx) if location_idx is not None else None

    # Update existing rows: add HNW + Crypto tags + location from rep
    for row_num, row_data, contact in duplicates:
        tags = safe_get(row_data, tags_idx)
        new_tags, changed = add_tags(tags, ['Crypto', 'HNW'])
        if changed:
            tag_updates.append({
                'range': f"'Enriched Data'!{tag_letter}{row_num}",
                'values': [[new_tags]]
            })
        # Set location from rep map if not already set
        email = (contact.get('email') or '').strip().lower()
        email_clean = re.sub(r'\+[^@]*@', '@', email)
        existing_location = safe_get(row_data, location_idx)
        if not existing_location and email_clean in rep_location and location_letter:
            location_updates.append({
                'range': f"'Enriched Data'!{location_letter}{row_num}",
                'values': [[rep_location[email_clean]]]
            })

    print(f"\nExisting rows needing tag updates: {len(tag_updates)}")
    print(f"Existing rows needing location updates: {len(location_updates)}")

    # Build new rows
    num_cols = len(headers)
    for contact in new_contacts:
        row = [''] * num_cols
        email = (contact.get('email') or '').strip()
        name = contact.get('name') or ''

        # Parse name
        if name and not name.startswith('['):
            parts = name.strip().split(None, 1)
            if len(parts) >= 2:
                row[first_name_idx] = parts[0]
                row[last_name_idx] = parts[1]
                row[full_name_idx] = name.strip()
            elif len(parts) == 1:
                row[first_name_idx] = parts[0]
                row[full_name_idx] = parts[0]

        row[email_idx] = email
        row[category_idx] = BLOCKFI_META['category']
        row[tags_idx] = BLOCKFI_META['tags']
        row[relationship_idx] = BLOCKFI_META['relationship']
        row[source_idx] = BLOCKFI_META['source']
        row[notes_idx] = BLOCKFI_META['notes']
        if date_idx is not None:
            row[date_idx] = '2026-03-08'
        # Set location from rep map
        email_clean = re.sub(r'\+[^@]*@', '@', email.lower())
        if location_idx is not None and email_clean in rep_location:
            row[location_idx] = rep_location[email_clean]
        new_rows.append(row)

    # --- Step 6: Print summary ---
    print(f"\n{'='*70}")
    print(f"SUMMARY")
    print(f"{'='*70}")
    print(f"Screenshots processed: {len(files)}")
    print(f"Total emails extracted: {len(email_map)}")
    print(f"Duplicates found: {len(duplicates)}")
    print(f"  - Need tag updates: {len(tag_updates)}")
    print(f"  - Need location updates: {len(location_updates)}")
    print(f"New contacts to add: {len(new_contacts)}")

    if new_contacts:
        print(f"\nNew contacts (first 20):")
        for c in new_contacts[:20]:
            print(f"  {c.get('name', '?')} | {c.get('email', '?')}")
        if len(new_contacts) > 20:
            print(f"  ... and {len(new_contacts) - 20} more")

    # --- Step 7: Apply ---
    if DRY_RUN:
        print(f"\n[DRY RUN] Would update {len(tag_updates)} tag rows, {len(location_updates)} location rows, and add {len(new_rows)} new rows.")
        print("Set DRY_RUN=0 to apply.")
    else:
        if tag_updates:
            for start in range(0, len(tag_updates), 100):
                batch = tag_updates[start:start+100]
                result = sheets_batch_update(token, batch)
                print(f"\nTag batch {start//100+1}: updated {result.get('totalUpdatedCells', 0)} cells")

        if location_updates:
            for start in range(0, len(location_updates), 100):
                batch = location_updates[start:start+100]
                result = sheets_batch_update(token, batch)
                print(f"\nLocation batch {start//100+1}: updated {result.get('totalUpdatedCells', 0)} cells")

        if new_rows:
            result = sheets_append(token, 'Enriched Data!A:X', new_rows)
            updated = result.get('updates', {})
            print(f"\nAppended {updated.get('updatedRows', 0)} new rows")

        print(f"\nDone! Updated {len(tag_updates)} tags + {len(location_updates)} locations + added {len(new_rows)} new contacts.")


if __name__ == '__main__':
    main()
