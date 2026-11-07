#!/usr/bin/env bash
# Deploy worker.js to Cloudflare Workers using curl + node (works in Termux).
# Secrets are requested interactively and are not written to disk.
set -euo pipefail
cd "$(dirname "$0")"
FILE="worker.js"
[ -f "$FILE" ] || { echo "$FILE not found next to this script"; exit 1; }

if [ -z "${CF_API_TOKEN:-}" ]; then read -rsp "Cloudflare API token: " CF_API_TOKEN; echo; fi
if [ -z "${BOT_TOKEN:-}" ]; then read -rsp "Telegram bot token (from BotFather): " BOT_TOKEN; echo; fi
if [ -z "${OWNER_ID:-}" ]; then read -rp "Owner numeric Telegram ID: " OWNER_ID; fi
if [ -z "${WORKER_NAME:-}" ]; then read -rp "Worker name [getid-bot]: " WORKER_NAME; fi
NAME="${WORKER_NAME:-getid-bot}"
case "$OWNER_ID" in ''|*[!0-9]*) echo "Owner ID must be a number."; exit 1;; esac

# A distinct random secret protects the setup endpoint; it is sent to Cloudflare as a Worker secret.
SETUP_SECRET=$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')
H="Authorization: Bearer $CF_API_TOKEN"
js() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);$1})"; }

if [ -z "${CF_ACCOUNT_ID:-}" ]; then
  CF_ACCOUNT_ID=$(curl -fsS "https://api.cloudflare.com/client/v4/accounts" -H "$H" | js 'console.log(j.result&&j.result[0]?j.result[0].id:"")')
fi
[ -n "$CF_ACCOUNT_ID" ] || { echo "Could not detect account id (check the API token)."; exit 1; }
B="https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID"

echo "1) KV namespace..."
KV_RESPONSE=$(curl -sS -X POST "$B/storage/kv/namespaces" -H "$H" -H 'content-type: application/json' -d '{"title":"getid-bot-db"}')
KV_ID=$(printf '%s' "$KV_RESPONSE" | js 'console.log(j.result?j.result.id:"")')
if [ -z "$KV_ID" ]; then
  KV_ID=$(curl -fsS "$B/storage/kv/namespaces?per_page=100" -H "$H" | js 'const n=(j.result||[]).find(x=>x.title==="getid-bot-db");console.log(n?n.id:"")')
fi
[ -n "$KV_ID" ] || { echo "KV failed. The token needs Workers KV Storage - Edit."; exit 1; }

echo "2) Uploading worker..."
META=$(KV_ID="$KV_ID" BT="$BOT_TOKEN" OID="$OWNER_ID" SS="$SETUP_SECRET" node -e 'console.log(JSON.stringify({main_module:"worker.js",compatibility_date:"2025-01-01",bindings:[{type:"kv_namespace",name:"DB",namespace_id:process.env.KV_ID},{type:"secret_text",name:"BOT_TOKEN",text:process.env.BT},{type:"plain_text",name:"OWNER_ID",text:process.env.OID},{type:"secret_text",name:"SETUP_SECRET",text:process.env.SS}]}))')
RES=$(curl -sS -X PUT "$B/workers/scripts/$NAME" -H "$H" \
  -F "metadata=$META;type=application/json" \
  -F "worker.js=@$FILE;filename=worker.js;type=application/javascript+module")
printf '%s' "$RES" | js 'if(!j.success){console.error(JSON.stringify(j.errors));process.exit(1)}console.log("   uploaded")'

echo "3) Enabling workers.dev route..."
curl -fsS -X POST "$B/workers/scripts/$NAME/subdomain" -H "$H" -H 'content-type: application/json' -d '{"enabled":true}' >/dev/null
SUB=$(curl -fsS "$B/workers/subdomain" -H "$H" | js 'console.log(j.result&&j.result.subdomain?j.result.subdomain:"")')
if [ -z "$SUB" ]; then
  echo "No workers.dev subdomain yet. Create one in Workers & Pages, then rerun this script."
  exit 1
fi

URL="https://$NAME.$SUB.workers.dev"
echo "4) Setting Telegram webhook..."
sleep 5
curl -fsS "$URL/setup" -H "X-Setup-Secret: $SETUP_SECRET"
echo
echo "Done: $URL"
echo "Keep the setup secret private; it was generated and stored as a Worker secret."
unset CF_API_TOKEN BOT_TOKEN OWNER_ID SETUP_SECRET
