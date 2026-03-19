#!/usr/bin/env bash
# Bulk upload markdown files to Google Drive as Google Docs
# Usage: ./scripts/drive-upload-batch.sh
set -euo pipefail

cd /root/nanoclaw/nanoclaw
source .env
source /tmp/drive-folders.env

# Get fresh access token
get_token() {
  curl -s -X POST https://oauth2.googleapis.com/token \
    -d "client_id=$GOOGLE_CLIENT_ID&client_secret=$GOOGLE_CLIENT_SECRET&refresh_token=$GOOGLE_REFRESH_TOKEN&grant_type=refresh_token" \
    | jq -r '.access_token'
}

ACCESS_TOKEN=$(get_token)
TOKEN_TIME=$(date +%s)
UPLOADED=0
SKIPPED=0
FAILED=0

# Refresh token if older than 50 minutes
maybe_refresh() {
  local now=$(date +%s)
  if (( now - TOKEN_TIME > 3000 )); then
    ACCESS_TOKEN=$(get_token)
    TOKEN_TIME=$now
    echo "  [token refreshed]"
  fi
}

# Upload a markdown file as a Google Doc
# Args: $1=file_path $2=folder_id $3=optional_name
upload_md() {
  local file="$1" folder="$2" name="${3:-}"
  if [ ! -f "$file" ]; then
    echo "  SKIP (not found): $file"
    ((SKIPPED++)) || true
    return
  fi
  local size=$(stat -c%s "$file" 2>/dev/null || echo 0)
  if [ "$size" -lt 10 ]; then
    echo "  SKIP (empty): $file"
    ((SKIPPED++)) || true
    return
  fi

  maybe_refresh

  [ -z "$name" ] && name=$(basename "$file" .md)

  # Check if file already exists in folder
  local existing=$(curl -s "https://www.googleapis.com/drive/v3/files?q=name='${name}'+and+'${folder}'+in+parents+and+trashed=false&fields=files(id)" \
    -H "Authorization: Bearer $ACCESS_TOKEN" | jq -r '.files[0].id // empty')

  if [ -n "$existing" ]; then
    # Update existing file
    local result=$(curl -s -X PATCH "https://www.googleapis.com/upload/drive/v3/files/${existing}?uploadType=media" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -H "Content-Type: text/plain" \
      --data-binary @"$file" | jq -r '.id // empty')
    if [ -n "$result" ]; then
      echo "  UPDATED: $name ($size bytes)"
      ((UPLOADED++)) || true
    else
      echo "  FAILED UPDATE: $name"
      ((FAILED++)) || true
    fi
  else
    # Create new file (upload as Google Doc)
    local metadata="{\"name\":\"${name}\",\"mimeType\":\"application/vnd.google-apps.document\",\"parents\":[\"${folder}\"]}"
    local result=$(curl -s -X POST "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -F "metadata=${metadata};type=application/json" \
      -F "file=@${file};type=text/plain" | jq -r '.id // empty')
    if [ -n "$result" ]; then
      echo "  CREATED: $name ($size bytes)"
      ((UPLOADED++)) || true
    else
      echo "  FAILED: $name"
      ((FAILED++)) || true
    fi
  fi
}

echo "=== DRIVE BULK UPLOAD ==="
echo "Started: $(date)"
echo ""

# ── VENTURES ──
echo "── Ventures/Kalshi-Prediction-Markets ──"
upload_md "/root/obsidian-vault/Ventures/Kalshi-Prediction-Markets.md" "$VK"
upload_md "groups/trading/kalshi-api-research.md" "$VK" "Kalshi API Research"
upload_md "groups/trading/research/optionalpha-api-research.md" "$VK" "OptionAlpha API Research"

echo "── Ventures/GSA-Auction-Arbitrage ──"
upload_md "/root/obsidian-vault/Ventures/GSA-Auction-Arbitrage.md" "$VG"
upload_md "groups/business-ideas/government-auction-reselling-analysis.md" "$VG" "Government Auction Reselling Analysis"
upload_md "groups/business-ideas/government-auction-arbitrage-analysis.md" "$VG" "Government Auction Arbitrage Analysis"

echo "── Ventures/SMB-Acquisition ──"
upload_md "/root/obsidian-vault/Ventures/SMB-Acquisition-Pipeline.md" "$VS"
upload_md "groups/business-ideas/smb-acquisition-deep-dive.md" "$VS" "SMB Acquisition Deep Dive"
upload_md "groups/business-ideas/deal-screening-system.md" "$VS" "Deal Screening System"
upload_md "groups/business-ideas/SBA-Financing-Package.md" "$VS" "SBA Financing Package"
upload_md "groups/business-ideas/south-florida-acquisition-platforms-analysis.md" "$VS" "South Florida Acquisition Platforms"
upload_md "groups/business-ideas/south-florida-listings-report.md" "$VS" "South Florida Listings Report"
upload_md "groups/business-ideas/bizbuysell-screening-design.md" "$VS" "BizBuySell Screening Design"

echo "── Ventures/Government-Grants ──"
upload_md "/root/obsidian-vault/Ventures/Government-Grants.md" "$VGR"
upload_md "groups/business-ideas/batch9-government-grants-analysis.md" "$VGR" "Government Grants Analysis"

echo "── Ventures/AI-Trade-School ──"
upload_md "/root/obsidian-vault/Ventures/AI-Trade-School.md" "$VT"
upload_md "groups/business-ideas/batch7-okara-tradeschool-analysis.md" "$VT" "Trade School & Okara Analysis"

# ── BUSINESS IDEAS ──
echo "── Business Ideas/Pipeline ──"
upload_md "groups/business-ideas/business-analysis.md" "$BIP" "Business Ideas Master Analysis"
upload_md "groups/business-ideas/ideas-index.md" "$BIP" "Ideas Index"
upload_md "groups/business-ideas/all-links.md" "$BIP" "All Links"
upload_md "groups/business-ideas/business-acquisition-links-analysis.md" "$BIP" "Business Acquisition Links Analysis"

echo "── Business Ideas/Batch Analysis ──"
upload_md "groups/business-ideas/batch4-analysis.md" "$BIB" "Batch 4 Analysis"
upload_md "groups/business-ideas/batch7-okara-tradeschool-analysis.md" "$BIB" "Batch 7 - Okara & Trade School"
upload_md "groups/business-ideas/batch9-government-grants-analysis.md" "$BIB" "Batch 9 - Government Grants"

echo "── Business Ideas/Daily Reports ──"
for f in groups/business-ideas/business-ideas-daily-report*.md; do
  [ -f "$f" ] && upload_md "$f" "$BID"
done

echo "── Business Ideas/Research ──"
upload_md "groups/business-ideas/contrarian-thinking-automation-analysis.md" "$BIR" "Contrarian Thinking Automation Analysis"
upload_md "groups/business-ideas/auto-transport-api-research.md" "$BIR" "Auto Transport API Research"
upload_md "groups/business-ideas/link6-meta-ads-openclaw-analysis.md" "$BIR" "Meta Ads & OpenClaw Analysis"
upload_md "groups/business-ideas/openclaw-tiktok-agent-analysis.md" "$BIR" "OpenClaw TikTok Agent Analysis"
upload_md "groups/business-ideas/paperclip-ai-analysis.md" "$BIR" "Paperclip AI Analysis"
upload_md "groups/business-ideas/virtuals-acp-agent-commerce-analysis.md" "$BIR" "Virtuals ACP Agent Commerce Analysis"
upload_md "groups/business-ideas/genspark-ai-workspace-3-analysis.md" "$BIR" "GenSpark AI Workspace Analysis"

# ── TRADING ──
echo "── Trading/Research ──"
upload_md "groups/trading/core-tax-deeds-research.md" "$TRR" "Core Tax Deeds Research"
upload_md "groups/trading/option-alpha-research.md" "$TRR" "Option Alpha Research"
upload_md "groups/trading/tonys-trading-research.md" "$TRR" "Tonys Trading Research"
upload_md "groups/trading/tradier-api-research.md" "$TRR" "Tradier API Research"
upload_md "groups/trading/leaps-channel-research.md" "$TRR" "LEAPS Channel Research"
upload_md "groups/trading/ross-cameron-trading-strategies.md" "$TRR" "Ross Cameron Trading Strategies"
upload_md "groups/trading/yield-collector-research.md" "$TRR" "Yield Collector Research"
upload_md "groups/trading/polymarket-api-research.md" "$TRR" "Polymarket API Research"
upload_md "groups/trading/option-alpha-bot-setup-guide.md" "$TRR" "Option Alpha Bot Setup Guide"

echo "── Trading/Daily Reports ──"
for f in groups/trading/research/DAILY-REPORT-*.md; do
  [ -f "$f" ] && upload_md "$f" "$TRD"
done
for f in groups/trading/research/trading-strategy-*.md groups/trading/research/retail-trading-*.md; do
  [ -f "$f" ] && upload_md "$f" "$TRD"
done

echo "── Trading/Automation ──"
for f in /root/obsidian-vault/Trading/Automation-*.md /root/obsidian-vault/Trading/Broker-*.md /root/obsidian-vault/Trading/IBKR-*.md /root/obsidian-vault/Trading/CFO-*.md; do
  [ -f "$f" ] && upload_md "$f" "$TRA"
done

# ── RESEARCH (AI) ──
echo "── Research/AI & Automation ──"
upload_md "groups/ai-research/INTEGRATION-PLAN.md" "$RES" "Integration Plan"
upload_md "groups/ai-research/STRUCTURE-AUDIT-2026-03-07.md" "$RES" "Structure Audit 2026-03-07"
upload_md "groups/ai-research/IMPLEMENTATIONS-2026-03-06.md" "$RES" "Implementations 2026-03-06"
upload_md "groups/ai-research/gws-vs-googleapis-comparison.md" "$RES" "GWS vs googleapis Comparison"
upload_md "groups/ai-research/mission-control-build-prompt.md" "$RES" "Mission Control Build Prompt"

echo "── Research/Daily Reports ──"
for f in groups/ai-research/DAILY-REPORT-*.md; do
  [ -f "$f" ] && upload_md "$f" "$RESD"
done

echo "── Research/Deep Dives ──"
upload_md "groups/ai-research/google-adk-deep-dive-2026-03-12.md" "$RESDD" "Google ADK Deep Dive"
upload_md "groups/ai-research/google-adk-memory-poc-2026-03-13.md" "$RESDD" "Google ADK Memory POC"
upload_md "groups/ai-research/alibaba-cloud-research-2026-03-09.md" "$RESDD" "Alibaba Cloud Research"
upload_md "groups/ai-research/openai-shell-skills-compaction-deep-dive.md" "$RESDD" "OpenAI Shell Skills Deep Dive"
upload_md "groups/ai-research/deerflow-2-deployment-analysis-2026-03-06.md" "$RESDD" "DeerFlow 2 Deployment Analysis"
upload_md "groups/ai-research/paperclip-analysis-2026-03-18.md" "$RESDD" "Paperclip Analysis"
upload_md "groups/ai-research/ai-scan-2026-03-18.md" "$RESDD" "AI Scan 2026-03-18"
for f in groups/ai-research/link-analysis-*.md; do
  [ -f "$f" ] && upload_md "$f" "$RESDD"
done

# ── HEALTH ──
echo "── Health/Protocols ──"
upload_md "/root/obsidian-vault/Health-Wellness/Hair-Thinning-Crown-Protocol.md" "$HLP" "Hair Thinning Crown Protocol"
upload_md "/root/obsidian-vault/Health-Wellness/Cancer-Prevention-ISOM-Protocol.md" "$HLP" "Cancer Prevention ISOM Protocol"
upload_md "/root/obsidian-vault/Health-Wellness/Peptide-Reclassification-2026.md" "$HLP" "Peptide Reclassification 2026"
upload_md "/root/obsidian-vault/Health-Wellness/Peptides-For-Training-Recovery.md" "$HLP" "Peptides for Training Recovery"
upload_md "/root/obsidian-vault/Health-Wellness/Supplement-Quality-Analysis.md" "$HLP" "Supplement Quality Analysis"
upload_md "/root/obsidian-vault/Health-Wellness/7AM-Daily-Ritual.md" "$HLP" "7AM Daily Ritual"
upload_md "groups/health-wellness/crown-thinning-protocol-2026-03-09.md" "$HLP" "Crown Thinning Protocol 2026-03-09"
upload_md "groups/health-wellness/hair-loss-non-pharma-interventions-2026-03-09.md" "$HLP" "Hair Loss Non-Pharma Interventions"

echo "── Health/Viome ──"
upload_md "/root/obsidian-vault/Health/Viome-Full-Body-Analysis-2026-03-11.md" "$HLV" "Viome Full Body Analysis"
upload_md "groups/health-wellness/viome-analysis-2026-03-11.md" "$HLV" "Viome Analysis Detail"
upload_md "groups/health-wellness/lab-results-analysis-2026-03-10.md" "$HLV" "Lab Results Analysis"
upload_md "groups/health-wellness/methylation-test-research-2026-03-14.md" "$HLV" "Methylation Test Research"

echo "── Health/Tracking ──"
upload_md "/root/obsidian-vault/Health/Nutrition-Tracker.md" "$HLT" "Nutrition Tracker"
upload_md "/root/obsidian-vault/Health/Supplement-Shopping-List.md" "$HLT" "Supplement Shopping List"
upload_md "groups/health-wellness/supplement-matrix-2026-03-11.md" "$HLT" "Supplement Matrix"
upload_md "groups/health-wellness/product-specs.md" "$HLT" "Product Specs"
upload_md "groups/health-wellness/shopping-list-2026-03-11.md" "$HLT" "Shopping List"

echo "── Health/Newsletters ──"
upload_md "/root/obsidian-vault/Health/Newsletter-Intelligence-2026-03-16.md" "$HLN" "Newsletter Intelligence 2026-03-16"
upload_md "/root/obsidian-vault/Health/Newsletter-Intelligence-2026-03-18.md" "$HLN" "Newsletter Intelligence 2026-03-18"
upload_md "groups/health-wellness/newsletter-log.md" "$HLN" "Newsletter Log"

# ── CRYPTO ──
echo "── Crypto/Research ──"
upload_md "groups/crypto/stablecoin-card-research-2026.md" "$CRR" "Stablecoin Card Research"
upload_md "groups/crypto/upshift-api-research.md" "$CRR" "Upshift API Research"
upload_md "groups/crypto/erc-8183-tracker.md" "$CRR" "ERC-8183 Tracker"
upload_md "groups/crypto/cbbtc-carry-monitor.md" "$CRR" "cBBTC Carry Monitor"

echo "── Crypto/Daily Briefs ──"
for f in groups/crypto/daily-briefs/*.md; do
  [ -f "$f" ] && upload_md "$f" "$CRD"
done

# ── CONTACTS ──
echo "── Contacts/Workflows ──"
for f in groups/contacts/BATCH_IMPORT_WORKFLOW.md groups/contacts/CONTACT_IMPORT_WORKFLOW.md \
  groups/contacts/POST_UPLOAD_WORKFLOW.md groups/contacts/ENRICHMENT_GUIDE.md \
  groups/contacts/NIGHTLY_ENRICHMENT_SETUP.md groups/contacts/BACKUP_SYSTEM.md; do
  [ -f "$f" ] && upload_md "$f" "$COW"
done

# ── FRAMEWORKS ──
echo "── Frameworks ──"
upload_md "/root/obsidian-vault/Frameworks/Opportunity-Evaluation-Framework.md" "$FW" "Opportunity Evaluation Framework"

echo ""
echo "=== COMPLETE ==="
echo "Uploaded: $UPLOADED | Skipped: $SKIPPED | Failed: $FAILED"
echo "Finished: $(date)"