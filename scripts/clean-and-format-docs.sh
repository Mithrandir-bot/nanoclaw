#!/usr/bin/env bash
# Clean markdown syntax and apply professional formatting to all Google Docs
# Strips YAML frontmatter, markdown characters, and applies rich formatting
set -euo pipefail

cd /root/nanoclaw/nanoclaw
source .env

ACCESS_TOKEN=$(curl -s -X POST https://oauth2.googleapis.com/token \
  -d "client_id=$GOOGLE_CLIENT_ID&client_secret=$GOOGLE_CLIENT_SECRET&refresh_token=$GOOGLE_REFRESH_TOKEN&grant_type=refresh_token" | jq -r '.access_token')
TOKEN_TIME=$(date +%s)

maybe_refresh() {
  local now=$(date +%s)
  if (( now - TOKEN_TIME > 3000 )); then
    ACCESS_TOKEN=$(curl -s -X POST https://oauth2.googleapis.com/token \
      -d "client_id=$GOOGLE_CLIENT_ID&client_secret=$GOOGLE_CLIENT_SECRET&refresh_token=$GOOGLE_REFRESH_TOKEN&grant_type=refresh_token" | jq -r '.access_token')
    TOKEN_TIME=$now
  fi
}

# Preprocess markdown: strip YAML, clean syntax, produce clean text
preprocess_md() {
  local file="$1"
  python3 -c "
import re, sys

with open('$file', 'r') as f:
    content = f.read()

# Strip YAML frontmatter
content = re.sub(r'^---\n[\s\S]*?\n---\n*', '', content)

# Don't strip markdown — we'll let Google Docs API handle it via the formatting script
# But DO clean up some artifacts
content = content.strip()

print(content)
"
}

# Upload a preprocessed markdown file as Google Doc with clean content
upload_clean() {
  local file="$1" folder="$2" name="${3:-}"
  [ ! -f "$file" ] && return 1
  local size=$(stat -c%s "$file" 2>/dev/null || echo 0)
  [ "$size" -lt 10 ] && return 1
  [ -z "$name" ] && name=$(basename "$file" .md)

  maybe_refresh

  # Preprocess: strip YAML frontmatter
  local clean_content
  clean_content=$(preprocess_md "$file")
  [ -z "$clean_content" ] && return 1

  # Write to temp file
  local tmpfile=$(mktemp)
  echo "$clean_content" > "$tmpfile"

  # Check if exists
  local existing=$(curl -s "https://www.googleapis.com/drive/v3/files?q=name='${name}'+and+'${folder}'+in+parents+and+trashed=false&fields=files(id)" \
    -H "Authorization: Bearer $ACCESS_TOKEN" | jq -r '.files[0].id // empty')

  local doc_id=""
  if [ -n "$existing" ]; then
    # Delete and recreate (update doesn't re-parse content well)
    curl -s -X PATCH "https://www.googleapis.com/drive/v3/files/$existing" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"trashed":true}' > /dev/null
    sleep 0.2
  fi

  # Create new doc
  doc_id=$(curl -s -X POST "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -F "metadata={\"name\":\"${name}\",\"mimeType\":\"application/vnd.google-apps.document\",\"parents\":[\"${folder}\"]};type=application/json" \
    -F "file=@${tmpfile};type=text/plain" | jq -r '.id // empty')

  rm -f "$tmpfile"

  if [ -z "$doc_id" ]; then
    echo "  FAIL: $name"
    return 1
  fi

  # Now apply formatting via Docs API
  sleep 0.3
  format_doc "$doc_id" "$name"
}

format_doc() {
  local doc_id="$1" doc_name="$2"
  maybe_refresh

  # Get document structure
  local doc_json=$(curl -s "https://docs.googleapis.com/v1/documents/${doc_id}" \
    -H "Authorization: Bearer $ACCESS_TOKEN")

  # Build formatting requests with python for better parsing
  local requests=$(python3 << 'PYEOF'
import json, sys, re

doc = json.loads('''DOCJSON'''.replace("'''",""))
requests = []

if not doc.get('body', {}).get('content'):
    print('[]')
    sys.exit(0)

ACCENT = {"red": 0.37, "green": 0.41, "blue": 0.82}
DARK = {"red": 0.12, "green": 0.12, "blue": 0.14}
GRAY = {"red": 0.42, "green": 0.42, "blue": 0.46}
LIGHT_BG = {"red": 0.96, "green": 0.97, "blue": 0.98}

for element in doc['body']['content']:
    if 'paragraph' not in element:
        continue
    para = element['paragraph']
    start = element.get('startIndex', 0)
    end = element.get('endIndex', start)
    if start >= end:
        continue

    text = ''.join(e.get('textRun', {}).get('content', '') for e in para.get('elements', []))

    # Heading detection
    if text.startswith('# ') and not text.startswith('## '):
        requests.append({"updateParagraphStyle": {"range": {"startIndex": start, "endIndex": end}, "paragraphStyle": {"namedStyleType": "HEADING_1", "spaceAbove": {"magnitude": 24, "unit": "PT"}, "spaceBelow": {"magnitude": 10, "unit": "PT"}}, "fields": "namedStyleType,spaceAbove,spaceBelow"}})
        requests.append({"updateTextStyle": {"range": {"startIndex": start, "endIndex": end}, "textStyle": {"bold": True, "fontSize": {"magnitude": 22, "unit": "PT"}, "foregroundColor": {"color": {"rgbColor": ACCENT}}, "weightedFontFamily": {"fontFamily": "Source Sans Pro", "weight": 700}}, "fields": "bold,fontSize,foregroundColor,weightedFontFamily"}})
        # Remove "# " prefix
        requests.append({"deleteContentRange": {"range": {"startIndex": start, "endIndex": start + 2}}})
    elif text.startswith('## ') and not text.startswith('### '):
        requests.append({"updateParagraphStyle": {"range": {"startIndex": start, "endIndex": end}, "paragraphStyle": {"namedStyleType": "HEADING_2", "spaceAbove": {"magnitude": 20, "unit": "PT"}, "spaceBelow": {"magnitude": 8, "unit": "PT"}, "borderBottom": {"color": {"color": {"rgbColor": {"red": 0.9, "green": 0.9, "blue": 0.92}}}, "width": {"magnitude": 1, "unit": "PT"}, "padding": {"magnitude": 6, "unit": "PT"}, "dashStyle": "SOLID"}}, "fields": "namedStyleType,spaceAbove,spaceBelow,borderBottom"}})
        requests.append({"updateTextStyle": {"range": {"startIndex": start, "endIndex": end}, "textStyle": {"bold": True, "fontSize": {"magnitude": 16, "unit": "PT"}, "foregroundColor": {"color": {"rgbColor": DARK}}, "weightedFontFamily": {"fontFamily": "Source Sans Pro", "weight": 600}}, "fields": "bold,fontSize,foregroundColor,weightedFontFamily"}})
        requests.append({"deleteContentRange": {"range": {"startIndex": start, "endIndex": start + 3}}})
    elif text.startswith('### '):
        requests.append({"updateParagraphStyle": {"range": {"startIndex": start, "endIndex": end}, "paragraphStyle": {"namedStyleType": "HEADING_3", "spaceAbove": {"magnitude": 14, "unit": "PT"}, "spaceBelow": {"magnitude": 4, "unit": "PT"}}, "fields": "namedStyleType,spaceAbove,spaceBelow"}})
        requests.append({"updateTextStyle": {"range": {"startIndex": start, "endIndex": end}, "textStyle": {"bold": True, "fontSize": {"magnitude": 13, "unit": "PT"}, "foregroundColor": {"color": {"rgbColor": GRAY}}, "weightedFontFamily": {"fontFamily": "Source Sans Pro", "weight": 600}}, "fields": "bold,fontSize,foregroundColor,weightedFontFamily"}})
        requests.append({"deleteContentRange": {"range": {"startIndex": start, "endIndex": start + 4}}})
    elif text.strip() == '---':
        # Replace --- with horizontal rule would need insert, skip for now - just hide it
        requests.append({"updateTextStyle": {"range": {"startIndex": start, "endIndex": end}, "textStyle": {"fontSize": {"magnitude": 2, "unit": "PT"}, "foregroundColor": {"color": {"rgbColor": {"red": 0.85, "green": 0.85, "blue": 0.87}}}}, "fields": "fontSize,foregroundColor"}})
    else:
        # Body text
        requests.append({"updateTextStyle": {"range": {"startIndex": start, "endIndex": end}, "textStyle": {"fontSize": {"magnitude": 11, "unit": "PT"}, "weightedFontFamily": {"fontFamily": "Source Sans Pro", "weight": 400}}, "fields": "fontSize,weightedFontFamily"}})

    # Process inline formatting within elements
    for el in para.get('elements', []):
        content = el.get('textRun', {}).get('content', '')
        if not content:
            continue
        el_start = el.get('startIndex', 0)

        # Bold **text**
        for m in re.finditer(r'\*\*([^*]+)\*\*', content):
            s = el_start + m.start()
            e = el_start + m.end()
            requests.append({"updateTextStyle": {"range": {"startIndex": s, "endIndex": e}, "textStyle": {"bold": True}, "fields": "bold"}})

        # Links [text](url)
        for m in re.finditer(r'\[([^\]]+)\]\(([^)]+)\)', content):
            s = el_start + m.start()
            e = el_start + m.end()
            requests.append({"updateTextStyle": {"range": {"startIndex": s, "endIndex": e}, "textStyle": {"link": {"url": m.group(2)}, "foregroundColor": {"color": {"rgbColor": ACCENT}}, "underline": True}, "fields": "link,foregroundColor,underline"}})

        # Inline code
        for m in re.finditer(r'`([^`]+)`', content):
            s = el_start + m.start()
            e = el_start + m.end()
            requests.append({"updateTextStyle": {"range": {"startIndex": s, "endIndex": e}, "textStyle": {"weightedFontFamily": {"fontFamily": "Roboto Mono", "weight": 400}, "backgroundColor": {"color": {"rgbColor": LIGHT_BG}}, "fontSize": {"magnitude": 10, "unit": "PT"}}, "fields": "weightedFontFamily,backgroundColor,fontSize"}})

# CRITICAL: sort requests so deleteContentRange runs in reverse order (highest index first)
# Otherwise deleting earlier text shifts indices for later operations
# Separate deletes from style updates
deletes = [r for r in requests if 'deleteContentRange' in r]
styles = [r for r in requests if 'deleteContentRange' not in r]

# Sort deletes by startIndex descending
deletes.sort(key=lambda r: r['deleteContentRange']['range']['startIndex'], reverse=True)

# Styles first, then deletes (reverse order)
final = styles + deletes
print(json.dumps(final))
PYEOF
)

  # Replace the placeholder with actual doc JSON
  requests=$(echo "$requests" | sed "s|DOCJSON|$(echo "$doc_json" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")|g" 2>/dev/null)

  # Actually, the python heredoc approach won't work with embedded JSON. Let me use a temp file approach
  echo "$doc_json" > /tmp/doc_format_input.json

  requests=$(python3 << 'PYEOF2'
import json, re

with open('/tmp/doc_format_input.json') as f:
    doc = json.load(f)

requests = []
if not doc.get('body', {}).get('content'):
    print('[]')
    exit()

ACCENT = {"red": 0.37, "green": 0.41, "blue": 0.82}
DARK = {"red": 0.12, "green": 0.12, "blue": 0.14}
GRAY = {"red": 0.42, "green": 0.42, "blue": 0.46}
LIGHT_BG = {"red": 0.96, "green": 0.97, "blue": 0.98}

for element in doc['body']['content']:
    if 'paragraph' not in element:
        continue
    para = element['paragraph']
    start = element.get('startIndex', 0)
    end = element.get('endIndex', start)
    if start >= end:
        continue

    text = ''.join(e.get('textRun', {}).get('content', '') for e in para.get('elements', []))

    if text.startswith('# ') and not text.startswith('## '):
        requests.append({"updateParagraphStyle": {"range": {"startIndex": start, "endIndex": end}, "paragraphStyle": {"namedStyleType": "HEADING_1", "spaceAbove": {"magnitude": 24, "unit": "PT"}, "spaceBelow": {"magnitude": 10, "unit": "PT"}}, "fields": "namedStyleType,spaceAbove,spaceBelow"}})
        requests.append({"updateTextStyle": {"range": {"startIndex": start, "endIndex": end}, "textStyle": {"bold": True, "fontSize": {"magnitude": 22, "unit": "PT"}, "foregroundColor": {"color": {"rgbColor": ACCENT}}, "weightedFontFamily": {"fontFamily": "Source Sans Pro", "weight": 700}}, "fields": "bold,fontSize,foregroundColor,weightedFontFamily"}})
        requests.append({"deleteContentRange": {"range": {"startIndex": start, "endIndex": start + 2}}})
    elif text.startswith('### '):
        requests.append({"updateParagraphStyle": {"range": {"startIndex": start, "endIndex": end}, "paragraphStyle": {"namedStyleType": "HEADING_3", "spaceAbove": {"magnitude": 14, "unit": "PT"}, "spaceBelow": {"magnitude": 4, "unit": "PT"}}, "fields": "namedStyleType,spaceAbove,spaceBelow"}})
        requests.append({"updateTextStyle": {"range": {"startIndex": start, "endIndex": end}, "textStyle": {"bold": True, "fontSize": {"magnitude": 13, "unit": "PT"}, "foregroundColor": {"color": {"rgbColor": GRAY}}, "weightedFontFamily": {"fontFamily": "Source Sans Pro", "weight": 600}}, "fields": "bold,fontSize,foregroundColor,weightedFontFamily"}})
        requests.append({"deleteContentRange": {"range": {"startIndex": start, "endIndex": start + 4}}})
    elif text.startswith('## '):
        requests.append({"updateParagraphStyle": {"range": {"startIndex": start, "endIndex": end}, "paragraphStyle": {"namedStyleType": "HEADING_2", "spaceAbove": {"magnitude": 20, "unit": "PT"}, "spaceBelow": {"magnitude": 8, "unit": "PT"}, "borderBottom": {"color": {"color": {"rgbColor": {"red": 0.9, "green": 0.9, "blue": 0.92}}}, "width": {"magnitude": 1, "unit": "PT"}, "padding": {"magnitude": 6, "unit": "PT"}, "dashStyle": "SOLID"}}, "fields": "namedStyleType,spaceAbove,spaceBelow,borderBottom"}})
        requests.append({"updateTextStyle": {"range": {"startIndex": start, "endIndex": end}, "textStyle": {"bold": True, "fontSize": {"magnitude": 16, "unit": "PT"}, "foregroundColor": {"color": {"rgbColor": DARK}}, "weightedFontFamily": {"fontFamily": "Source Sans Pro", "weight": 600}}, "fields": "bold,fontSize,foregroundColor,weightedFontFamily"}})
        requests.append({"deleteContentRange": {"range": {"startIndex": start, "endIndex": start + 3}}})
    elif text.strip() == '---':
        requests.append({"updateTextStyle": {"range": {"startIndex": start, "endIndex": end}, "textStyle": {"fontSize": {"magnitude": 2, "unit": "PT"}, "foregroundColor": {"color": {"rgbColor": {"red": 0.85, "green": 0.85, "blue": 0.87}}}}, "fields": "fontSize,foregroundColor"}})
    else:
        requests.append({"updateTextStyle": {"range": {"startIndex": start, "endIndex": end}, "textStyle": {"fontSize": {"magnitude": 11, "unit": "PT"}, "weightedFontFamily": {"fontFamily": "Source Sans Pro", "weight": 400}}, "fields": "fontSize,weightedFontFamily"}})

    for el in para.get('elements', []):
        content = el.get('textRun', {}).get('content', '')
        if not content: continue
        el_start = el.get('startIndex', 0)
        for m in re.finditer(r'\*\*([^*]+)\*\*', content):
            requests.append({"updateTextStyle": {"range": {"startIndex": el_start + m.start(), "endIndex": el_start + m.end()}, "textStyle": {"bold": True}, "fields": "bold"}})
        for m in re.finditer(r'\[([^\]]+)\]\(([^)]+)\)', content):
            requests.append({"updateTextStyle": {"range": {"startIndex": el_start + m.start(), "endIndex": el_start + m.end()}, "textStyle": {"link": {"url": m.group(2)}, "foregroundColor": {"color": {"rgbColor": ACCENT}}, "underline": True}, "fields": "link,foregroundColor,underline"}})
        for m in re.finditer(r'`([^`]+)`', content):
            requests.append({"updateTextStyle": {"range": {"startIndex": el_start + m.start(), "endIndex": el_start + m.end()}, "textStyle": {"weightedFontFamily": {"fontFamily": "Roboto Mono", "weight": 400}, "backgroundColor": {"color": {"rgbColor": LIGHT_BG}}, "fontSize": {"magnitude": 10, "unit": "PT"}}, "fields": "weightedFontFamily,backgroundColor,fontSize"}})

deletes = [r for r in requests if 'deleteContentRange' in r]
styles = [r for r in requests if 'deleteContentRange' not in r]
deletes.sort(key=lambda r: r['deleteContentRange']['range']['startIndex'], reverse=True)
print(json.dumps(styles + deletes))
PYEOF2
)

  local req_count=$(echo "$requests" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)

  if [ "$req_count" = "0" ] || [ -z "$requests" ] || [ "$requests" = "[]" ]; then
    echo "  SKIP: $doc_name (no formatting)"
    return
  fi

  local result=$(curl -s -X POST "https://docs.googleapis.com/v1/documents/${doc_id}:batchUpdate" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"requests\":$requests}")

  if echo "$result" | jq -e '.replies' > /dev/null 2>&1; then
    echo "  OK: $doc_name ($req_count ops)"
  else
    local err=$(echo "$result" | jq -r '.error.message // .error.status // "unknown"' 2>/dev/null)
    echo "  ERR: $doc_name — $err"
  fi
}

echo "=== Clean & Format Google Docs ==="
echo "Started: $(date)"

source /tmp/drive-folders.env

# Process all docs in our known folders
FORMATTED=0
for folder in $V $VK $VG $VS $VGR $VT $BI $BIP $BIB $BID $BIR $TR $TRS $TRR $TRD $TRA $RES $RESD $RESDD $HL $HLP $HLV $HLT $HLN $CR $CRR $CRD $CO $COW $FW "13ZXm861AUK-P48g-PBKjri1szScu5dk2" "1MJ_fHR-hbZWvnbjRg-UlchiS3t8uJUh7" "$ROOT"; do
  docs=$(curl -s "https://www.googleapis.com/drive/v3/files?q='${folder}'+in+parents+and+mimeType='application/vnd.google-apps.document'+and+trashed=false&fields=files(id,name)&pageSize=50" \
    -H "Authorization: Bearer $ACCESS_TOKEN" | jq -r '.files[] | .id + "|" + .name' 2>/dev/null)

  echo "$docs" | while IFS='|' read -r doc_id doc_name; do
    [ -z "$doc_id" ] && continue
    format_doc "$doc_id" "$doc_name"
    ((FORMATTED++)) || true
    sleep 0.4
  done
done

echo ""
echo "=== Complete: $(date) ==="