#!/usr/bin/env bash
# NanoClaw Nightly Security Check
# Runs at 3:30am ET. Checks for intrusions, unexpected changes, and vulnerabilities.
# First run establishes baselines; subsequent runs diff against them.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_PREFIX="[security]"
DISCORD_JID="dc:1474853349676286145"
IPC_TASKS_DIR="$PROJECT_DIR/data/ipc/main/tasks"
BASELINE_DIR="$PROJECT_DIR/data/security-baseline"

log() { echo "$LOG_PREFIX $*"; }

notify() {
  local msg="$1"
  local next_run task_file
  next_run=$(node -e "console.log(new Date(Date.now() + 10000).toISOString())")
  task_file="$IPC_TASKS_DIR/security_$(date +%s%N).json"
  mkdir -p "$IPC_TASKS_DIR"
  FILE="$task_file" MSG="$msg" node -e "
    const fs = require('fs');
    fs.writeFileSync(process.env.FILE, JSON.stringify({
      type: 'schedule_task',
      prompt: process.env.MSG,
      schedule_type: 'once',
      schedule_value: '$next_run',
      targetJid: '$DISCORD_JID'
    }, null, 2));
  "
}

mkdir -p "$BASELINE_DIR"

ALERTS=()   # High-priority findings — always reported
INFO=()     # Low-priority info — only reported if non-empty
FIRST_RUN=false

# ── 1. SSH failed login attempts ─────────────────────────────────────────────
log "Checking SSH auth log..."

TODAY=$(date '+%b %e' | tr -s ' ')   # e.g. "Mar  4" — matches auth.log format
YESTERDAY=$(date -d yesterday '+%b %e' | tr -s ' ')

FAILED_TODAY=$(grep -cE "Failed password|Invalid user" /var/log/auth.log 2>/dev/null) || FAILED_TODAY=0

# Successful logins in last 24h
ACCEPTED=$(grep "Accepted" /var/log/auth.log 2>/dev/null \
  | grep -E "$TODAY|$YESTERDAY" || true)
ACCEPTED_COUNT=$(echo "$ACCEPTED" | grep -c "Accepted") || ACCEPTED_COUNT=0

if [ "$FAILED_TODAY" -gt 100 ]; then
  ALERTS+=("🔴 $FAILED_TODAY failed SSH login attempts in auth.log (brute force?)")
elif [ "$FAILED_TODAY" -gt 20 ]; then
  INFO+=("⚠️ $FAILED_TODAY failed SSH login attempts in last 24h")
else
  log "SSH: $FAILED_TODAY failed attempts — OK"
fi

if [ "$ACCEPTED_COUNT" -gt 0 ]; then
  # Extract unique IPs from accepted logins
  ACCEPTED_IPS=$(echo "$ACCEPTED" | grep -oP '(\d+\.){3}\d+' | sort -u | tr '\n' ' ')
  INFO+=("🔑 $ACCEPTED_COUNT successful SSH login(s) from: $ACCEPTED_IPS")
  log "SSH: $ACCEPTED_COUNT successful login(s)"
fi

# ── 2. Open ports (compare to baseline) ──────────────────────────────────────
log "Checking open ports..."

PORTS_BASELINE="$BASELINE_DIR/ports.txt"
CURRENT_PORTS=$(ss -tlnp 2>/dev/null \
  | awk 'NR>1 {print $4}' \
  | sort -u)

if [ ! -f "$PORTS_BASELINE" ]; then
  echo "$CURRENT_PORTS" > "$PORTS_BASELINE"
  INFO+=("📋 Port baseline created (first run)")
  FIRST_RUN=true
  log "Port baseline established."
else
  NEW_PORTS=$(comm -13 "$PORTS_BASELINE" <(echo "$CURRENT_PORTS"))
  GONE_PORTS=$(comm -23 "$PORTS_BASELINE" <(echo "$CURRENT_PORTS"))
  if [ -n "$NEW_PORTS" ]; then
    ALERTS+=("🔴 New listening port(s) since last check: $NEW_PORTS")
    # Update baseline
    echo "$CURRENT_PORTS" > "$PORTS_BASELINE"
  elif [ -n "$GONE_PORTS" ]; then
    INFO+=("ℹ️ Port(s) no longer listening: $GONE_PORTS")
    echo "$CURRENT_PORTS" > "$PORTS_BASELINE"
  else
    log "Ports unchanged."
  fi
fi

# ── 3. System users (compare to baseline) ────────────────────────────────────
log "Checking system users..."

USERS_BASELINE="$BASELINE_DIR/users.txt"
CURRENT_USERS=$(awk -F: '$3 >= 1000 && $1 != "nobody" {print $1 ":" $3}' /etc/passwd | sort)

if [ ! -f "$USERS_BASELINE" ]; then
  echo "$CURRENT_USERS" > "$USERS_BASELINE"
  log "User baseline established."
else
  NEW_USERS=$(comm -13 "$USERS_BASELINE" <(echo "$CURRENT_USERS"))
  if [ -n "$NEW_USERS" ]; then
    ALERTS+=("🔴 New user account(s) created: $NEW_USERS")
    echo "$CURRENT_USERS" > "$USERS_BASELINE"
  else
    log "No new users."
  fi
fi

# ── 4. SSH authorized keys (hash check) ──────────────────────────────────────
log "Checking SSH authorized keys..."

AUTH_KEYS_FILE="$HOME/.ssh/authorized_keys"
AUTH_KEYS_BASELINE="$BASELINE_DIR/authorized_keys.sha256"

if [ -f "$AUTH_KEYS_FILE" ]; then
  CURRENT_HASH=$(sha256sum "$AUTH_KEYS_FILE" | awk '{print $1}')
  if [ ! -f "$AUTH_KEYS_BASELINE" ]; then
    echo "$CURRENT_HASH" > "$AUTH_KEYS_BASELINE"
    log "SSH authorized_keys baseline established."
  else
    STORED_HASH=$(cat "$AUTH_KEYS_BASELINE")
    if [ "$CURRENT_HASH" != "$STORED_HASH" ]; then
      ALERTS+=("🔴 SSH authorized_keys was modified!")
      echo "$CURRENT_HASH" > "$AUTH_KEYS_BASELINE"
    else
      log "SSH authorized_keys unchanged."
    fi
  fi
fi

# ── 5. Sensitive file integrity ───────────────────────────────────────────────
log "Checking sensitive file integrity..."

FILES_BASELINE="$BASELINE_DIR/file-hashes.txt"

SENSITIVE_FILES=(
  "$PROJECT_DIR/.env"
  "$PROJECT_DIR/config.json"
  "$PROJECT_DIR/src/index.ts"
  "$PROJECT_DIR/container/agent-runner/src/index.ts"
  "$PROJECT_DIR/scripts/heartbeat.sh"
  "$PROJECT_DIR/scripts/security-check.sh"
  "/etc/systemd/system/nanoclaw.service"
  "/etc/systemd/system/nanoclaw-heartbeat.service"
  "/etc/passwd"
  "/etc/sudoers"
)

CURRENT_HASHES=""
for f in "${SENSITIVE_FILES[@]}"; do
  [ -f "$f" ] && CURRENT_HASHES+=$(sha256sum "$f" 2>/dev/null || true)$'\n'
done
CURRENT_HASHES=$(echo "$CURRENT_HASHES" | sort)

if [ ! -f "$FILES_BASELINE" ]; then
  echo "$CURRENT_HASHES" > "$FILES_BASELINE"
  log "File integrity baseline established."
else
  CHANGED=$(comm -13 "$FILES_BASELINE" <(echo "$CURRENT_HASHES") \
    | awk '{print $2}' | sed "s|$PROJECT_DIR/||g" | tr '\n' ' ' || true)
  if [ -n "$CHANGED" ]; then
    ALERTS+=("🔴 Sensitive file(s) modified: $CHANGED")
    echo "$CURRENT_HASHES" > "$FILES_BASELINE"
  else
    log "Sensitive files unchanged."
  fi
fi

# ── 6. Unexpected systemd timers/services ────────────────────────────────────
log "Checking systemd units..."

UNITS_BASELINE="$BASELINE_DIR/systemd-units.txt"
CURRENT_UNITS=$(systemctl list-unit-files --type=service,timer --state=enabled,static 2>/dev/null \
  | awk 'NR>1 && NF>=2 {print $1}' | sort)

if [ ! -f "$UNITS_BASELINE" ]; then
  echo "$CURRENT_UNITS" > "$UNITS_BASELINE"
  log "Systemd units baseline established."
else
  NEW_UNITS=$(comm -13 "$UNITS_BASELINE" <(echo "$CURRENT_UNITS"))
  if [ -n "$NEW_UNITS" ]; then
    INFO+=("ℹ️ New enabled systemd unit(s): $NEW_UNITS")
    echo "$CURRENT_UNITS" > "$UNITS_BASELINE"
  else
    log "No new systemd units."
  fi
fi

# ── 7. Disk usage ─────────────────────────────────────────────────────────────
log "Checking disk usage..."

while IFS= read -r line; do
  PCT=$(echo "$line" | awk '{print $5}' | tr -d '%')
  MOUNT=$(echo "$line" | awk '{print $6}')
  [ -z "$PCT" ] && continue
  if [ "$PCT" -ge 90 ]; then
    ALERTS+=("🔴 Disk ${MOUNT} is ${PCT}% full!")
  elif [ "$PCT" -ge 80 ]; then
    INFO+=("⚠️ Disk ${MOUNT} is ${PCT}% full")
  fi
done < <(df -h --output=source,size,used,avail,pcent,target 2>/dev/null \
  | awk 'NR>1 && /^\// {print}')

log "Disk check done."

# ── 8. Pending security updates ───────────────────────────────────────────────
log "Checking for security updates..."

SECURITY_UPDATES=$(apt list --upgradable 2>/dev/null | grep -ic "security") || SECURITY_UPDATES=0
if [ "$SECURITY_UPDATES" -gt 0 ]; then
  INFO+=("📦 $SECURITY_UPDATES security package update(s) available (run: apt upgrade)")
  log "$SECURITY_UPDATES security updates available."
else
  log "No pending security updates."
fi

# ── 9. Unexpected root processes ──────────────────────────────────────────────
log "Checking for unexpected network listeners..."

# Any process listening on 0.0.0.0 that isn't expected
UNEXPECTED=$(ss -tlnp 2>/dev/null \
  | grep "0.0.0.0" \
  | grep -v ":22 \|:80 \|:443 " \
  | awk '{print $4, $6}' || true)

if [ -n "$UNEXPECTED" ]; then
  INFO+=("ℹ️ Processes listening on 0.0.0.0: $UNEXPECTED")
fi

# ── 10. Send Discord report ───────────────────────────────────────────────────
log "Sending security report to Discord..."

TIME_ET=$(TZ=America/New_York date '+%I:%M %p ET')

if [ ${#ALERTS[@]} -eq 0 ] && [ ${#INFO[@]} -eq 0 ]; then
  REPORT="✅ Security check passed at $TIME_ET — no issues found."
else
  REPORT="🛡️ Nightly security check at $TIME_ET:"

  if [ ${#ALERTS[@]} -gt 0 ]; then
    for a in "${ALERTS[@]}"; do
      REPORT="${REPORT}
${a}"
    done
  fi

  if [ ${#INFO[@]} -gt 0 ]; then
    for i in "${INFO[@]}"; do
      REPORT="${REPORT}
${i}"
    done
  fi
fi

if [ "$FIRST_RUN" = true ]; then
  REPORT="${REPORT}
📋 Baselines created — future runs will diff against tonight's state."
fi

notify "Send this security status report to the general Discord channel, formatted cleanly without markdown headers:

$REPORT"

log "Security check complete."
