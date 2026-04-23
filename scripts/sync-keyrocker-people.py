#!/usr/bin/env python3
"""
sync-keyrocker-people.py

Deterministic one-way sync: Keyrocker work-vault People notes -> Mithrandir
Google Contacts Sheet ("Enriched Data" tab).

Replaces the LLM-driven scheduled task `task-keyrocker-contacts-sync` which
created duplicate rows (matcher missed existing rows in 11k-row sheet) and
corrupted Title fields with `**` markdown bold leakage.

Behavior:
- Reads all *.md files in keyrocker vault People/
- Parses YAML frontmatter properly + body fields via explicit regex
- Strips markdown formatting (`**`, `*`) from extracted values
- Matches existing rows by (a) LinkedIn URL exact match, then (b) normalized Full Name
- Enrich-only: never overwrites non-empty sheet fields
- Appends new row only when no match found by either key
- Mirrors file to /root/obsidian-vault/People/Keyrock/

Run:
  ./scripts/sync-keyrocker-people.py            # apply
  ./scripts/sync-keyrocker-people.py --dry-run  # show diff, no writes
"""
import argparse
import json
import os
import re
import shutil
import sys
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

VAULT = Path(os.environ.get('KEYROCK_VAULT', '/root/obsidian-vault-keyrock')) / 'People'
MIRROR = Path(os.environ.get('OBSIDIAN_VAULT', '/root/obsidian-vault')) / 'People' / 'Keyrock'
TAB = 'Enriched Data'
TODAY = date.today().isoformat()

COLS = ['First Name', 'Last Name', 'Full Name', 'Company', 'Title', 'Email',
        'Secondary Email', 'Mobile', 'Secondary Phone', 'Telegram', 'Twitter URL',
        'LinkedIn URL', 'Tags', 'Category', 'Relationship', 'Source', 'Location',
        'Notes', 'Date Added', 'Enrichment Status', 'Last Enriched',
        'Enrichment Source', 'Enrichment Notes', 'Email Status', 'Email Status Detail']
COL_IDX = {c: i for i, c in enumerate(COLS)}


def env(k):
    v = os.environ.get(k)
    if v:
        return v
    for line in Path(os.environ.get('NANOCLAW_ENV', '/root/nanoclaw/nanoclaw/.env')).read_text().splitlines():
        if line.startswith(f'{k}='):
            return line.split('=', 1)[1].strip()
    raise SystemExit(f'Missing env {k}')


def get_token():
    data = urllib.parse.urlencode({
        'client_id': env('GOOGLE_CLIENT_ID'),
        'client_secret': env('GOOGLE_CLIENT_SECRET'),
        'refresh_token': env('GOOGLE_REFRESH_TOKEN'),
        'grant_type': 'refresh_token',
    }).encode()
    return json.loads(urllib.request.urlopen(urllib.request.Request(
        'https://oauth2.googleapis.com/token', data=data, method='POST')).read())['access_token']


def api(path, method='GET', body=None, token=None):
    url = f'https://sheets.googleapis.com/v4/spreadsheets/{env("GOOGLE_CONTACTS_SHEET_ID")}{path}'
    headers = {'Authorization': f'Bearer {token}'}
    data = None
    if body is not None:
        headers['Content-Type'] = 'application/json'
        data = json.dumps(body).encode()
    return json.loads(urllib.request.urlopen(urllib.request.Request(url, data=data, method=method, headers=headers)).read())


def norm(s):
    return re.sub(r'[^a-z]', '', (s or '').lower())


def strip_md(s):
    """Strip markdown bold/italic and trim. Handles `**X**`, `*X*`, leading/trailing `**`."""
    if not s:
        return ''
    s = s.strip()
    # Strip wrapping markdown: **X**, *X*, __X__, _X_
    s = re.sub(r'^\*{1,2}([^*]*)\*{1,2}$', r'\1', s)
    s = re.sub(r'^_{1,2}([^_]*)_{1,2}$', r'\1', s)
    # Strip leading/trailing stray `**` or `*` (the bug we saw)
    s = re.sub(r'^\*+\s*', '', s)
    s = re.sub(r'\s*\*+$', '', s)
    return s.strip()


def parse_note(path):
    """Parse a Keyrocker People .md file. Returns dict of normalized fields."""
    text = path.read_text(errors='ignore')
    fm = {}
    body = text
    if text.startswith('---\n'):
        end = text.find('\n---', 4)
        if end > 0:
            for line in text[4:end].splitlines():
                if ':' in line:
                    k, v = line.split(':', 1)
                    fm[k.strip().lower()] = strip_md(v.strip())
            body = text[end + 4:]

    def grab(pattern, group=1, src=body):
        m = re.search(pattern, src, re.IGNORECASE | re.MULTILINE)
        return strip_md(m.group(group)) if m else ''

    # Title: handle `**Title:** X` and `- **Title:** X` and `Title: X`
    title = grab(r'(?:^-\s*)?\*{0,2}Title:?\*{0,2}\s*([^\n]+)') or fm.get('title', '')
    company = grab(r'(?:^-\s*)?\*{0,2}Company:?\*{0,2}\s*([^\n]+)') or fm.get('company', '') or fm.get('firm', '')
    location = grab(r'(?:^-\s*)?\*{0,2}Location:?\*{0,2}\s*([^\n]+)') or fm.get('location', '')
    linkedin = grab(r'(https?://(?:[\w-]+\.)?linkedin\.com/in/[^\s\)\]>"]+)')
    twitter = grab(r'(https?://(?:www\.|x\.com|twitter\.com)[^\s\)\]>"]+)') if 'twitter' in body.lower() or 'x.com' in body.lower() else ''

    # Filename -> name
    raw_name = path.stem.replace('-', ' ').strip()
    parts = raw_name.split()
    first = parts[0] if parts else ''
    last = ' '.join(parts[1:]) if len(parts) > 1 else ''
    full = raw_name

    return {
        'first': first, 'last': last, 'full': full,
        'company': company, 'title': title, 'location': location,
        'linkedin': linkedin, 'twitter': twitter,
        'is_stub': len(body.strip().splitlines()) < 3 or fm.get('status') == 'stub',
        'has_last_name': bool(last),
        'path': str(path),
    }


def col_letter(i):
    s = ''; i += 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def find_match(note, by_linkedin, by_full_name):
    """Find existing sheet row index (1-based) for this note, or None."""
    if note['linkedin']:
        # Strict canonicalization for LinkedIn URLs (lowercase + strip query string + trailing slash)
        canon = re.sub(r'\?.*$', '', note['linkedin'].lower()).rstrip('/')
        if canon in by_linkedin:
            return by_linkedin[canon]
    if note['has_last_name']:
        nf = norm(note['full'])
        if nf in by_full_name:
            return by_full_name[nf]
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true', help='Show diff, no sheet writes')
    ap.add_argument('--no-mirror', action='store_true', help='Skip mirror copy to main vault')
    args = ap.parse_args()

    if not VAULT.exists():
        print(f'ERROR: keyrocker vault not found at {VAULT}', file=sys.stderr)
        return 2

    token = get_token()
    notes = [parse_note(p) for p in sorted(VAULT.glob('*.md'))]
    print(f'Loaded {len(notes)} People notes from {VAULT}')

    # Pull sheet
    rows = api(f'/values/{urllib.parse.quote(TAB)}!A1:Y?majorDimension=ROWS', token=token)['values']
    print(f'Sheet has {len(rows)-1} contacts in {TAB}')

    # Build indexes (skip header row)
    by_linkedin = {}
    by_full_name = {}
    for i, r in enumerate(rows[1:], start=2):
        full = (r[COL_IDX['Full Name']] if len(r) > COL_IDX['Full Name'] else '').strip()
        if not full:
            full = f"{r[0] if r else ''} {r[1] if len(r) > 1 else ''}".strip()
        if full:
            nf = norm(full)
            by_full_name.setdefault(nf, i)  # keep first match (lowest row idx)
        li = (r[COL_IDX['LinkedIn URL']] if len(r) > COL_IDX['LinkedIn URL'] else '').strip()
        if li:
            canon = re.sub(r'\?.*$', '', li.lower()).rstrip('/')
            by_linkedin.setdefault(canon, i)

    # Decide actions
    actions = []  # list of dicts: {kind: 'append'|'enrich'|'skip', note, row?, fields_to_set?}
    for n in notes:
        if not n['has_last_name']:
            actions.append({'kind': 'skip', 'note': n, 'reason': 'no last name'})
            continue
        if n['is_stub']:
            actions.append({'kind': 'skip', 'note': n, 'reason': 'stub'})
            continue
        match_row = find_match(n, by_linkedin, by_full_name)
        if match_row:
            sheet_row = rows[match_row - 1]
            updates = {}
            # Enrich only — never overwrite non-empty
            for vault_field, sheet_col in [('company', 'Company'), ('title', 'Title'),
                                            ('linkedin', 'LinkedIn URL'), ('location', 'Location')]:
                if not n[vault_field]:
                    continue
                cur = sheet_row[COL_IDX[sheet_col]] if len(sheet_row) > COL_IDX[sheet_col] else ''
                if not cur.strip():
                    updates[sheet_col] = n[vault_field]
            updates['Last Enriched'] = TODAY
            updates['Enrichment Source'] = 'Keyrocker Vault Sync (deterministic)'
            actions.append({'kind': 'enrich', 'note': n, 'row': match_row, 'fields': updates})
        else:
            actions.append({'kind': 'append', 'note': n})

    # Print summary
    by_kind = {}
    for a in actions:
        by_kind.setdefault(a['kind'], []).append(a)
    print(f'\n=== Plan ===')
    print(f'  Append (new contacts): {len(by_kind.get("append", []))}')
    print(f'  Enrich (existing):     {len(by_kind.get("enrich", []))}')
    print(f'  Skip:                  {len(by_kind.get("skip", []))}')

    if args.dry_run:
        print(f'\n=== Append samples (first 5) ===')
        for a in by_kind.get('append', [])[:5]:
            n = a['note']
            print(f"  + {n['full']:30s} | company={n['company'][:25]:25s} | li={'yes' if n['linkedin'] else 'no'}")
        print(f'\n=== Enrich samples (first 5 with actual updates) ===')
        for a in by_kind.get('enrich', [])[:10]:
            non_meta = {k: v for k, v in a['fields'].items() if k not in ('Last Enriched', 'Enrichment Source')}
            if non_meta:
                print(f"  ~ row {a['row']:5d} {a['note']['full']:30s} {non_meta}")
        print('\n(dry-run — no writes)')
        return 0

    # === Apply ===
    # 1. Enrich existing rows via batchUpdate
    enrich_payload = []
    for a in by_kind.get('enrich', []):
        for col, val in a['fields'].items():
            cell = f"{TAB}!{col_letter(COL_IDX[col])}{a['row']}"
            enrich_payload.append({'range': cell, 'values': [[val]]})
    if enrich_payload:
        # Batch in chunks of 100 to avoid request size limits
        for chunk_start in range(0, len(enrich_payload), 100):
            chunk = enrich_payload[chunk_start:chunk_start + 100]
            api('/values:batchUpdate', method='POST', body={'valueInputOption': 'RAW', 'data': chunk}, token=token)
        print(f'\nEnriched {len(enrich_payload)} cells across {len(by_kind.get("enrich", []))} rows')

    # 2. Append new rows
    if by_kind.get('append'):
        new_values = []
        for a in by_kind['append']:
            n = a['note']
            row = [''] * len(COLS)
            row[COL_IDX['First Name']] = n['first']
            row[COL_IDX['Last Name']] = n['last']
            row[COL_IDX['Full Name']] = n['full']
            row[COL_IDX['Company']] = n['company'] or 'Keyrock'
            row[COL_IDX['Title']] = n['title']
            row[COL_IDX['LinkedIn URL']] = n['linkedin']
            row[COL_IDX['Location']] = n['location']
            row[COL_IDX['Tags']] = 'Keyrock, Institutional'
            row[COL_IDX['Category']] = 'Professional'
            row[COL_IDX['Relationship']] = 'Colleague'
            row[COL_IDX['Source']] = 'Keyrocker Vault'
            row[COL_IDX['Date Added']] = TODAY
            row[COL_IDX['Enrichment Source']] = 'Keyrocker Vault Sync (deterministic)'
            row[COL_IDX['Last Enriched']] = TODAY
            new_values.append(row)
        api(f'/values/{urllib.parse.quote(TAB)}!A:Y:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',
            method='POST', body={'values': new_values}, token=token)
        print(f'Appended {len(new_values)} new contacts')

    # 3. Mirror files to main vault
    if not args.no_mirror:
        MIRROR.mkdir(parents=True, exist_ok=True)
        copied = 0
        for n in notes:
            if n['is_stub']:
                continue
            dst = MIRROR / Path(n['path']).name
            src = Path(n['path'])
            if not dst.exists() or dst.read_bytes() != src.read_bytes():
                shutil.copy2(src, dst)
                copied += 1
        print(f'Mirrored {copied} files to {MIRROR}')

    print('\nDone.')


if __name__ == '__main__':
    sys.exit(main() or 0)
