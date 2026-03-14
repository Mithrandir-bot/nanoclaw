#!/usr/bin/env bash
# Nutrition alternatives price scanner
# Runs weekly via systemd timer to update data/nutrition-prices.json
# Uses OpenRouter + Gemini Flash to research current grocery prices
set -euo pipefail

cd /root/nanoclaw/nanoclaw

OPENROUTER_API_KEY="${OPENROUTER_API_KEY:-$(grep OPENROUTER_API_KEY .env | cut -d= -f2-)}"
PRICES_FILE="data/nutrition-prices.json"
TRACKER_FILE="/root/obsidian-vault/Health/Nutrition-Tracker.md"
MODEL="google/gemini-3-flash-preview"

if [[ -z "$OPENROUTER_API_KEY" ]]; then
  echo "Error: OPENROUTER_API_KEY not found" >&2
  exit 1
fi

# Extract current alternatives from tracker
ALTERNATIVES=$(python3 << 'PYEOF'
import re, json
with open("/root/obsidian-vault/Health/Nutrition-Tracker.md") as f:
    content = f.read()
# Find the Recommended Alternatives table
in_table = False
items = []
for line in content.split("\n"):
    if "Recommended Alternatives" in line and line.startswith("#"):
        in_table = True
        continue
    if in_table and line.startswith("|") and "Current Item" in line:
        continue
    if in_table and line.startswith("|") and "---" in line:
        continue
    if in_table and line.startswith("|"):
        cols = [c.strip() for c in line.split("|") if c.strip()]
        if len(cols) >= 3:
            items.append({"current": cols[0], "alternative": cols[2]})
    elif in_table and line.strip() and not line.startswith("|"):
        break
print(json.dumps(items))
PYEOF
)

echo "Found alternatives: $ALTERNATIVES"

if [[ "$ALTERNATIVES" == "[]" ]]; then
  echo "No alternatives found in tracker"
  exit 0
fi

PROMPT="You are a grocery price researcher. For each product below, provide current estimated retail prices at these US retailers: Publix (Miami FL), Trader Joe's (Miami FL), Amazon, Walmart, Target.

Products to price:
$ALTERNATIVES

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  \"items\": {
    \"PRODUCT_NAME\": {
      \"currentItem\": \"WHAT_IT_REPLACES\",
      \"vendors\": {
        \"publix\": { \"price\": 8.99, \"priceStatus\": \"estimated\", \"inStock\": true },
        \"traderjoes\": { \"price\": null, \"priceStatus\": \"unavailable\", \"inStock\": false, \"notes\": \"Not carried\" },
        \"amazon\": { \"price\": 10.49, \"priceStatus\": \"estimated\", \"inStock\": true },
        \"walmart\": { \"price\": 7.98, \"priceStatus\": \"estimated\", \"inStock\": true },
        \"target\": { \"price\": 8.29, \"priceStatus\": \"estimated\", \"inStock\": true }
      },
      \"bestDeal\": { \"vendor\": \"walmart\", \"price\": 7.98 }
    }
  }
}

Rules:
- Use \"estimated\" for priceStatus (you are estimating from training data)
- Set price to null and inStock to false for products not available at a retailer
- bestDeal should be the vendor with the lowest non-null price
- Prices should reflect typical 2025-2026 US retail prices
- IMPORTANT: Match the EXACT product variant (e.g. organic vs non-organic, pasture-raised vs cage-free). Do NOT mix up cheaper non-organic variants with organic prices.
- For Publix, use South Florida (Miami) in-store pricing, NOT delivery/Instacart prices which are 30-40% higher
- For Trader Joe's, note they primarily carry their own brand — set price to null if the specific brand is not available
- For Amazon, use Amazon Fresh or direct pricing, NOT third-party sellers with inflated prices
- Include notes field for important caveats (e.g. \"Shipping adds cost\" for Amazon perishables)
- If a url field is present in the existing cache, preserve it"

RESPONSE=$(curl -s https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg model "$MODEL" \
    --arg prompt "$PROMPT" \
    '{
      model: $model,
      messages: [{ role: "user", content: $prompt }],
      max_tokens: 4096,
      temperature: 0.1
    }')")

# Extract JSON from response
RAW=$(echo "$RESPONSE" | jq -r '.choices[0].message.content // empty')

if [[ -z "$RAW" ]]; then
  echo "Error: No response from model"
  echo "$RESPONSE" | jq '.error' 2>/dev/null
  exit 1
fi

# Strip markdown code fences if present
CLEAN=$(echo "$RAW" | sed 's/^```json//;s/^```//;s/```$//' | tr -d '\r')

# Validate JSON and add metadata
python3 << PYEOF
import json, sys
from datetime import datetime, timezone

try:
    data = json.loads('''$CLEAN''')
except:
    # Try reading from the raw output more carefully
    import re
    raw = '''$RAW'''
    # Find JSON object
    m = re.search(r'\{[\s\S]*\}', raw)
    if m:
        data = json.loads(m.group())
    else:
        print("Error: Could not parse JSON from response", file=sys.stderr)
        sys.exit(1)

# Add URLs from existing cache if available
try:
    with open("$PRICES_FILE") as f:
        old = json.load(f)
    for name, item in data.get("items", {}).items():
        old_item = old.get("items", {}).get(name, {})
        for vendor in item.get("vendors", {}):
            old_vendor = old_item.get("vendors", {}).get(vendor, {})
            if old_vendor.get("url") and not item["vendors"][vendor].get("url"):
                item["vendors"][vendor]["url"] = old_vendor["url"]
except:
    pass

# Add metadata
output = {
    "lastUpdated": datetime.now(timezone.utc).isoformat(),
    "schemaVersion": 1,
    "items": data.get("items", data)
}

with open("$PRICES_FILE", "w") as f:
    json.dump(output, f, indent=2)

print(f"Updated {len(output['items'])} items")
for name, item in output["items"].items():
    best = item.get("bestDeal", {})
    print(f"  {name}: best={best.get('vendor','?')} \${best.get('price','?')}")
PYEOF

echo "Price scan complete: $PRICES_FILE"
