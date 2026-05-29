#!/usr/bin/env bash
# One-shot reminder: Cursor (work MacBook) PAT for Mithrandir-bot/keyrocker-vault
# expires ~2026-08-25. Fires via cursor-pat-rotation-reminder.timer at 2026-08-22 09:00 ET.
# Token is NOT stored on this server (lives in macOS Keychain on the work MacBook),
# so no API check is possible — this is a calendar-only nudge.
set -euo pipefail

cd /root/nanoclaw/nanoclaw
source .env

CHAT_ID=1717541300

REPORT=$(cat <<'EOF'
Cursor PAT Rotation Reminder (work MacBook)

The fine-grained PAT named
  cursor-work-macbook-keyrocker-vault-readonly
expires on or around 2026-08-25. Rotate within the next 3 days:

1. github.com/settings/personal-access-tokens
   -> revoke the old token (or let it expire)
2. Generate new fine-grained PAT, same settings:
   - Owner: Mithrandir-bot
   - Repo: keyrocker-vault only
   - Contents: Read-only, Metadata: Read-only
   - Expiration: 90 days
3. Paste new token into Cursor on the work MacBook
   (Settings -> GitHub integration). Do NOT save it
   anywhere else; macOS Keychain handles persistence.
4. Reply to this thread when done so the next reminder
   gets scheduled.
EOF
)

curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${CHAT_ID}" \
  --data-urlencode "text=${REPORT}" \
  -o /tmp/.tg-cursor-pat-reminder-resp.json

if grep -q '"ok":true' /tmp/.tg-cursor-pat-reminder-resp.json; then
  echo "Telegram delivered"
else
  echo "Telegram delivery FAILED:"
  cat /tmp/.tg-cursor-pat-reminder-resp.json
  exit 1
fi
rm -f /tmp/.tg-cursor-pat-reminder-resp.json
