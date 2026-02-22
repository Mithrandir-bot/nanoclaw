#!/usr/bin/env bash
# Sync NanoClaw fork from upstream and notify via Discord.
# Designed to run standalone (cron/systemd timer) or be called directly.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
IPC_TASKS_DIR="$PROJECT_DIR/data/ipc/main/tasks"
DISCORD_JID="dc:1474853349676286145"

log() { echo "[sync-upstream] $*"; }

write_ipc_task() {
  local prompt="$1"
  local next_run
  next_run=$(node -e "console.log(new Date(Date.now() + 15000).toISOString())")
  local task_file="$IPC_TASKS_DIR/sync_$(date +%s%N).json"
  mkdir -p "$IPC_TASKS_DIR"
  # Use node to safely build the JSON with proper escaping
  node -e "
    const fs = require('fs');
    const obj = {
      type: 'schedule_task',
      prompt: process.env.TASK_PROMPT,
      schedule_type: 'once',
      schedule_value: '$next_run',
      targetJid: '$DISCORD_JID'
    };
    fs.writeFileSync('$task_file', JSON.stringify(obj, null, 2));
  " TASK_PROMPT="$prompt"
  chmod 666 "$task_file"
  log "IPC task written: $task_file"
}

cd "$PROJECT_DIR"

# Fetch upstream changes
log "Fetching upstream..."
git fetch upstream 2>&1

# Check for new commits
NEW_COMMITS=$(git log HEAD..upstream/main --oneline 2>/dev/null || true)

if [ -z "$NEW_COMMITS" ]; then
  log "Already up to date with upstream."
  write_ipc_task "The daily upstream sync ran and found no new changes — the fork is already up to date with the upstream qwibitai/nanoclaw repo. Send a brief Discord message letting me know."
  exit 0
fi

COMMIT_COUNT=$(echo "$NEW_COMMITS" | grep -c '' || true)
log "Found $COMMIT_COUNT new upstream commit(s). Merging..."

# Merge upstream into main
git merge upstream/main -m "chore: sync upstream changes"

# Push to fork
log "Pushing to origin..."
git push origin main

# Get commit summary (up to 25 commits)
COMMIT_SUMMARY=$(git log HEAD~${COMMIT_COUNT}..HEAD --oneline --no-merges | head -25)
SHOWN=$(echo "$COMMIT_SUMMARY" | grep -c '' || true)
if [ "$SHOWN" -ge 25 ] && [ "$COMMIT_COUNT" -gt 25 ]; then
  EXTRA=$(( COMMIT_COUNT - 25 ))
  COMMIT_SUMMARY="$COMMIT_SUMMARY
...and $EXTRA more"
fi

log "Sync complete ($COMMIT_COUNT commits). Writing Discord notification..."

write_ipc_task "The daily upstream sync just completed. ${COMMIT_COUNT} new commit(s) were merged from upstream (qwibitai/nanoclaw) into our fork and pushed to origin. Commits:

${COMMIT_SUMMARY}

Send a concise Discord message with the key changes. One line per notable change, skip trivial ones."

log "All done."
