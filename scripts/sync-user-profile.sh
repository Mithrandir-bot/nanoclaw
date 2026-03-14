#!/bin/bash
# Sync USER.md profile across NanoClaw, OpenClaw, and Obsidian vault
# Source of truth: /root/obsidian-vault/Memory/Facts/user-profile.md
# Targets:
#   - NanoClaw: /root/nanoclaw/nanoclaw/groups/global/USER.md
#   - OpenClaw: /data/.openclaw/workspace/USER.md (inside Docker)

set -euo pipefail

SOURCE="/root/obsidian-vault/Memory/Facts/user-profile.md"
NANOCLAW_TARGET="/root/nanoclaw/nanoclaw/groups/global/USER.md"
OPENCLAW_CONTAINER="openclaw-ozvd-openclaw-1"
OPENCLAW_TARGET="/data/.openclaw/workspace/USER.md"

# Strip frontmatter from source (everything between first --- and second ---)
strip_frontmatter() {
    awk 'BEGIN{skip=0} /^---$/{skip++; if(skip<=2) next} skip>=2{print}' "$1"
}

if [ ! -f "$SOURCE" ]; then
    echo "Source not found: $SOURCE"
    exit 1
fi

# Generate clean profile (no YAML frontmatter)
CLEAN=$(strip_frontmatter "$SOURCE")

# Sync to NanoClaw
echo "$CLEAN" > "$NANOCLAW_TARGET"
echo "Synced to NanoClaw: $NANOCLAW_TARGET"

# Sync to OpenClaw (if container is running)
if docker ps --format '{{.Names}}' | grep -q "$OPENCLAW_CONTAINER"; then
    echo "$CLEAN" | docker exec -i "$OPENCLAW_CONTAINER" tee "$OPENCLAW_TARGET" > /dev/null
    echo "Synced to OpenClaw: $OPENCLAW_TARGET"
else
    echo "OpenClaw container not running, skipped"
fi

echo "Profile sync complete: $(date -Iseconds)"
