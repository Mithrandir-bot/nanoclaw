#!/usr/bin/env python3
"""
Re-OCR File_088 (rotated spreadsheet with Current Rep column).
Rotates the image, sends to Gemini Flash with a rep-aware prompt,
and updates the OCR cache with rep data.
"""

import json
import os
import base64
import re
import urllib.request
from pathlib import Path
from PIL import Image
from io import BytesIO

OPENROUTER_API_KEY = os.environ['OPENROUTER_API_KEY']
UPLOADS_DIR = Path(__file__).parent.parent / 'groups' / 'contacts' / 'uploads'
OCR_CACHE_FILE = Path(__file__).parent.parent / 'groups' / 'contacts' / 'ocr_cache_blockfi.json'

image_path = UPLOADS_DIR / 'File_088.jpeg'

# Rotate image 90 degrees clockwise to make it readable
img = Image.open(image_path)
rotated = img.rotate(-90, expand=True)
buf = BytesIO()
rotated.save(buf, format='JPEG', quality=95)
img_data = base64.b64encode(buf.getvalue()).decode('utf-8')

prompt = """This is a rotated spreadsheet screenshot of BlockFi contacts. The columns are:
NAME, Email, Current Rep, Class, Action, Notes

Extract ALL rows as a JSON array. Each object should have:
- "name": full name (string or null)
- "email": email address (string, REQUIRED - skip rows without email)
- "current_rep": the Current Rep value (string or null)
- "class": the Class value (string or null)
- "action": the Action value (string or null)

Be VERY precise with email addresses — every character matters.
Return ONLY a JSON array, no other text."""

body = json.dumps({
    'model': 'google/gemini-2.0-flash-001',
    'messages': [
        {
            'role': 'user',
            'content': [
                {'type': 'image_url', 'image_url': {'url': f'data:image/jpeg;base64,{img_data}'}},
                {'type': 'text', 'text': prompt}
            ]
        }
    ],
    'temperature': 0,
    'max_tokens': 4096,
}).encode()

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

# Parse JSON
content = content.strip()
if content.startswith('```'):
    content = re.sub(r'^```(?:json)?\s*', '', content)
    content = re.sub(r'\s*```$', '', content)
match = re.search(r'\[.*\]', content, re.DOTALL)
if match:
    content = match.group(0)
content = content.replace('\u201c', '"').replace('\u201d', '"')
content = content.replace('\u2018', "'").replace('\u2019', "'")

contacts = json.loads(content)

print(f"Extracted {len(contacts)} contacts from File_088:")
for c in contacts:
    print(f"  {(c.get('name') or '?'):30s} | {(c.get('email') or '?'):40s} | Rep: {c.get('current_rep', '?')}")

# Update OCR cache
cache = json.loads(OCR_CACHE_FILE.read_text())
cache['File_088.jpeg'] = contacts
OCR_CACHE_FILE.write_text(json.dumps(cache, indent=2))
print(f"\nCache updated for File_088.jpeg")

# Build rep -> location mapping and save separately
REP_LOCATION = {
    'Jonathan Espinosa': 'United States',
    'John Malarney': 'United States',
    'Bryan Boder': 'United States',
    'Erin Self': 'United States',
    'Amin Araktingi': 'Europe',
    'Sahm Paymen': 'Europe',
    'Matthew Aman': 'Asia',
}

rep_map = {}  # email -> location
for c in contacts:
    email = (c.get('email') or '').strip().lower()
    rep = (c.get('current_rep') or '').strip()
    if email and rep:
        # Match rep to location
        for rep_name, location in REP_LOCATION.items():
            if rep_name.lower() in rep.lower():
                rep_map[email] = location
                break

rep_file = Path(__file__).parent.parent / 'groups' / 'contacts' / 'rep_location_map.json'
rep_file.write_text(json.dumps(rep_map, indent=2))
print(f"\nRep→Location map saved: {len(rep_map)} emails mapped")
for email, loc in rep_map.items():
    print(f"  {email} → {loc}")
