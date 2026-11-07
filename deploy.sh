#!/usr/bin/env bash
# Deploys worker.js to Cloudflare Workers using only curl + node (works in Termux).
# Secrets are asked interactively (hidden input) and are never written to disk.
set -e
cd "$(dirname "$0")"
FILE="worker.js"
[ -f "$FILE" ] || { echo "$FILE not found next to this script"; exit 1; }

if [ -z "$CF_API_TOKEN" ]; then read -rsp "Cloudflare API token: " CF_API_TOKEN; echo; fi
if [ -z "$BOT_TOKEN" ]; then read -rsp "Telegram bot token (from BotFather): " BOT_TOKEN; echo; fi
if [ -z "$OWNER_ID" ]; then read -rp "Owner numeric Telegram ID: " OWNER_ID; fi
if [ -z "$WORKER_NAME" ]; then read -rp "Worker name [getid-bot]: " WORKER_NAME; fi
NAME="${WORKER_NAME:-getid-bot}"
case "$OWNER_ID" in ''|*[!0-9]*) echo "Owner ID must be a number."; exit 1;; esac

H="Authorization: Bearer $CF_API_TOKEN"
js() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);$1})"; }

if [ -z "$CF_ACCOUNT_ID" ]; then
  CF_ACCOUNT_ID=$(curl -s "https://api.cloudflare.com/client/v4/accounts" -H "$H" | js 'console.log(j.result&&j.result[0]?j.result[0].id:"")')
fi
[ -z "$CF_ACCOUNT_ID" ] && { echo "Could not detect account id (invalid token?)."; exit 1; }
B="https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID"

echo "1) KV namespace..."
KV_ID=$(curl -s -X POST "$B/storage/kv/namespaces" -H "$H" -H 'content-type: application/json' \
  -d '{"title":"getid-bot-db"}' | js 'console.log(j.result?j.result.id:"")')
if [ -z "$KV_ID" ]; then
  KV_ID=$(curl -s "$B/storage/kv/namespaces?per_page=100" -H "$H" | js 'const n=(j.result||[]).find(x=>x.title==="getid-bot-db");console.log(n?n.id:"")')
fi
[ -z "$KV_ID" ] && { echo "KV failed. The token needs: Workers KV Storage - Edit."; exit 1; }

echo "2) Uploading worker..."
META=$(KV_ID="$KV_ID" BT="$BOT_TOKEN" OID="$OWNER_ID" node -e 'console.log(JSON.stringify({main_module:"worker.js",compatibility_date:"2025-01-01",bindings:[{type:"kv_namespace",name:"DB",namespace_id:process.env.KV_ID},{type:"secret_text",name:"BOT_TOKEN",text:process.env.BT},{type:"plain_text",name:"OWNER_ID",text:process.env.OID}]}))')
RES=$(curl -s -X PUT "$B/workers/scripts/$NAME" -H "$H" \
  -F "metadata=$META;type=application/json" \
  -F "worker.js=@$FILE;filename=worker.js;type=application/javascript+module")
echo "$RES" | js 'if(!j.success){console.log(JSON.stringify(j.errors));process.exit(1)}console.log("   uploaded")'

echo "3) Enabling workers.dev route..."
curl -s -X POST "$B/workers/scripts/$NAME/subdomain" -H "$H" -H 'content-type: application/json' -d '{"enabled":true}' >/dev/null

SUB=$(curl -s "$B/workers/subdomain" -H "$H" | js 'console.log(j.result&&j.result.subdomain?j.result.subdomain:"")')
if [ -z "$SUB" ]; then
  echo "No workers.dev subdomain yet. Create one in the dashboard (Workers & Pages), then open:"
  echo "https://$NAME.<your-subdomain>.workers.dev/setup"
  exit 0
fi

URL="https://$NAME.$SUB.workers.dev"
echo "4) Setting Telegram webhook..."
sleep 5
curl -s "$URL/setup"
echo
echo "Done: $URL"
unset CF_API_TOKEN BOT_TOKEN OWNER_ID
