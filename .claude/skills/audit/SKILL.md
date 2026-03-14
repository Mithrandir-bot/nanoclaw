---
name: audit
description: Run a safety-first system health audit across database, tasks, containers, channels, and configuration. Reports what's healthy, what's broken, and what was intentionally skipped.
triggers:
  - "audit"
  - "health check"
  - "system check"
---

# NanoClaw System Audit

Run a comprehensive, safety-first audit of the NanoClaw installation. Inspect before acting. Fix only high-confidence issues. Report everything.

## Priority Order

Work through these in order. Do NOT skip ahead.

### 1. Process & Service Health

```bash
# Check for duplicate nanoclaw processes (causes double responses)
ps aux | grep "node dist/index.js" | grep -v grep

# Check systemd service status
systemctl status nanoclaw --no-pager

# Verify user service is NOT running (was disabled — running both causes doubles)
systemctl --user is-active nanoclaw 2>/dev/null || echo "user service not active (correct)"

# Check for zombie Docker containers consuming memory
docker ps --format '{{.Names}}\t{{.Status}}\t{{.Size}}' 2>/dev/null

# Check Docker daemon health
journalctl -u docker -n 10 --no-pager 2>/dev/null | grep -i "signal\|error\|kill"
```

### 2. Database Integrity

```bash
# SQLite integrity check
sqlite3 store/messages.db "PRAGMA integrity_check;"

# Check registered groups match filesystem
sqlite3 store/messages.db "SELECT folder, jid, name, requires_trigger, is_main FROM registered_groups;"
ls -la groups/

# Check for orphaned session IDs (session file deleted but ID still in DB)
sqlite3 store/messages.db "SELECT group_folder, session_id FROM sessions;" | while IFS='|' read folder sid; do
  jsonl="data/sessions/$folder/.claude/projects/-workspace-group/$sid.jsonl"
  [ ! -f "$jsonl" ] && echo "STALE SESSION: $folder → $sid (file missing)"
done

# Check session file sizes (>512KB triggers rotation)
find data/sessions/ -name "*.jsonl" -size +500k -exec ls -lh {} \;
```

### 3. Scheduled Tasks Validation

```bash
# List all active/paused tasks
sqlite3 store/messages.db "SELECT id, group_folder, schedule_type, schedule_value, status, next_run FROM scheduled_tasks WHERE status IN ('active', 'paused');"

# Check for overdue tasks (next_run in the past)
sqlite3 store/messages.db "SELECT id, group_folder, next_run FROM scheduled_tasks WHERE status = 'active' AND next_run < datetime('now');"

# Verify task group_folders reference real groups
sqlite3 store/messages.db "SELECT t.id, t.group_folder FROM scheduled_tasks t LEFT JOIN registered_groups g ON t.group_folder = g.folder WHERE g.folder IS NULL AND t.status = 'active';"
```

For each active task, verify:
- The `schedule_value` is a valid cron expression or ISO timestamp
- The `group_folder` exists in `groups/`
- The `chat_jid` matches a registered group

### 4. Container & Build Health

```bash
# Check container image exists and is recent
docker images nanoclaw-agent --format '{{.Repository}}:{{.Tag}}\t{{.CreatedSince}}\t{{.Size}}'

# Verify agent-runner source is synced across all groups
CANONICAL="container/agent-runner/src/index.ts"
for group in main ai-research business-ideas health-wellness trading crypto contacts; do
  COPY="data/sessions/$group/agent-runner-src/index.ts"
  if [ -f "$COPY" ]; then
    diff -q "$CANONICAL" "$COPY" >/dev/null 2>&1 || echo "OUT OF SYNC: $group"
  else
    echo "MISSING: $group agent-runner copy"
  fi
done

# Check container can start (dry run)
echo '{}' | timeout 10 docker run -i --rm \
  -v $(pwd)/data/env:/workspace/env-dir:ro \
  --entrypoint /bin/bash nanoclaw-agent:latest \
  -c 'echo "Container OK: node $(node --version), claude $(claude --version 2>/dev/null || echo missing)"' 2>&1
```

### 5. Channel & IPC Health

```bash
# Check IPC directories exist for all registered groups
sqlite3 store/messages.db "SELECT folder FROM registered_groups;" | while read folder; do
  [ ! -d "data/ipc/$folder" ] && echo "MISSING IPC DIR: $folder"
  [ ! -d "data/ipc/$folder/messages" ] && echo "MISSING IPC MESSAGES DIR: $folder"
  [ ! -d "data/ipc/$folder/tasks" ] && echo "MISSING IPC TASKS DIR: $folder"
done

# Check for stale IPC files (older than 1 hour — should be processed)
find data/ipc/ -name "*.json" -mmin +60 -not -name "current_tasks.json" -not -name "available_groups.json" -not -name "secrets-manifest.json" | head -20

# Check OpenRouter fallback flag
for group in groups/*/; do
  flag="$group/.openrouter_mode"
  [ -f "$flag" ] && echo "OPENROUTER FLAG ACTIVE: $flag — $(cat "$flag")"
done
```

### 6. Configuration Validation

```bash
# Check .env has required vars
for var in CLAUDE_CODE_OAUTH_TOKEN TZ; do
  grep -q "^$var=" .env && echo "OK: $var" || echo "MISSING: $var"
done

# Verify timezone is set
grep "^TZ=" .env

# Check group CLAUDE.md files exist and are non-empty
for group in groups/*/; do
  cmd="$group/CLAUDE.md"
  if [ ! -f "$cmd" ]; then
    echo "MISSING: $cmd"
  elif [ ! -s "$cmd" ]; then
    echo "EMPTY: $cmd"
  fi
done

# Check global CLAUDE.md exists
[ -f "groups/global/CLAUDE.md" ] && echo "OK: global CLAUDE.md" || echo "MISSING: global CLAUDE.md"
```

### 7. Log & Disk Health

```bash
# Check log sizes
ls -lh logs/nanoclaw.log logs/nanoclaw.error.log 2>/dev/null

# Check disk usage for key directories
du -sh store/ data/ groups/ logs/ 2>/dev/null

# Check for very large container logs (>10MB)
find groups/ -name "container-*.log" -size +10M -exec ls -lh {} \;

# Recent errors in main log
tail -50 logs/nanoclaw.error.log 2>/dev/null | grep -i "error\|fatal\|crash" | tail -10
```

### 8. Obsidian Vault Sync

```bash
# Check obsidian-sync service
systemctl status obsidian-sync --no-pager 2>/dev/null | head -5

# Check vault is mounted and accessible
[ -d "/root/obsidian-vault" ] && echo "OK: vault exists" || echo "MISSING: vault directory"
ls /root/obsidian-vault/INDEX.md >/dev/null 2>&1 && echo "OK: INDEX.md present" || echo "MISSING: INDEX.md"
```

## Safety Rules

- **Do NOT delete files** unless explicitly approved
- **Do NOT modify database records** without showing the change first
- **Do NOT restart services** — report what needs restarting and let the user decide
- **Do NOT rotate secrets** or modify `.env`
- **Do NOT run destructive git commands**
- Prefer read-only diagnostic commands
- If a fix has non-obvious consequences, stop and ask

## Reporting Format

After completing the audit, produce a summary:

```
## Audit Report — [date]

### Healthy
- [what's working correctly]

### Issues Found
- [what's broken, with severity: CRITICAL / WARNING / INFO]

### Fixed
- [what was safe to fix inline, with before/after]

### Intentionally Skipped
- [what was noticed but not changed, and why]

### Needs Approval
- [changes that require user confirmation before applying]
```

When fixing issues inline, only fix things that are:
1. Clearly broken (not "could be better")
2. Safe to fix (reversible, no data loss)
3. High confidence (you understand the root cause)

Everything else goes in "Needs Approval".
