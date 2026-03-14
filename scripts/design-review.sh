#!/usr/bin/env bash
# Code/design review via AI model
# Usage: ./scripts/design-review.sh <file> [section-description]
# Example: ./scripts/design-review.sh dashboard/server.ts "describeCron"
#
# Backends (set REVIEW_BACKEND env var):
#   nvidia  - Kimi K2 via NVIDIA NIM (free, default)
#   openrouter - via OpenRouter (Gemini Flash or any model)
#
# Override model: REVIEW_MODEL=moonshotai/kimi-k2.5 ./scripts/design-review.sh ...

set -euo pipefail

FILE="${1:?Usage: design-review.sh <file> [section-description]}"
SECTION="${2:-}"
BACKEND="${REVIEW_BACKEND:-nvidia}"

# Load keys
NVIDIA_KEY="${MOONSHOT_API_KEY:-$(grep -s MOONSHOT_API_KEY /root/nanoclaw/nanoclaw/.env | cut -d= -f2- || true)}"
OPENROUTER_KEY="${OPENROUTER_API_KEY:-$(grep -s OPENROUTER_API_KEY /root/nanoclaw/nanoclaw/.env | cut -d= -f2- || true)}"

# Extract relevant code
if [[ -n "$SECTION" ]]; then
  CODE=$(sed -n "/$SECTION/,/^};$\|^function \|^export function /p" "$FILE" 2>/dev/null | head -500)
  if [[ -z "$CODE" ]]; then
    CODE=$(grep -A 500 "$SECTION" "$FILE" 2>/dev/null | head -500)
  fi
  [[ -z "$CODE" ]] && CODE=$(head -500 "$FILE")
else
  CODE=$(head -800 "$FILE")
fi

CODE="${CODE:0:30000}"

PROMPT="Review this code for: 1) Logic bugs 2) Edge cases 3) Improvements. Be specific and actionable — reference the code directly. No generic advice.

Section: ${SECTION:-full file}

\`\`\`
${CODE}
\`\`\`"

if [[ "$BACKEND" == "nvidia" ]]; then
  if [[ -z "$NVIDIA_KEY" ]]; then
    echo "Error: MOONSHOT_API_KEY not found in env or .env" >&2
    exit 1
  fi
  MODEL="${REVIEW_MODEL:-moonshotai/kimi-k2-instruct}"
  API_URL="https://integrate.api.nvidia.com/v1/chat/completions"
  AUTH_HEADER="Authorization: Bearer $NVIDIA_KEY"
else
  if [[ -z "$OPENROUTER_KEY" ]]; then
    echo "Error: OPENROUTER_API_KEY not found" >&2
    exit 1
  fi
  MODEL="${REVIEW_MODEL:-google/gemini-3-flash-preview}"
  API_URL="https://openrouter.ai/api/v1/chat/completions"
  AUTH_HEADER="Authorization: Bearer $OPENROUTER_KEY"
fi

echo "Reviewing with $MODEL via $BACKEND..." >&2

# Use python for reliable JSON encoding
python3 -c "
import json, urllib.request, ssl, sys

prompt = sys.stdin.read()
payload = json.dumps({
    'model': '$MODEL',
    'messages': [{'role': 'user', 'content': prompt}],
    'max_tokens': 2048,
    'temperature': 0.3
}).encode()

headers = {
    '${AUTH_HEADER%%:*}': '${AUTH_HEADER#*: }',
    'Content-Type': 'application/json'
}
if '$BACKEND' == 'openrouter':
    headers['HTTP-Referer'] = 'https://nanoclaw.local'

req = urllib.request.Request('$API_URL', data=payload, headers=headers)
ctx = ssl.create_default_context()
try:
    resp = urllib.request.urlopen(req, timeout=120, context=ctx)
    data = json.loads(resp.read())
    print(data['choices'][0]['message']['content'])
except Exception as e:
    print(f'Error: {e}', file=sys.stderr)
    sys.exit(1)
" <<< "$PROMPT"
