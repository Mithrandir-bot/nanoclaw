#!/usr/bin/env bash
# Sync NanoClaw fork from upstream and notify via Discord.
# Designed to run standalone (cron/systemd timer) or be called directly.
set -uo pipefail

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

# Abort any leftover merge state from a previous failed run
if [ -f .git/MERGE_HEAD ]; then
  log "Aborting leftover merge state from previous run..."
  git merge --abort 2>/dev/null || true
fi

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

# Merge upstream into main — handle conflicts gracefully
if ! git merge upstream/main -m "chore: sync upstream changes" 2>&1; then
  # Merge failed — collect conflict info, abort, and notify
  CONFLICTED_FILES=$(git diff --name-only --diff-filter=U 2>/dev/null || true)
  log "Merge conflicts detected in: $CONFLICTED_FILES"
  git merge --abort 2>/dev/null || true

  write_ipc_task "URGENT: The daily upstream sync FAILED due to merge conflicts. The merge has been aborted so the current build remains intact. Conflicting files:

${CONFLICTED_FILES}

Run /update-nanoclaw to resolve these conflicts manually. The service continues running on the previous build."

  log "Merge aborted. Service continues on previous build."
  exit 1
fi

# Merge succeeded — rebuild TypeScript
log "Merge succeeded. Rebuilding..."
if ! npm run build 2>&1; then
  BUILD_ERRORS=$(npm run build 2>&1 | tail -20)
  log "Build failed after merge!"

  write_ipc_task "WARNING: Upstream sync merged successfully but the TypeScript build FAILED. The service continues running on the previous build. Build errors:

${BUILD_ERRORS}

Investigate and fix the build manually. The merge commit is already on main."

  log "Build failed. Service continues on previous build."
  exit 1
fi

# Rebuild succeeded — restart service
log "Build succeeded. Restarting nanoclaw..."
systemctl restart nanoclaw 2>/dev/null || true

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

write_ipc_task "The daily upstream sync just completed. ${COMMIT_COUNT} new commit(s) were merged from upstream (qwibitai/nanoclaw) into our fork, rebuilt, and service restarted. Commits:

${COMMIT_SUMMARY}

Send a concise Discord message with the key changes. One line per notable change, skip trivial ones."

log "All done."
