#!/usr/bin/env bash
# Daily Google Drive sync — runs after Obsidian sync
# Uploads new/modified files from Obsidian vault and NanoClaw groups to Drive
# Usage: ./scripts/sync-drive.sh
set -euo pipefail

cd /root/nanoclaw/nanoclaw
source .env

LOG="logs/drive-sync.log"
STATE_FILE="data/drive-sync-state.json"
mkdir -p logs data

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

# Load folder IDs
declare -A FOLDERS=(
  # Ventures
  [VK]="1_tQsTNh6VGo2fdo98aqA1Q4MuccDOt7v"
  [VG]="1kohv_6DKUXrOlZipkVs38nx33eOD4Mug"
  [VS]="1eiz8HMr0Rv6yc_UmwCdrJgcCD8bILsqw"
  [VGR]="1cpPaYxUhf0qKuxbd9mpCeaKRZTOL2SXd"
  [VT]="1TPPHhNnhuVXUxVB2qXcuHa9UIcwgWVhk"
  # Business Ideas
  [BIP]="1W6bmGrh84EiungxNHFZzlm1KxprJAs9H"
  [BIB]="1YQGwXeYXNGXcqUbu29ELHPP-n3MB90_A"
  [BID]="1BFhfPulqbZQlYJFtzpj8AYGdkgkyk5jA"
  [BIR]="1L0ayCAPvhgZBzlMFuTZywyUZbeLRRQzv"
  # Trading
  [TRR]="1wIS-eYu_HxY3gnQA4YJLt6myO3LUH00d"
  [TRD]="1NZmmkq1CS6xcE1b4v2kH_4JrYAELyA6w"
  [TRA]="1JlISFDDp9qcJB8ER3-6xTxpMy5LasI2J"
  # Research
  [RES]="11p6ceaQK8OFW_PG-XykrCWtDybYJCLrP"
  [RESD]="12qktTEW1u4NrlAeLurgUwcr_XsKFVJ5N"
  [RESDD]="1asYzSBPtxmzqpaTD3HsPqfz_-cptRWy8"
  # Health
  [HLP]="1TjBruN7cCUCYGj_4vtMKTf5MCDabrHpf"
  [HLV]="12FRfORFXrpbpq_eL_fQutZleDC0Ogd_-"
  [HLT]="1dbyeOqYs4Wy-wyJU_ougx9bKwmPdUZAG"
  [HLN]="1-u5ceyA8-gPBxgwAQmSqJ8NcSAzlirpj"
  # Crypto
  [CRR]="1C0gQw5bS5Uh1Y62YYZx1AHUIJ9yrvSuf"
  [CRD]="1PiQYIRubX43uYBlx1cquuiGVT1q7f2cX"
  # Frameworks
  [FW]="1HQlyhq3kMLhIt__2yNq8MOKH42CzKfrr"
)

# Get access token
ACCESS_TOKEN=$(curl -s -X POST https://oauth2.googleapis.com/token \
  -d "client_id=$GOOGLE_CLIENT_ID&client_secret=$GOOGLE_CLIENT_SECRET&refresh_token=$GOOGLE_REFRESH_TOKEN&grant_type=refresh_token" \
  | jq -r '.access_token')
TOKEN_TIME=$(date +%s)

if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" = "null" ]; then
  log "ERROR: Failed to get access token"
  exit 1
fi

maybe_refresh() {
  local now=$(date +%s)
  if (( now - TOKEN_TIME > 3000 )); then
    ACCESS_TOKEN=$(curl -s -X POST https://oauth2.googleapis.com/token \
      -d "client_id=$GOOGLE_CLIENT_ID&client_secret=$GOOGLE_CLIENT_SECRET&refresh_token=$GOOGLE_REFRESH_TOKEN&grant_type=refresh_token" \
      | jq -r '.access_token')
    TOKEN_TIME=$now
  fi
}

# Load last sync state (file -> md5)
if [ -f "$STATE_FILE" ]; then
  LAST_STATE=$(cat "$STATE_FILE")
else
  LAST_STATE="{}"
fi

UPLOADED=0
UPDATED=0
UNCHANGED=0
NEW_STATE="{"
FIRST=true

# Sync a file: upload if new, update if changed, skip if unchanged
sync_file() {
  local file="$1" folder="$2" name="${3:-}"
  [ ! -f "$file" ] && return
  local size=$(stat -c%s "$file" 2>/dev/null || echo 0)
  [ "$size" -lt 10 ] && return
  [ -z "$name" ] && name=$(basename "$file" .md)

  maybe_refresh

  # Check if file changed since last sync
  local md5=$(md5sum "$file" | cut -d' ' -f1)
  local last_md5=$(echo "$LAST_STATE" | jq -r ".\"$file\" // empty")
  if [ "$md5" = "$last_md5" ]; then
    ((UNCHANGED++)) || true
    # Track in new state
    [ "$FIRST" = true ] && FIRST=false || NEW_STATE+=","
    NEW_STATE+="\"$file\":\"$md5\""
    return
  fi

  # Check if file exists in Drive folder
  local existing=$(curl -s "https://www.googleapis.com/drive/v3/files?q=name='${name}'+and+'${folder}'+in+parents+and+trashed=false&fields=files(id)" \
    -H "Authorization: Bearer $ACCESS_TOKEN" | jq -r '.files[0].id // empty')

  local result=""
  if [ -n "$existing" ]; then
    result=$(curl -s -X PATCH "https://www.googleapis.com/upload/drive/v3/files/${existing}?uploadType=media" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -H "Content-Type: text/plain" \
      --data-binary @"$file" | jq -r '.id // empty')
    [ -n "$result" ] && { log "UPDATED: $name"; ((UPDATED++)) || true; } || log "FAIL UPDATE: $name"
  else
    result=$(curl -s -X POST "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -F "metadata={\"name\":\"${name}\",\"mimeType\":\"application/vnd.google-apps.document\",\"parents\":[\"${folder}\"]};type=application/json" \
      -F "file=@${file};type=text/plain" | jq -r '.id // empty')
    [ -n "$result" ] && { log "CREATED: $name"; ((UPLOADED++)) || true; } || log "FAIL CREATE: $name"
  fi

  # Track in new state
  [ "$FIRST" = true ] && FIRST=false || NEW_STATE+=","
  NEW_STATE+="\"$file\":\"$md5\""
}

log "=== Drive sync started ==="

# ── VENTURES ──
sync_file "/root/obsidian-vault/Ventures/Kalshi-Prediction-Markets.md" "${FOLDERS[VK]}"
sync_file "/root/obsidian-vault/Ventures/GSA-Auction-Arbitrage.md" "${FOLDERS[VG]}"
sync_file "/root/obsidian-vault/Ventures/SMB-Acquisition-Pipeline.md" "${FOLDERS[VS]}"
sync_file "/root/obsidian-vault/Ventures/Government-Grants.md" "${FOLDERS[VGR]}"
sync_file "/root/obsidian-vault/Ventures/AI-Trade-School.md" "${FOLDERS[VT]}"

# Venture research files
sync_file "groups/trading/kalshi-api-research.md" "${FOLDERS[VK]}" "Kalshi API Research"
sync_file "groups/business-ideas/government-auction-reselling-analysis.md" "${FOLDERS[VG]}" "Government Auction Reselling Analysis"
sync_file "groups/business-ideas/smb-acquisition-deep-dive.md" "${FOLDERS[VS]}" "SMB Acquisition Deep Dive"
sync_file "groups/business-ideas/deal-screening-system.md" "${FOLDERS[VS]}" "Deal Screening System"
sync_file "groups/business-ideas/SBA-Financing-Package.md" "${FOLDERS[VS]}" "SBA Financing Package"
sync_file "groups/business-ideas/batch9-government-grants-analysis.md" "${FOLDERS[VGR]}" "Government Grants Analysis"
sync_file "groups/business-ideas/batch7-okara-tradeschool-analysis.md" "${FOLDERS[VT]}" "Trade School & Okara Analysis"

# ── BUSINESS IDEAS ──
sync_file "groups/business-ideas/business-analysis.md" "${FOLDERS[BIP]}" "Business Ideas Master Analysis"
sync_file "groups/business-ideas/ideas-index.md" "${FOLDERS[BIP]}" "Ideas Index"
sync_file "groups/business-ideas/all-links.md" "${FOLDERS[BIP]}" "All Links"
sync_file "groups/business-ideas/contrarian-thinking-automation-analysis.md" "${FOLDERS[BIR]}" "Contrarian Thinking Analysis"
for f in groups/business-ideas/business-ideas-daily-report*.md; do
  [ -f "$f" ] && sync_file "$f" "${FOLDERS[BID]}"
done
for f in groups/business-ideas/batch*-analysis.md; do
  [ -f "$f" ] && sync_file "$f" "${FOLDERS[BIB]}"
done

# ── TRADING ──
for f in groups/trading/*-research.md groups/trading/*-strategies.md groups/trading/*-setup-guide.md; do
  [ -f "$f" ] && sync_file "$f" "${FOLDERS[TRR]}"
done
for f in groups/trading/research/DAILY-REPORT-*.md; do
  [ -f "$f" ] && sync_file "$f" "${FOLDERS[TRD]}"
done

# ── RESEARCH (AI) ──
sync_file "groups/ai-research/INTEGRATION-PLAN.md" "${FOLDERS[RES]}" "Integration Plan"
sync_file "groups/ai-research/STRUCTURE-AUDIT-2026-03-07.md" "${FOLDERS[RES]}" "Structure Audit"
for f in groups/ai-research/DAILY-REPORT-*.md; do
  [ -f "$f" ] && sync_file "$f" "${FOLDERS[RESD]}"
done
for f in /root/obsidian-vault/AI-Research/*.md; do
  [ -f "$f" ] && sync_file "$f" "${FOLDERS[RESDD]}"
done

# ── HEALTH ──
for f in /root/obsidian-vault/Health-Wellness/Protocols/*.md; do
  [ -f "$f" ] && sync_file "$f" "${FOLDERS[HLP]}"
done
for f in /root/obsidian-vault/Health-Wellness/Longevity/*.md; do
  [ -f "$f" ] && sync_file "$f" "${FOLDERS[HLP]}"
done
sync_file "/root/obsidian-vault/Health/Nutrition-Tracker.md" "${FOLDERS[HLT]}" "Nutrition Tracker"
sync_file "/root/obsidian-vault/Health/Supplement-Shopping-List.md" "${FOLDERS[HLT]}" "Supplement Shopping List"
sync_file "/root/obsidian-vault/Health/Viome-Full-Body-Analysis-2026-03-11.md" "${FOLDERS[HLV]}" "Viome Full Body Analysis"
for f in /root/obsidian-vault/Health/Newsletter-Intelligence-*.md; do
  [ -f "$f" ] && sync_file "$f" "${FOLDERS[HLN]}"
done
for f in groups/health-wellness/*.md; do
  bname=$(basename "$f")
  [ "$bname" = "CLAUDE.md" ] || [ "$bname" = "RESUME.md" ] && continue
  [ -f "$f" ] && sync_file "$f" "${FOLDERS[HLP]}"
done

# ── CRYPTO ──
for f in groups/crypto/*.md; do
  bname=$(basename "$f")
  [ "$bname" = "CLAUDE.md" ] || [ "$bname" = "RESUME.md" ] && continue
  [ -f "$f" ] && sync_file "$f" "${FOLDERS[CRR]}"
done
for f in groups/crypto/daily-briefs/*.md; do
  [ -f "$f" ] && sync_file "$f" "${FOLDERS[CRD]}"
done

# ── FRAMEWORKS ──
sync_file "/root/obsidian-vault/Frameworks/Opportunity-Evaluation-Framework.md" "${FOLDERS[FW]}" "Opportunity Evaluation Framework"

# Save new state
NEW_STATE+="}"
echo "$NEW_STATE" | jq . > "$STATE_FILE" 2>/dev/null || echo "$NEW_STATE" > "$STATE_FILE"

log "=== Drive sync complete: $UPLOADED new, $UPDATED updated, $UNCHANGED unchanged ==="