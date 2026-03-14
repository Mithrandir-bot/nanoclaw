#!/usr/bin/env bash
# Daily backup of OpenClaw data into Obsidian vault
# Backs up: workspace memory, bot scripts, credentials manifest, telegram chat transcript
set -euo pipefail

VAULT="/root/obsidian-vault/OpenClaw"
OPENCLAW="/docker/openclaw-ozvd/data/.openclaw"
DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date +"%Y-%m-%d %H:%M ET")

mkdir -p "$VAULT"/{Memory,Bot-Scripts,Chat-Transcripts,Credentials,Strategy}

# ── 1. Workspace memory files ──
echo "Backing up memory files..."
MEMORY_DIR="$VAULT/Memory"
if [ -d "$OPENCLAW/workspace/memory" ]; then
  for f in "$OPENCLAW/workspace/memory"/*; do
    [ -f "$f" ] || continue
    base=$(basename "$f")
    ext="${base##*.}"
    name="${base%.*}"
    if [ "$ext" = "json" ]; then
      cp "$f" "$MEMORY_DIR/${name}.json"
    else
      cp "$f" "$MEMORY_DIR/${name}.md"
    fi
  done
fi

# ── 2. Bot scripts ──
echo "Backing up bot scripts..."
if [ -d "$OPENCLAW/workspace/bot" ]; then
  for f in "$OPENCLAW/workspace/bot"/*; do
    [ -f "$f" ] || continue
    base=$(basename "$f")
    cp "$f" "$VAULT/Bot-Scripts/$base"
  done
fi

# ── 3. Credentials manifest (names only, never values) ──
echo "Backing up credentials manifest..."
cat > "$VAULT/Credentials/manifest-${DATE}.md" << EOF
---
date: $DATE
type: credentials-manifest
---

# OpenClaw Credentials Manifest — $DATE

| Location | File |
|----------|------|
EOF

if [ -d "$OPENCLAW/workspace/credentials" ]; then
  for f in "$OPENCLAW/workspace/credentials"/*; do
    [ -f "$f" ] || continue
    echo "| workspace/credentials | $(basename "$f") |" >> "$VAULT/Credentials/manifest-${DATE}.md"
  done
fi

if [ -d "$OPENCLAW/credentials" ]; then
  for f in "$OPENCLAW/credentials"/*; do
    [ -f "$f" ] || continue
    echo "| credentials | $(basename "$f") |" >> "$VAULT/Credentials/manifest-${DATE}.md"
  done
fi

# ── 4. Strategy/workspace docs ──
echo "Backing up strategy docs..."
if [ -d "$OPENCLAW/workspace" ]; then
  for f in "$OPENCLAW/workspace"/*.md; do
    [ -f "$f" ] || continue
    base=$(basename "$f")
    cp "$f" "$VAULT/Strategy/$base"
  done
fi

# ── 5. Telegram chat transcript ──
echo "Extracting chat transcript..."
TRANSCRIPT="$VAULT/Chat-Transcripts/telegram-${DATE}.md"
cat > "$TRANSCRIPT" << EOF
---
date: $DATE
type: openclaw-chat-transcript
source: telegram
---

# OpenClaw Telegram Chat — $DATE

EOF

# Extract all session JSONL files and convert to readable transcript
for jsonl in "$OPENCLAW"/agents/main/sessions/*.jsonl; do
  [ -f "$jsonl" ] || continue
  python3 << PYEOF >> "$TRANSCRIPT"
import json, sys, os

jsonl_path = "$jsonl"
session_id = os.path.basename(jsonl_path).replace('.jsonl', '')

with open(jsonl_path, 'r') as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
            msg = entry.get('message', {})
            role = msg.get('role', '')
            content = msg.get('content', '')
            timestamp = entry.get('timestamp', '')

            if isinstance(content, str) and content.strip():
                if role == 'user':
                    print(f"**User** ({timestamp}):")
                    print(content[:5000])
                    print()
                elif role == 'assistant':
                    print(f"**UGLUK** ({timestamp}):")
                    print(content[:5000])
                    print()
            elif isinstance(content, list):
                texts = []
                for item in content:
                    if item.get('type') == 'text':
                        texts.append(item.get('text', ''))
                if texts and role in ('user', 'assistant'):
                    label = 'User' if role == 'user' else 'UGLUK'
                    combined = '\n'.join(texts)[:5000]
                    print(f"**{label}** ({timestamp}):")
                    print(combined)
                    print()
        except (json.JSONDecodeError, KeyError):
            continue
PYEOF
done

# ── 6. Daily index ──
echo "Writing daily index..."
cat > "$VAULT/Backup-${DATE}.md" << EOF
---
date: $DATE
type: openclaw-daily-backup
---

# OpenClaw Daily Backup — $DATE

Backup completed at $TIMESTAMP

## Contents

| Section | Count |
|---------|-------|
| Memory files | $(ls "$VAULT/Memory/" 2>/dev/null | wc -l) |
| Bot scripts | $(ls "$VAULT/Bot-Scripts/" 2>/dev/null | wc -l) |
| Strategy docs | $(ls "$VAULT/Strategy/" 2>/dev/null | wc -l) |
| Chat transcripts | $(ls "$VAULT/Chat-Transcripts/" 2>/dev/null | wc -l) |

## Key Files
$(ls -1 "$VAULT/Memory/" 2>/dev/null | sed 's/^/- Memory\//')
$(ls -1 "$VAULT/Bot-Scripts/" 2>/dev/null | sed 's/^/- Bot-Scripts\//')

## Links
- [[OpenClaw/Chat-Transcripts/telegram-${DATE}|Today's Chat Transcript]]
- [[OpenClaw/Credentials/manifest-${DATE}|Credentials Manifest]]
EOF

# ── 7. Section index ──
cat > "$VAULT/INDEX.md" << EOF
---
type: index
updated: $TIMESTAMP
---

# OpenClaw

Daily backups of OpenClaw (UGLUK) Telegram bot data.

## Sections

- **Memory/** — Agent memory files (strategies, metrics, engagement targets)
- **Bot-Scripts/** — All bot automation scripts (Farcaster, X, Dune, market making)
- **Chat-Transcripts/** — Full Telegram conversation transcripts by date
- **Credentials/** — Credential manifests (names only, no secrets)
- **Strategy/** — Workspace strategy and status documents

## Recent Backups
$(ls -1 "$VAULT"/Backup-*.md 2>/dev/null | sort -r | head -7 | sed 's|.*/|  - [[OpenClaw/|;s|\.md$||;s|$|]]|')
EOF

echo "Backup complete: $VAULT"
echo "Files: $(find "$VAULT" -type f | wc -l)"
