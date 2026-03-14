#!/bin/bash
set -euo pipefail
BACKUP_DIR=/root/nanoclaw/nanoclaw/store/backup
DB=/root/nanoclaw/nanoclaw/store/messages.db
DATE=$(date +%Y-%m-%d)
mkdir -p "$BACKUP_DIR"
sqlite3 "$DB" "VACUUM INTO '${BACKUP_DIR}/messages-${DATE}.db';"
find "$BACKUP_DIR" -name "messages-*.db" -mtime +7 -delete
echo "[backup] Created messages-${DATE}.db, cleaned old backups"
