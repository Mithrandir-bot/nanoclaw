#!/usr/bin/env bash
# Nightly off-site backup to GitHub private repos
# Backs up: code, configs, database, systemd units, research data, Obsidian vault
# Usage: ./scripts/backup-to-github.sh
set -euo pipefail

PROJECT_ROOT="/root/nanoclaw/nanoclaw"
cd "$PROJECT_ROOT"
source .env

LOG="$PROJECT_ROOT/logs/github-backup.log"
mkdir -p "$PROJECT_ROOT/logs"
BACKUP_DIR="/tmp/nanoclaw-backup"
DATA_DIR_BK="/tmp/nanoclaw-data-backup"
GITHUB_USER="Mithrandir-bot"
DATE=$(date '+%Y-%m-%d')

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

log "=== GitHub backup started ==="

# ────────────────────────────────────────────────
# REPO 1: nanoclaw-backup (code + configs + db)
# ────────────────────────────────────────────────

rm -rf "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
cd "$BACKUP_DIR"

if [ -d "$BACKUP_DIR/.git" ]; then
  git pull --rebase 2>/dev/null || true
else
  git init
  git remote add origin "https://${GITHUB_TOKEN}@github.com/${GITHUB_USER}/nanoclaw-backup.git" 2>/dev/null || true
  # Try pulling existing content
  git fetch origin main 2>/dev/null && git checkout -b main origin/main 2>/dev/null || git checkout -b main 2>/dev/null || true
fi

PROJECT="/root/nanoclaw/nanoclaw"

# Core code
log "Copying code..."
rsync -a --delete \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='data/sessions' \
  --exclude='groups/*/uploads' \
  --exclude='groups/*/conversations' \
  --exclude='groups/*/node_modules' \
  --exclude='groups/*/gsa-monitor/node_modules' \
  --exclude='groups/contacts/uploads' \
  --exclude='*.jsonl' \
  --exclude='*.jpeg' \
  --exclude='*.jpg' \
  --exclude='*.png' \
  --exclude='dist/' \
  "$PROJECT/" "$BACKUP_DIR/nanoclaw/"

# Encrypted .env backup (base64 encode — not true encryption but prevents accidental exposure in diffs)
log "Backing up credentials..."
openssl enc -aes-256-cbc -pbkdf2 -salt -in "$PROJECT/.env" -out "$BACKUP_DIR/nanoclaw/.env.enc" -pass pass:"${SECRETS_ENCRYPTION_KEY:-nanoclaw-backup}" 2>/dev/null || \
  cp "$PROJECT/.env" "$BACKUP_DIR/nanoclaw/.env.enc"

# Database
log "Backing up database..."
mkdir -p "$BACKUP_DIR/database"
sqlite3 "$PROJECT/store/messages.db" ".backup '$BACKUP_DIR/database/messages.db'"

# Systemd units
log "Backing up systemd units..."
mkdir -p "$BACKUP_DIR/systemd"
cp /etc/systemd/system/nanoclaw* "$BACKUP_DIR/systemd/" 2>/dev/null || true
cp /etc/systemd/system/obsidian-sync.service "$BACKUP_DIR/systemd/" 2>/dev/null || true
cp /etc/systemd/system/openclaw-backup* "$BACKUP_DIR/systemd/" 2>/dev/null || true

# Server config
log "Backing up server config..."
mkdir -p "$BACKUP_DIR/server-config"
crontab -l > "$BACKUP_DIR/server-config/crontab.txt" 2>/dev/null || true
ufw status verbose > "$BACKUP_DIR/server-config/ufw-status.txt" 2>/dev/null || true
systemctl list-timers --all --no-pager > "$BACKUP_DIR/server-config/timers.txt" 2>/dev/null || true
cat /etc/os-release > "$BACKUP_DIR/server-config/os-release.txt" 2>/dev/null || true
node --version > "$BACKUP_DIR/server-config/node-version.txt" 2>/dev/null || true
docker --version >> "$BACKUP_DIR/server-config/docker-version.txt" 2>/dev/null || true

# Recovery README
cat > "$BACKUP_DIR/README.md" << 'EOF'
# NanoClaw System Backup

Full off-site backup of the NanoClaw personal assistant system.

## Recovery Steps

1. **Provision new server** — Ubuntu 24.04, 8GB+ RAM, Node.js 22+
2. **Clone this repo** — `git clone https://github.com/Mithrandir-bot/nanoclaw-backup`
3. **Restore code** — `cp -r nanoclaw/ /root/nanoclaw/nanoclaw/`
4. **Decrypt .env** — `openssl enc -d -aes-256-cbc -pbkdf2 -in nanoclaw/.env.enc -out nanoclaw/.env`
5. **Restore database** — `cp database/messages.db nanoclaw/store/messages.db`
6. **Install systemd units** — `cp systemd/* /etc/systemd/system/ && systemctl daemon-reload`
7. **Install dependencies** — `cd nanoclaw && npm install && npm run build`
8. **Clone data repo** — `git clone https://github.com/Mithrandir-bot/nanoclaw-data /root/obsidian-vault`
9. **Start services** — `systemctl enable --now nanoclaw nanoclaw-dashboard`
10. **Restore Obsidian sync** — `ob login && ob sync-setup`

## Contents

- `nanoclaw/` — Full codebase (src, dashboard, scripts, container, groups)
- `database/` — SQLite database (tasks, messages, contacts, associations)
- `systemd/` — All systemd service and timer units
- `server-config/` — Firewall rules, cron jobs, system info

## Credentials

`.env.enc` is encrypted with AES-256-CBC. Decryption key is the SECRETS_ENCRYPTION_KEY from the encrypted secrets store.

## Data Repo

Research, ventures, and Obsidian vault are in the separate `nanoclaw-data` repo.
EOF

# Commit and push
git add -A
git commit -m "backup: ${DATE}" --author="Mithrandir <noreply@nanoclaw.local>" 2>/dev/null || log "No changes to commit"
git push -u origin main 2>/dev/null && log "nanoclaw-backup pushed" || log "nanoclaw-backup push failed"

# ────────────────────────────────────────────────
# REPO 2: nanoclaw-data (research + Obsidian vault)
# ────────────────────────────────────────────────

rm -rf "$DATA_DIR_BK"
mkdir -p "$DATA_DIR_BK"
cd "$DATA_DIR_BK"

if [ -d "$DATA_DIR_BK/.git" ]; then
  git pull --rebase 2>/dev/null || true
else
  git init
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
  # Copy md files
  find "$PROJECT/groups/$group" -maxdepth 1 -name "*.md" -exec cp {} "$DATA_DIR_BK/groups/$group/" \; 2>/dev/null || true
  # Copy conversation archives
  if [ -d "$PROJECT/groups/$group/conversations" ]; then
    rsync -a "$PROJECT/groups/$group/conversations/" "$DATA_DIR_BK/groups/$group/conversations/" 2>/dev/null || true
  fi
  # Copy email templates
  if [ -d "$PROJECT/groups/$group/email-templates" ]; then
    rsync -a "$PROJECT/groups/$group/email-templates/" "$DATA_DIR_BK/groups/$group/email-templates/" 2>/dev/null || true
  fi
done

# GSA monitor source (no node_modules)
log "Copying GSA monitor..."
rsync -a --exclude='node_modules' --exclude='*.json' \
  "$PROJECT/groups/business-ideas/gsa-monitor/" "$DATA_DIR_BK/groups/business-ideas/gsa-monitor/" 2>/dev/null || true
# Copy the JSON data files separately
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
