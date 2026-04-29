#!/usr/bin/env bash
# Nightly off-site backup to GitHub private repos.
#
# REPO 1 — mithrandir-config:
#   Encrypted DB snapshot + systemd unit snapshots + server config snapshots.
#   Uses fine-grained PAT scoped only to mithrandir-config.
#   No source code, no .env, no plaintext secrets.
#
# REPO 2 — nanoclaw-data:
#   Obsidian vault + group research/data files. (No secrets.)
#
# Source code lives on Mithrandir-bot/nanoclaw (synced from upstream).
# .env should be reconstructed from password manager on recovery.
#
# Usage: ./scripts/backup-to-github.sh
set -euo pipefail

PROJECT_ROOT="/root/nanoclaw/nanoclaw"
PROJECT="$PROJECT_ROOT"
cd "$PROJECT_ROOT"

LOG="$PROJECT_ROOT/logs/github-backup.log"
mkdir -p "$PROJECT_ROOT/logs"
GITHUB_USER="Mithrandir-bot"
DATE=$(date '+%Y-%m-%d')

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

log "=== GitHub backup started ==="

# Sourced for REPO 2 (legacy classic PAT). REPO 1 uses a fine-grained PAT
# from /root/.secrets/ instead.
source .env

# ────────────────────────────────────────────────
# REPO 1: mithrandir-config (encrypted DB + systemd + server-config)
# ────────────────────────────────────────────────

CONFIG_DIR="/tmp/mithrandir-config-backup"
CONFIG_TOKEN_FILE="/root/.secrets/mithrandir-config.token"
DB_PASS_FILE="/root/.secrets/db-backup-passphrase"

if [ ! -r "$CONFIG_TOKEN_FILE" ] || [ ! -r "$DB_PASS_FILE" ]; then
  log "ERROR: missing $CONFIG_TOKEN_FILE or $DB_PASS_FILE — skipping mithrandir-config push"
else
  CONFIG_TOKEN=$(cat "$CONFIG_TOKEN_FILE")

  rm -rf "$CONFIG_DIR"
  log "Cloning mithrandir-config..."
  git clone --depth=1 --quiet \
    "https://oauth2:${CONFIG_TOKEN}@github.com/${GITHUB_USER}/mithrandir-config.git" \
    "$CONFIG_DIR"
  cd "$CONFIG_DIR"

  # Encrypted DB snapshot — VACUUM INTO is consistent without locks.
  log "Snapshotting database..."
  mkdir -p database
  TMPDB=$(mktemp /tmp/nanoclaw-db-snap.XXXXXX.db)
  sqlite3 "$PROJECT/store/messages.db" "VACUUM INTO '$TMPDB'"
  log "Encrypting database..."
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
    -in "$TMPDB" \
    -out database/messages.db.enc \
    -pass file:"$DB_PASS_FILE"
  rm -f "$TMPDB"
  log "DB encrypted: $(stat -c%s database/messages.db.enc) bytes"

  # Systemd units
  log "Backing up systemd units..."
  rm -rf systemd
  mkdir -p systemd
  cp /etc/systemd/system/nanoclaw* systemd/ 2>/dev/null || true
  cp /etc/systemd/system/obsidian-sync.service systemd/ 2>/dev/null || true
  cp /etc/systemd/system/openclaw-backup* systemd/ 2>/dev/null || true

  # Server config
  log "Backing up server config..."
  rm -rf server-config
  mkdir -p server-config
  crontab -l > server-config/crontab.txt 2>/dev/null || echo "(no crontab)" > server-config/crontab.txt
  ufw status verbose > server-config/ufw-status.txt 2>/dev/null || true
  systemctl list-timers --all --no-pager > server-config/timers.txt 2>/dev/null || true
  cat /etc/os-release > server-config/os-release.txt 2>/dev/null || true
  node --version > server-config/node-version.txt 2>/dev/null || true
  docker --version > server-config/docker-version.txt 2>/dev/null || true

  # Channel CLAUDE.md snapshots (replaces what the paused agent task used to do)
  log "Snapshotting channel CLAUDE.md..."
  mkdir -p channels/global channels/group
  cp "$PROJECT/groups/global/CLAUDE.md" channels/global/CLAUDE.md 2>/dev/null || true
  cp "$PROJECT/groups/main/CLAUDE.md" channels/group/CLAUDE.md 2>/dev/null || true

  # Obsidian Memory snapshot (replaces what the paused agent task used to do)
  log "Snapshotting obsidian Memory..."
  mkdir -p vault-state
  rsync -a --delete /root/obsidian-vault/Memory/ vault-state/Memory/ 2>/dev/null || true

  # Recovery doc — replaces old README that pointed at deleted nanoclaw-backup
  cat > RECOVERY.md << 'EOF'
# NanoClaw Recovery — mithrandir-config

This repo holds the off-site recovery payload for NanoClaw:

- `database/messages.db.enc` — daily AES-256-CBC encrypted snapshot of `store/messages.db`
- `systemd/` — unit files snapshot (services + timers)
- `server-config/` — crontab, ufw, timers, OS/runtime versions

The legacy dirs `channels/` and `vault-state/` are frozen-in-time snapshots
from before this repo was repurposed for backups.

## What is NOT here (by design)

- Source code → `https://github.com/Mithrandir-bot/nanoclaw` (synced from upstream)
- `.env` / API keys → never backed up; restore from password manager
- Obsidian vault + group research → `https://github.com/Mithrandir-bot/nanoclaw-data`

## Recovery steps

1. **Provision a new server** — Ubuntu 24.04, 8GB+ RAM, Node.js 22+
2. **Clone code** — `git clone https://github.com/Mithrandir-bot/nanoclaw /root/nanoclaw/nanoclaw`
3. **Clone vault data** — `git clone https://github.com/Mithrandir-bot/nanoclaw-data /tmp/nanoclaw-data` and restore relevant subdirs
4. **Recreate `.env`** — paste each value from your password manager
5. **Decrypt DB** — passphrase lives in your password manager under
   "NanoClaw DB Backup Passphrase":
   ```
   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
     -in database/messages.db.enc \
     -out /root/nanoclaw/nanoclaw/store/messages.db \
     -pass pass:'<paste passphrase>'
   ```
6. **Install systemd units** — `cp systemd/nanoclaw* /etc/systemd/system/ && systemctl daemon-reload`
7. **Install deps** — `cd /root/nanoclaw/nanoclaw && npm install && npm run build`
8. **Build container** — `./container/build.sh`
9. **Start services** — `systemctl enable --now nanoclaw nanoclaw-dashboard`
10. **Restore Obsidian sync** — `ob login && ob sync-setup`

## Token rotation reminder

The fine-grained PAT used to push to this repo expires **2026-07-27**.
Rotate at GitHub → Settings → Developer settings → Fine-grained tokens
before that date and replace `/root/.secrets/mithrandir-config.token`.
EOF

  # Commit and push
  git -c user.email="backup@nanoclaw.local" -c user.name="Mithrandir Backup" add -A
  if git diff --cached --quiet; then
    log "mithrandir-config: no changes to commit"
  else
    git -c user.email="backup@nanoclaw.local" -c user.name="Mithrandir Backup" \
      commit -q -m "backup: ${DATE}"
    if git push -q origin HEAD:main 2>>"$LOG"; then
      log "mithrandir-config pushed"
    else
      log "mithrandir-config push FAILED"
    fi
  fi

  unset CONFIG_TOKEN
fi

# ────────────────────────────────────────────────
# REPO 2: nanoclaw-data (Obsidian vault + group research)
# ────────────────────────────────────────────────

DATA_DIR_BK="/tmp/nanoclaw-data-backup"
rm -rf "$DATA_DIR_BK"
mkdir -p "$DATA_DIR_BK"
cd "$DATA_DIR_BK"

if [ -d "$DATA_DIR_BK/.git" ]; then
  git pull --rebase 2>/dev/null || true
else
  git init -q
  git remote add origin "https://${GITHUB_TOKEN}@github.com/${GITHUB_USER}/nanoclaw-data.git" 2>/dev/null || true
  git fetch origin main 2>/dev/null && git checkout -b main origin/main 2>/dev/null || git checkout -b main 2>/dev/null || true
fi

# Obsidian vault (exclude large binaries and .obsidian config)
log "Copying Obsidian vault..."
rsync -a --delete \
  --exclude='.obsidian' \
  --exclude='.git' \
  --exclude='*.jpeg' \
  --exclude='*.jpg' \
  --exclude='*.png' \
  --exclude='*.pdf' \
  /root/obsidian-vault/ "$DATA_DIR_BK/obsidian-vault/"

# Group research files (md only, no uploads/sessions)
log "Copying group research..."
mkdir -p "$DATA_DIR_BK/groups"
for group in ai-research business-ideas contacts crypto global health-wellness main trading; do
  mkdir -p "$DATA_DIR_BK/groups/$group"
  find "$PROJECT/groups/$group" -maxdepth 1 -name "*.md" -exec cp {} "$DATA_DIR_BK/groups/$group/" \; 2>/dev/null || true
  if [ -d "$PROJECT/groups/$group/conversations" ]; then
    rsync -a "$PROJECT/groups/$group/conversations/" "$DATA_DIR_BK/groups/$group/conversations/" 2>/dev/null || true
  fi
  if [ -d "$PROJECT/groups/$group/email-templates" ]; then
    rsync -a "$PROJECT/groups/$group/email-templates/" "$DATA_DIR_BK/groups/$group/email-templates/" 2>/dev/null || true
  fi
done

# GSA monitor source (no node_modules)
log "Copying GSA monitor..."
rsync -a --exclude='node_modules' --exclude='*.json' \
  "$PROJECT/groups/business-ideas/gsa-monitor/" "$DATA_DIR_BK/groups/business-ideas/gsa-monitor/" 2>/dev/null || true
cp "$PROJECT/groups/business-ideas/gsa-monitor/latest-scan.json" "$DATA_DIR_BK/groups/business-ideas/gsa-monitor/" 2>/dev/null || true
cp "$PROJECT/groups/business-ideas/gsa-monitor/package.json" "$DATA_DIR_BK/groups/business-ideas/gsa-monitor/" 2>/dev/null || true

# Kalshi weather bot data
log "Copying Kalshi bot data..."
mkdir -p "$DATA_DIR_BK/groups/trading/kalshi-weather-bot/data"
cp "$PROJECT/groups/trading/kalshi-weather-bot/data/"*.json "$DATA_DIR_BK/groups/trading/kalshi-weather-bot/data/" 2>/dev/null || true
find "$PROJECT/groups/trading/kalshi-weather-bot" -maxdepth 1 -name "*.js" -exec cp {} "$DATA_DIR_BK/groups/trading/kalshi-weather-bot/" \; 2>/dev/null || true
cp "$PROJECT/groups/trading/kalshi-weather-bot/package.json" "$DATA_DIR_BK/groups/trading/kalshi-weather-bot/" 2>/dev/null || true

# Data files
log "Copying data files..."
mkdir -p "$DATA_DIR_BK/data"
cp "$PROJECT/data/nutrition-history.json" "$DATA_DIR_BK/data/" 2>/dev/null || true
cp "$PROJECT/data/nutrition-prices.json" "$DATA_DIR_BK/data/" 2>/dev/null || true
cp "$PROJECT/data/shopping-prices.json" "$DATA_DIR_BK/data/" 2>/dev/null || true
cp "$PROJECT/data/drive-folders.env" "$DATA_DIR_BK/data/" 2>/dev/null || true
cp "$PROJECT/data/drive-sync-state.json" "$DATA_DIR_BK/data/" 2>/dev/null || true

# Commit and push
git add -A
git commit -m "data backup: ${DATE}" --author="Mithrandir <noreply@nanoclaw.local>" 2>/dev/null || log "No data changes"
git push -u origin main 2>/dev/null && log "nanoclaw-data pushed" || log "nanoclaw-data push failed"

# Cleanup
cd /root/nanoclaw/nanoclaw
log "=== GitHub backup complete ==="
