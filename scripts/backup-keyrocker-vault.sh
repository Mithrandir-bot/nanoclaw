#!/usr/bin/env bash
# Daily push of /root/obsidian-vault-keyrock → Mithrandir-bot/keyrocker-vault.
# Used as the source for a Claude.ai Project (GitHub connector).
#
# Auth: fine-grained PAT scoped only to keyrocker-vault, contents:R/W, metadata:R.
# Token at /root/.secrets/keyrocker-vault.token (mode 600). Not in .env.
set -euo pipefail

VAULT="/root/obsidian-vault-keyrock"
WORK="/tmp/keyrocker-vault-push"
TOKEN_FILE="/root/.secrets/keyrocker-vault.token"
GITHUB_USER="Mithrandir-bot"
REPO="keyrocker-vault"
LOG="/root/nanoclaw/nanoclaw/logs/keyrocker-vault.log"
DATE=$(date '+%Y-%m-%d')

mkdir -p "$(dirname "$LOG")"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

if [ ! -d "$VAULT" ]; then
  log "ERROR: vault $VAULT missing — aborting"
  exit 1
fi

if [ ! -r "$TOKEN_FILE" ]; then
  log "ERROR: $TOKEN_FILE missing or unreadable — aborting"
  exit 1
fi

TOKEN=$(cat "$TOKEN_FILE")

log "=== Keyrocker vault push started ==="

rm -rf "$WORK"
git clone --depth=1 --quiet "https://oauth2:${TOKEN}@github.com/${GITHUB_USER}/${REPO}.git" "$WORK"
cd "$WORK"

# Mirror vault content into the working tree (rsync --delete keeps the repo a
# clean mirror; .obsidian and .git always excluded).
log "Mirroring vault..."
rsync -a --delete \
  --exclude='.obsidian' \
  --exclude='.trash' \
  --exclude='.DS_Store' \
  --exclude='.git' \
  --exclude='.gitignore' \
  "$VAULT/" ./

# Restore .gitignore (rsync --delete would have removed it)
cat > .gitignore <<'EOF'
.obsidian/
.trash/
.DS_Store
EOF

git -c user.email="backup@nanoclaw.local" -c user.name="Mithrandir Backup" add -A
if git diff --cached --quiet; then
  log "No vault changes today"
else
  git -c user.email="backup@nanoclaw.local" -c user.name="Mithrandir Backup" \
    commit -q -m "vault: ${DATE}"
  if git push -q origin HEAD:main 2>>"$LOG"; then
    log "Pushed"
  else
    log "Push FAILED"
    exit 2
  fi
fi

unset TOKEN
cd /
rm -rf "$WORK"
log "=== Keyrocker vault push complete ==="
