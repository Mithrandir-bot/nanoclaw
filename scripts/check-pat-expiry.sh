#!/usr/bin/env bash
# Check fine-grained PAT validity + expiration, send a Telegram reminder
# to the keyrocker chat. Wired to systemd timer pat-rotation-reminder.timer
# for one-shot fire on 2026-07-24 09:00 ET; safe to run manually anytime.
set -euo pipefail

cd /root/nanoclaw/nanoclaw
source .env

CHAT_ID=1717541300

check_token() {
  local name="$1" file="$2" repo="$3"
  if [ ! -r "$file" ]; then
    echo "* ${name}: MISSING token file at ${file}"
    return
  fi
  local token resp code expiry days_left
  token=$(cat "$file")
  resp=$(curl -sI -H "Authorization: token ${token}" "https://api.github.com/repos/Mithrandir-bot/${repo}")
  code=$(printf '%s' "$resp" | head -1 | awk '{print $2}')
  if [ "$code" != "200" ]; then
    echo "* ${name}: HTTP ${code} — token may be revoked"
    return
  fi
  expiry=$(printf '%s' "$resp" | grep -i "github-authentication-token-expiration" | sed 's/.*: //;s/\r//' | head -1)
  if [ -z "$expiry" ]; then
    echo "* ${name}: valid, no expiry header"
    return
  fi
  if days_left=$(( ($(date -d "$expiry" +%s) - $(date +%s)) / 86400 )); then
    echo "* ${name}: valid — expires ${expiry} (${days_left} days)"
  else
    echo "* ${name}: valid — expires ${expiry}"
  fi
}

REPORT=$(cat <<EOF
GitHub PAT Rotation Reminder

Status:
$(check_token "mithrandir-config" /root/.secrets/mithrandir-config.token mithrandir-config)
$(check_token "keyrocker-vault" /root/.secrets/keyrocker-vault.token keyrocker-vault)

Rotate steps:
1. github.com/settings/personal-access-tokens -> Generate new fine-grained PAT for each
   - Name: mithrandir-config-backup (scope: mithrandir-config, Contents R/W + Metadata R, 90d)
   - Name: keyrocker-vault-backup   (scope: keyrocker-vault,   Contents R/W + Metadata R, 90d)
2. Update files on this server:
   printf '%s\n' '<NEW_TOKEN>' > /root/.secrets/mithrandir-config.token
   printf '%s\n' '<NEW_TOKEN>' > /root/.secrets/keyrocker-vault.token
   chmod 600 /root/.secrets/*.token
3. Smoke test:
   bash /root/nanoclaw/nanoclaw/scripts/backup-to-github.sh
   bash /root/nanoclaw/nanoclaw/scripts/backup-keyrocker-vault.sh
EOF
)

curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${CHAT_ID}" \
  --data-urlencode "text=${REPORT}" \
  -o /tmp/.tg-pat-reminder-resp.json

if grep -q '"ok":true' /tmp/.tg-pat-reminder-resp.json; then
  echo "Telegram delivered"
else
  echo "Telegram delivery FAILED:"
  cat /tmp/.tg-pat-reminder-resp.json
  exit 1
fi
rm -f /tmp/.tg-pat-reminder-resp.json
