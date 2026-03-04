#!/usr/bin/env bash
# NanoClaw Nightly Heartbeat
# Runs at 4am ET. Kills zombie processes, cleans orphaned containers,
# ensures nanoclaw is running, rebuilds container if source changed,
# syncs nanoclaw fork and all GitHub forks, and sends a Discord summary.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_PREFIX="[heartbeat]"
DISCORD_JID="dc:1474853349676286145"
IPC_TASKS_DIR="$PROJECT_DIR/data/ipc/main/tasks"

# GitHub-backed vault repos to sync (add paths here when set up)
# Format: GITHUB_VAULTS=("/path/to/vault1" "/path/to/vault2")
GITHUB_VAULTS=()

log() { echo "$LOG_PREFIX $*"; }

# Write a Discord notification via IPC
notify() {
  local msg="$1"
  local next_run task_file
  next_run=$(node -e "console.log(new Date(Date.now() + 10000).toISOString())")
  task_file="$IPC_TASKS_DIR/heartbeat_$(date +%s%N).json"
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

cd "$PROJECT_DIR"

ISSUES=()
FIXES=()

# ── 1. Kill zombie nanoclaw processes ────────────────────────────────────────
log "Checking for zombie nanoclaw processes..."

# Get the PID managed by systemd
SYSTEMD_PID=$(systemctl show nanoclaw.service --property=MainPID --value 2>/dev/null || echo "0")

# Find all nanoclaw node processes
ZOMBIE_PIDS=$(pgrep -f "node.*dist/index\.js" 2>/dev/null | grep -v "^${SYSTEMD_PID}$" || true)

if [ -n "$ZOMBIE_PIDS" ]; then
  ZOMBIE_COUNT=$(echo "$ZOMBIE_PIDS" | wc -l)
  log "Found $ZOMBIE_COUNT zombie process(es): $ZOMBIE_PIDS — killing..."
  echo "$ZOMBIE_PIDS" | xargs kill 2>/dev/null || true
  sleep 2
  # Force-kill any survivors
  echo "$ZOMBIE_PIDS" | xargs kill -9 2>/dev/null || true
  ISSUES+=("$ZOMBIE_COUNT zombie nanoclaw process(es)")
  FIXES+=("killed zombie PIDs: $ZOMBIE_PIDS")
  log "Zombie processes killed."
else
  log "No zombie processes found."
fi

# ── 2. Clean orphaned Docker containers ──────────────────────────────────────
log "Checking for orphaned nanoclaw containers..."

# Containers that are running but not tracked (nanoclaw-* more than 2h old)
ORPHANED=$(docker ps --format "{{.Names}}\t{{.CreatedAt}}" \
  | grep "^nanoclaw-" \
  | awk -v cutoff="$(date -d '2 hours ago' '+%Y-%m-%d %H:%M:%S')" \
    '$2 " " $3 < cutoff {print $1}' 2>/dev/null || true)

if [ -n "$ORPHANED" ]; then
  COUNT=$(echo "$ORPHANED" | wc -l)
  log "Stopping $COUNT orphaned container(s)..."
  echo "$ORPHANED" | xargs -I{} docker stop {} 2>/dev/null || true
  ISSUES+=("$COUNT orphaned container(s)")
  FIXES+=("stopped: $ORPHANED")
else
  log "No orphaned containers."
fi

# ── 3. Ensure nanoclaw service is running ────────────────────────────────────
log "Checking nanoclaw service..."

if ! systemctl is-active --quiet nanoclaw; then
  log "nanoclaw is not running — restarting..."
  systemctl restart nanoclaw
  sleep 3
  if systemctl is-active --quiet nanoclaw; then
    ISSUES+=("nanoclaw service was stopped")
    FIXES+=("service restarted successfully")
    log "Service restarted."
  else
    log "ERROR: Failed to restart nanoclaw!"
    ISSUES+=("nanoclaw service FAILED to restart")
    FIXES+=("manual intervention required")
  fi
else
  log "nanoclaw service is running (PID: $SYSTEMD_PID)."
fi

# ── 4. Rebuild container if agent-runner source changed ──────────────────────
log "Checking if container rebuild is needed..."

MARKER="$PROJECT_DIR/.last-container-build"
AGENT_SRC="$PROJECT_DIR/container/agent-runner/src"

REBUILD_NEEDED=false
if [ ! -f "$MARKER" ]; then
  REBUILD_NEEDED=true
  log "No build marker found — rebuilding."
elif find "$AGENT_SRC" -newer "$MARKER" -name "*.ts" | grep -q .; then
  REBUILD_NEEDED=true
  log "Agent source changed since last build — rebuilding."
fi

if [ "$REBUILD_NEEDED" = true ]; then
  log "Rebuilding container image..."
  if docker builder prune -f > /dev/null 2>&1 && ./container/build.sh > /dev/null 2>&1; then
    touch "$MARKER"
    # Sync agent-runner to all groups
    for group in main ai-research business-ideas health-wellness trading crypto contacts; do
      dest="data/sessions/$group/agent-runner-src/index.ts"
      mcp="data/sessions/$group/agent-runner-src/ipc-mcp-stdio.ts"
      [ -f "$dest" ] && cp container/agent-runner/src/index.ts "$dest"
      [ -f "$mcp" ] && cp container/agent-runner/src/ipc-mcp-stdio.ts "$mcp"
    done
    FIXES+=("container image rebuilt and synced to all groups")
    log "Container rebuilt."
  else
    log "WARNING: Container rebuild failed."
    ISSUES+=("container rebuild failed")
  fi
else
  log "Container image is up to date."
fi

# ── 5. Sync nanoclaw fork to GitHub ──────────────────────────────────────────
log "Syncing nanoclaw repo to fork..."

# Check for unresolved merge conflicts before attempting commit
UNMERGED=$(git diff --name-only --diff-filter=U 2>/dev/null || true)
if [ -n "$UNMERGED" ]; then
  log "WARNING: Unresolved merge conflicts in: $UNMERGED — skipping commit"
  ISSUES+=("unresolved merge conflicts — skipped commit: $UNMERGED")
else
  # Commit any uncommitted changes (outside subshell so FIXES/ISSUES propagate)
  if ! git diff --quiet || ! git diff --cached --quiet; then
    if git add -A && git commit -m "chore: nightly sync $(date '+%Y-%m-%d')" --no-gpg-sign 2>/dev/null; then
      FIXES+=("committed local changes to nanoclaw fork")
      log "Local changes committed."
    else
      ISSUES+=("nanoclaw fork commit failed")
      log "WARNING: Commit failed."
    fi
  fi
fi

# Push to origin (Mithrandir-bot/nanoclaw)
if git push origin HEAD 2>/dev/null; then
  log "Nanoclaw fork synced."
  FIXES+=("pushed nanoclaw to origin")
else
  log "WARNING: Failed to push nanoclaw fork."
  ISSUES+=("nanoclaw fork push failed")
fi

# ── 6. Sync all GitHub forks from upstream ───────────────────────────────────
log "Syncing GitHub forks from upstream..."

GITHUB_TOKEN=$(grep -oP '(?<=GITHUB_TOKEN=).*' "$PROJECT_DIR/.env" 2>/dev/null || true)
GITHUB_USER="Mithrandir-bot"

if [ -n "$GITHUB_TOKEN" ]; then
  # Skip repos managed locally (nanoclaw is handled by sync-upstream timer + step 5)
  LOCAL_REPOS="nanoclaw"

  FORK_LIST=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
    "https://api.github.com/users/$GITHUB_USER/repos?type=fork&per_page=100" \
    | jq -r '.[] | select(.fork == true) | "\(.name) \(.default_branch)"')

  if [ -z "$FORK_LIST" ]; then
    log "No forks found for $GITHUB_USER."
  else
    while IFS=' ' read -r repo branch; do
      [ -z "$repo" ] && continue

      # Skip repos managed locally
      if echo "$LOCAL_REPOS" | grep -qw "$repo"; then
        log "Skipping $repo — managed locally by sync-upstream timer."
        continue
      fi

      RESPONSE=$(curl -s \
        -X POST \
        -H "Authorization: token $GITHUB_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"branch\":\"$branch\"}" \
        "https://api.github.com/repos/$GITHUB_USER/$repo/merge-upstream")
      RESULT=$(echo "$RESPONSE" | jq -r '.status // "200"')

      if [ "$RESULT" = "200" ]; then
        log "Fork synced: $repo ($branch) — upstream changes merged"
        FIXES+=("synced fork $repo from upstream")
      elif echo "$RESPONSE" | grep -q "merge_head_sha\|already up-to-date\|up to date" 2>/dev/null; then
        log "Fork up to date: $repo ($branch)"
      elif echo "$RESPONSE" | grep -q "workflow.*scope\|without.*workflow"; then
        log "Fork $repo: token missing 'workflow' scope — update token at github.com/settings/tokens"
        ISSUES+=("fork $repo needs token with 'workflow' scope")
      elif [ "$RESULT" = "409" ]; then
        log "Fork $repo has conflicts with upstream — manual resolution needed."
        ISSUES+=("fork $repo has upstream conflicts")
      else
        MSG=$(echo "$RESPONSE" | jq -r '.message // "unknown error"')
        log "WARNING: Failed to sync fork $repo: $MSG"
        ISSUES+=("fork $repo sync failed: $MSG")
      fi
    done <<< "$FORK_LIST"
  fi
else
  log "WARNING: GITHUB_TOKEN not found, skipping fork sync."
fi

# ── 7. Sync GitHub-backed vaults ─────────────────────────────────────────────
log "Checking GitHub vaults..."

VAULT_SYNCED=()
VAULT_ERRORS=()

for vault_path in "${GITHUB_VAULTS[@]+"${GITHUB_VAULTS[@]}"}"; do
  if [ ! -d "$vault_path/.git" ]; then
    log "WARNING: $vault_path is not a git repo, skipping."
    continue
  fi

  log "Syncing vault: $vault_path"
  (
    cd "$vault_path"
    git add -A
    if ! git diff --cached --quiet; then
      git commit -m "vault: nightly sync $(date '+%Y-%m-%d')" --no-gpg-sign
    fi
    git pull --rebase origin main 2>/dev/null || git pull --rebase origin master 2>/dev/null || true
    git push origin HEAD 2>/dev/null || true
  ) && VAULT_SYNCED+=("$vault_path") || VAULT_ERRORS+=("$vault_path")
done

if [ ${#VAULT_SYNCED[@]} -gt 0 ]; then
  log "Synced vaults: ${VAULT_SYNCED[*]}"
  FIXES+=("synced GitHub vaults: ${VAULT_SYNCED[*]}")
fi
if [ ${#VAULT_ERRORS[@]} -gt 0 ]; then
  log "Vault sync errors: ${VAULT_ERRORS[*]}"
  ISSUES+=("vault sync failed: ${VAULT_ERRORS[*]}")
fi

if [ ${#GITHUB_VAULTS[@]} -eq 0 ]; then
  log "No GitHub vaults configured."
fi

# ── 8. Send Discord summary ───────────────────────────────────────────────────
log "Sending heartbeat summary to Discord..."

if [ ${#ISSUES[@]} -eq 0 ] && [ ${#FIXES[@]} -eq 0 ]; then
  STATUS_MSG="✅ All systems healthy. No issues found."
else
  STATUS_MSG="🔧 Fixed issues during nightly heartbeat:"
  for i in "${!ISSUES[@]}"; do
    STATUS_MSG="${STATUS_MSG}
• ${ISSUES[$i]} → ${FIXES[$i]:-resolved}"
  done
fi

TIME_ET=$(TZ=America/New_York date '+%I:%M %p ET')

notify "The nightly heartbeat ran at $TIME_ET. Report the following as a brief status update in the general Discord channel:

$STATUS_MSG

Keep it to 2-3 lines max. If all healthy, just say everything looks good."

log "Heartbeat complete."
