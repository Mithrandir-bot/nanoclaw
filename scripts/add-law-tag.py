#!/usr/bin/env python3
"""
Add 'Law' tag to contacts at legal companies (law firms, legal practices, etc.).

Only tags based on Company name — NOT people with legal roles at non-legal companies.
Preserves existing tags — appends 'Law' if not already present.

Usage:
  DRY_RUN=1 python3 scripts/add-law-tag.py   # Preview only (default)
  DRY_RUN=0 python3 scripts/add-law-tag.py   # Apply changes
"""

import json
import os
import re
import urllib.request
import urllib.parse

SHEET_ID = os.environ.get('GOOGLE_CONTACTS_SHEET_ID', '1znTsVDzQe9m8xJHxlasy4uMjKtXwzYSn31TPWekOJPA')
DRY_RUN = os.environ.get('DRY_RUN', '1') != '0'

# Company names that are NOT legal companies despite matching keywords
COMPANY_EXCLUSIONS = [
    r'\bjd\.com\b',              # Chinese e-commerce
    r'\blegal\s*&\s*general\b',  # Insurance/asset management company
    r'\bd2 legal technology\b',  # Legal tech, not a law firm
    r'\blegalvision\b',          # Legal tech company
    r'\bthomson reuters\b',      # Media/data company
    r'^the lawyer hot 100',      # Award/ranking, not a company
    r'^legal,?\s*regulatory',    # LinkedIn headline, not a company
    r'blockchain.*web3.*legal$', # LinkedIn headline, not a company
    r'^rwa tokenization',        # LinkedIn headline, not a company
]

# Company-name patterns that identify legal companies
COMPANY_KEYWORDS = [
    r'\blaw\b',          # "law" in company name
    r'\blegal\b',        # "legal" in company name
    r'\battorney', r'\blawyer',
    r'\blitigat', r'\bjuris',
    r'\bpllc\b',         # professional LLC (almost always law firms)
    r'\besq\b',
]

# Known law firm name patterns
FIRM_PATTERNS = [
    r'\b\w+\s+law\s+(firm|group|office|practice)\b',
]

# Notes patterns that indicate the contact's COMPANY is a legal firm
# (catches cases where Company column is empty but notes mention a law firm)
NOTES_COMPANY_PATTERNS = [
    r'\blaw\s*(firm|group|office|practice|partners?)\b',
    r'\b\w+\s+law\s+llp\b',
    r'\battorney\s+at\s+law\b',
]

def get_token():
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

def is_company_excluded(company):
    """Check if company is in the exclusion list."""
    company_lower = (company or '').lower()
    for pattern in COMPANY_EXCLUSIONS:
        if re.search(pattern, company_lower):
            return True
    return False

def is_legal_company(company, notes=''):
    """Check if the COMPANY itself is a legal company (law firm, legal practice, etc.).
    Does NOT match people with legal roles at non-legal companies."""
    company_lower = (company or '').lower()
    notes_lower = (notes or '').lower()

    # Check company name (primary signal)
    if company_lower and not is_company_excluded(company):
        for pattern in COMPANY_KEYWORDS + FIRM_PATTERNS:
            if re.search(pattern, company_lower):
                return True

    # Check notes for law firm names (catches empty Company column cases)
    for pattern in NOTES_COMPANY_PATTERNS:
        if re.search(pattern, notes_lower):
            return True

    return False

def add_tag(existing_tags, new_tag):
    """Add a tag to existing comma-separated tags, avoiding duplicates."""
    if not existing_tags or not existing_tags.strip():
        return new_tag
    tags = [t.strip() for t in existing_tags.split(',')]
    if new_tag in tags:
        return existing_tags  # already present
    tags.append(new_tag)
    return ', '.join(tags)

def main():
    mode = "DRY RUN" if DRY_RUN else "LIVE"
    print(f"{'='*60}")
    print(f"ADD 'Law' TAG TO LEGAL CONTACTS — {mode}")
    print(f"{'='*60}\n")

    token = get_token()

    # Read headers first
    headers_data = sheets_get(token, 'Enriched Data!1:1')
    headers = headers_data.get('values', [[]])[0]
    print(f"Headers: {len(headers)} columns")

    # Find column indices
    col_map = {h: i for i, h in enumerate(headers)}
    company_idx = col_map.get('Company')
    title_idx = col_map.get('Title')
    tags_idx = col_map.get('Tags')
    name_idx = col_map.get('Full Name')
    notes_idx = col_map.get('Notes')

    if tags_idx is None:
        print("ERROR: Could not find 'Tags' column!")
        return

    print(f"Company col: {company_idx}, Title col: {title_idx}, Tags col: {tags_idx}, Notes col: {notes_idx}\n")

    # Fetch all data
    all_data = sheets_get(token, 'Enriched Data!A2:X')
    rows = all_data.get('values', [])
    print(f"Total contacts: {len(rows)}\n")

    def safe_get(row, idx):
        if idx is not None and idx < len(row):
            return row[idx]
        return ''

    updates = []
    matches = []

    for i, row in enumerate(rows):
        row_num = i + 2  # 1-indexed, skip header
        company = safe_get(row, company_idx)
        title = safe_get(row, title_idx)
        tags = safe_get(row, tags_idx)
        name = safe_get(row, name_idx)
        notes = safe_get(row, notes_idx)

        if is_legal_company(company, notes):
            new_tags = add_tag(tags, 'Law')
            if new_tags != tags:
                # Tags column is N (index 13, letter N)
                tag_letter = chr(ord('A') + tags_idx)
                updates.append({
                    'range': f"'Enriched Data'!{tag_letter}{row_num}",
                    'values': [[new_tags]]
                })
                # Determine match source
                match_source = []
                if is_legal_company(company, ''):
                    match_source.append('Company')
                if is_legal_company('', notes):
                    match_source.append('Notes')
                matches.append({
                    'row': row_num,
                    'name': name,
                    'company': company,
                    'title': title,
                    'notes': (notes or '')[:80],
                    'old_tags': tags,
                    'new_tags': new_tags,
                    'matched_on': '+'.join(match_source)
                })

    print(f"Legal contacts found: {len(matches)}")
    already_tagged = sum(1 for i, row in enumerate(rows)
                        if is_legal_company(safe_get(row, company_idx), safe_get(row, notes_idx))
                        and 'Law' in (safe_get(row, tags_idx) or ''))
    print(f"Already tagged with 'Law': {already_tagged}")
    print(f"To be updated: {len(updates)}\n")

    # Print all matches
    for m in matches:
        old = m['old_tags'] or '(none)'
        print(f"  Row {m['row']}: {m['name']} | {m['company']} | {m['title']} [matched: {m['matched_on']}]")
        if m.get('notes'):
            print(f"    Notes: {m['notes']}")
        print(f"    Tags: {old} → {m['new_tags']}")

    if not updates:
        print("\nNo updates needed.")
        return

    if DRY_RUN:
        print(f"\n[DRY RUN] Would update {len(updates)} rows. Set DRY_RUN=0 to apply.")
    else:
        # Batch in groups of 100
        for start in range(0, len(updates), 100):
            batch = updates[start:start+100]
            result = sheets_batch_update(token, batch)
            print(f"\nBatch {start//100 + 1}: updated {result.get('totalUpdatedCells', 0)} cells")
        print(f"\nDone! Updated {len(updates)} contacts with 'Law' tag.")

if __name__ == '__main__':
    main()
