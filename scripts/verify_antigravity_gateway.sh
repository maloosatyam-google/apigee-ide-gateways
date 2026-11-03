#!/usr/bin/env bash
# Verify Antigravity Enterprise Gateway (antigravity-gateway-v1) on Apigee X.
# Tests:
#   1. Unbuffered SSE streaming (:streamGenerateContent?alt=sse) via GenAI wire protocol (/v1beta/models/...)
#   2. Non-streaming (:generateContent)
#   3. Internal telemetry endpoints (/v1internal:recordCodeAssistMetrics, /v1internal:registerInteraction)
#   4. Antigravity CLI (agy) smoke test with AGY_LLM_GATEWAY_* environment variables
set -euo pipefail

GATEWAY_URL="${AGY_LLM_GATEWAY_URL:-}"
GATEWAY_API_KEY="${AGY_LLM_GATEWAY_API_KEY:-}"

if [[ -z "${GATEWAY_URL}" || -z "${GATEWAY_API_KEY}" ]]; then
  echo "ERROR: AGY_LLM_GATEWAY_URL and AGY_LLM_GATEWAY_API_KEY must be set in the environment." >&2
  exit 1
fi

export AGY_LLM_GATEWAY_URL="${GATEWAY_URL}"
export AGY_LLM_GATEWAY_API_KEY="${GATEWAY_API_KEY}"
export AGY_LLM_GATEWAY_WIRE_PROTOCOL="${AGY_LLM_GATEWAY_WIRE_PROTOCOL:-genai}"
export AGY_LLM_GATEWAY_HEADERS="${AGY_LLM_GATEWAY_HEADERS:-{\"X-Cost-Center\": \"Core-Engineering\"}}"
export AGY_LLM_GATEWAY_MODELS="${AGY_LLM_GATEWAY_MODELS:-gemini-3.8-flash,gemini-3.1-pro-preview,gemini-3.1-flash-lite}"

echo "=== 1. Verify SSE Streaming (:streamGenerateContent?alt=sse) ==="
curl -sS -N -X POST "${GATEWAY_URL}/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse" \
  -H "Authorization: Bearer ${GATEWAY_API_KEY}" \
  -H "Content-Type: application/json" \
  -H "User-Agent: Antigravity/1.4.7 (aidev_client; auth_method=gateway)" \
  -H "X-Cost-Center: Core-Engineering" \
  -d '{"contents": [{"role": "user", "parts": [{"text": "Reply with PONG"}]}]}'
echo ""

echo "=== 2. Verify Non-Streaming (:generateContent) ==="
curl -sS -i -X POST "${GATEWAY_URL}/v1beta/models/gemini-3.8-flash:generateContent" \
  -H "Authorization: Bearer ${GATEWAY_API_KEY}" \
  -H "Content-Type: application/json" \
  -H "User-Agent: Antigravity/1.4.7 (aidev_client; auth_method=gateway)" \
  -H "X-Cost-Center: Core-Engineering" \
  -d '{"contents": [{"role": "user", "parts": [{"text": "Reply with PONG"}]}]}' | grep -E "HTTP/|x-gateway-|\"text\""
echo ""

echo "=== 3. Verify Internal Telemetry Endpoints (/v1internal:*) ==="
for EP in "v1internal:recordCodeAssistMetrics" "v1internal:registerInteraction" "v1internal:recordInteraction"; do
  echo -n "POST /${EP} -> "
  curl -sS -w " (HTTP %{http_code})\n" -X POST "${GATEWAY_URL}/${EP}" \
    -H "Authorization: Bearer ${GATEWAY_API_KEY}" \
    -H "Content-Type: application/json" \
    -H "User-Agent: Antigravity/1.4.7 (aidev_client; auth_method=gateway)" \
    -d '{}'
done
echo ""

echo "=== 4. Verify Antigravity CLI (agy) Smoke Test ==="
if command -v agy >/dev/null 2>&1; then
  agy --prompt "Reply with PONG and nothing else" --print-timeout 30s
else
  echo "agy CLI not found on PATH; skipping CLI smoke test."
fi

