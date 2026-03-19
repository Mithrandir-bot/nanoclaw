#!/usr/bin/env python3
"""Format a single Google Doc with professional styling.
Usage: format-doc.py <doc_id> <access_token>
"""
import json, re, sys, urllib.request

if len(sys.argv) < 3:
    print("Usage: format-doc.py <doc_id> <access_token>")
    sys.exit(1)

doc_id = sys.argv[1]
token = sys.argv[2]

ACCENT = {"red": 0.37, "green": 0.41, "blue": 0.82}
DARK = {"red": 0.12, "green": 0.12, "blue": 0.14}
GRAY = {"red": 0.42, "green": 0.42, "blue": 0.46}
LIGHT_BG = {"red": 0.96, "green": 0.97, "blue": 0.98}

def api_get(url):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def api_post(url, data):
    payload = json.dumps(data).encode()
    req = urllib.request.Request(url, data=payload, method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return json.loads(e.read())

# Get document
doc = api_get(f"https://docs.googleapis.com/v1/documents/{doc_id}")
if not doc.get("body", {}).get("content"):
    print("SKIP (empty)")
    sys.exit(0)

title = doc.get("title", "Untitled")
requests = []

for element in doc["body"]["content"]:
    if "paragraph" not in element:
        continue
    para = element["paragraph"]
    start = element.get("startIndex", 0)
    end = element.get("endIndex", start)
    if start >= end:
        continue

    text = "".join(e.get("textRun", {}).get("content", "") for e in para.get("elements", []))

    # Heading detection (check ### before ## before #)
    if text.startswith("### "):
        requests.append({"updateParagraphStyle": {"range": {"startIndex": start, "endIndex": end},
            "paragraphStyle": {"namedStyleType": "HEADING_3", "spaceAbove": {"magnitude": 14, "unit": "PT"}, "spaceBelow": {"magnitude": 4, "unit": "PT"}},
            "fields": "namedStyleType,spaceAbove,spaceBelow"}})
        requests.append({"updateTextStyle": {"range": {"startIndex": start, "endIndex": end},
            "textStyle": {"bold": True, "fontSize": {"magnitude": 13, "unit": "PT"},
                "foregroundColor": {"color": {"rgbColor": GRAY}},
                "weightedFontFamily": {"fontFamily": "Source Sans Pro", "weight": 600}},
            "fields": "bold,fontSize,foregroundColor,weightedFontFamily"}})
        requests.append({"deleteContentRange": {"range": {"startIndex": start, "endIndex": start + 4}}})

    elif text.startswith("## "):
        requests.append({"updateParagraphStyle": {"range": {"startIndex": start, "endIndex": end},
            "paragraphStyle": {"namedStyleType": "HEADING_2",
                "spaceAbove": {"magnitude": 20, "unit": "PT"}, "spaceBelow": {"magnitude": 8, "unit": "PT"},
                "borderBottom": {"color": {"color": {"rgbColor": {"red": 0.9, "green": 0.9, "blue": 0.92}}},
                    "width": {"magnitude": 1, "unit": "PT"}, "padding": {"magnitude": 6, "unit": "PT"}, "dashStyle": "SOLID"}},
            "fields": "namedStyleType,spaceAbove,spaceBelow,borderBottom"}})
        requests.append({"updateTextStyle": {"range": {"startIndex": start, "endIndex": end},
            "textStyle": {"bold": True, "fontSize": {"magnitude": 16, "unit": "PT"},
                "foregroundColor": {"color": {"rgbColor": DARK}},
                "weightedFontFamily": {"fontFamily": "Source Sans Pro", "weight": 600}},
            "fields": "bold,fontSize,foregroundColor,weightedFontFamily"}})
        requests.append({"deleteContentRange": {"range": {"startIndex": start, "endIndex": start + 3}}})

    elif text.startswith("# "):
        requests.append({"updateParagraphStyle": {"range": {"startIndex": start, "endIndex": end},
            "paragraphStyle": {"namedStyleType": "HEADING_1",
                "spaceAbove": {"magnitude": 24, "unit": "PT"}, "spaceBelow": {"magnitude": 10, "unit": "PT"}},
            "fields": "namedStyleType,spaceAbove,spaceBelow"}})
        requests.append({"updateTextStyle": {"range": {"startIndex": start, "endIndex": end},
            "textStyle": {"bold": True, "fontSize": {"magnitude": 22, "unit": "PT"},
                "foregroundColor": {"color": {"rgbColor": ACCENT}},
                "weightedFontFamily": {"fontFamily": "Source Sans Pro", "weight": 700}},
            "fields": "bold,fontSize,foregroundColor,weightedFontFamily"}})
        requests.append({"deleteContentRange": {"range": {"startIndex": start, "endIndex": start + 2}}})

    elif text.strip() == "---":
        requests.append({"updateTextStyle": {"range": {"startIndex": start, "endIndex": end},
            "textStyle": {"fontSize": {"magnitude": 2, "unit": "PT"},
                "foregroundColor": {"color": {"rgbColor": {"red": 0.85, "green": 0.85, "blue": 0.87}}}},
            "fields": "fontSize,foregroundColor"}})
    else:
        # Body text — set font
        requests.append({"updateTextStyle": {"range": {"startIndex": start, "endIndex": end},
            "textStyle": {"fontSize": {"magnitude": 11, "unit": "PT"},
                "weightedFontFamily": {"fontFamily": "Source Sans Pro", "weight": 400}},
            "fields": "fontSize,weightedFontFamily"}})

    # Inline formatting
    for el in para.get("elements", []):
        content = el.get("textRun", {}).get("content", "")
        if not content:
            continue
        el_start = el.get("startIndex", 0)

        for m in re.finditer(r"\*\*([^*]+)\*\*", content):
            requests.append({"updateTextStyle": {"range": {"startIndex": el_start + m.start(), "endIndex": el_start + m.end()},
                "textStyle": {"bold": True}, "fields": "bold"}})

        for m in re.finditer(r"\[([^\]]+)\]\(([^)]+)\)", content):
            requests.append({"updateTextStyle": {"range": {"startIndex": el_start + m.start(), "endIndex": el_start + m.end()},
                "textStyle": {"link": {"url": m.group(2)}, "foregroundColor": {"color": {"rgbColor": ACCENT}}, "underline": True},
                "fields": "link,foregroundColor,underline"}})

        for m in re.finditer(r"`([^`]+)`", content):
            requests.append({"updateTextStyle": {"range": {"startIndex": el_start + m.start(), "endIndex": el_start + m.end()},
                "textStyle": {"weightedFontFamily": {"fontFamily": "Roboto Mono", "weight": 400},
                    "backgroundColor": {"color": {"rgbColor": LIGHT_BG}}, "fontSize": {"magnitude": 10, "unit": "PT"}},
                "fields": "weightedFontFamily,backgroundColor,fontSize"}})

# Sort: styles first, then deletes in reverse index order
deletes = [r for r in requests if "deleteContentRange" in r]
styles = [r for r in requests if "deleteContentRange" not in r]
deletes.sort(key=lambda r: r["deleteContentRange"]["range"]["startIndex"], reverse=True)
final = styles + deletes

if not final:
    print(f"SKIP: {title}")
    sys.exit(0)

result = api_post(f"https://docs.googleapis.com/v1/documents/{doc_id}:batchUpdate", {"requests": final})
if "replies" in result:
    print(f"OK: {title} ({len(final)} ops)")
else:
    err = result.get("error", {}).get("message", "unknown")
    print(f"ERR: {title} — {err}")
