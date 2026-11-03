# Antigravity Enterprise Gateway on Apigee X (`antigravity-gateway-v1`)

Routes all **Google Antigravity** traffic (`agy` CLI, Antigravity App / IDE, and Antigravity ACP Server) through an Apigee X reverse proxy to **Google Cloud Vertex AI** (`aiplatform.googleapis.com`), eliminating direct developer workstation egress to `*.googleapis.com` and interactive browser OAuth login while preserving Gemini Enterprise billing attribution and per-user audit logging.

---

## 1. Client Configuration (Generic Templates)

Antigravity supports two configuration methods:
1. **`admin_settings.json`** (recommended for macOS/Linux/Windows workstation & MDM deployments)
2. **Environment Variables (`AGY_LLM_GATEWAY_*`) + Token Helper** (recommended for CLI shells, CI/CD, and per-user GCP identity attribution, analogous to `~/.claude/settings.json`)

### Option A: `admin_settings.json` (Workstation / MDM)

**File Locations:**
- **macOS:** `/Library/Application Support/Antigravity/admin_settings.json`
- **Linux:** `/etc/antigravity/admin_settings.json`
- **Windows:** `%ProgramData%\Antigravity\admin_settings.json`

**Content of `admin_settings.json`:**
```json
{
  "gateway": {
    "enabled": true,
    "url": "https://APIGEE_HOST/PROXY_BASEPATH",
    "apiKey": "APIGEE_KEY",
    "wireProtocol": "genai",
    "customHeaders": {
      "x-apikey": "APIGEE_KEY",
      "X-Goog-User-Project": "PROJECT_ID",
      "X-Cost-Center": "Core-Engineering"
    },
    "models": {
      "defaultModelId": "gemini-3.8-flash",
      "filter": [
        "gemini-3.8-flash",
        "gemini-3.1-pro-preview",
        "gemini-3.1-flash-lite"
      ]
    }
  },
  "auth": {
    "suppressInteractiveLogin": true
  }
}
```
> **Optional Private CA:** If your Apigee ingress uses an internal corporate CA, add `"caCertPath": "/etc/ssl/certs/corp-root-ca.pem"` inside `"gateway"`. Omit `caCertPath` when using a publicly trusted TLS certificate.

---

### Option B: CLI Environment Variables + Identity Token Helper (Claude Code Equivalent)

Just like Claude Code's `~/.claude/settings.json` + `~/.claude/get-apigee-token.sh` pattern (where `x-apikey` authenticates the Apigee Product and `Authorization: Bearer $(gcloud auth print-identity-token)` attributes the call to the developer's email), `antigravity-gateway-v1` accepts:
- **`x-apikey: APIGEE_KEY`** in `customHeaders` / `AGY_LLM_GATEWAY_HEADERS` (validated by `VA-VerifyAPIKey`)
- **`Authorization: Bearer <TOKEN>`** via `AGY_LLM_GATEWAY_API_KEY` (decoded by `DJWT-ExtractUserIdentity` for `dc_user_email` analytics & Cloud Logging attribution, or used directly as the Apigee API key if `x-apikey` is omitted)

**Content of `~/.antigravity/get-apigee-token.sh`:**
```bash
#!/bin/bash
gcloud auth print-identity-token
```

```bash
chmod +x ~/.antigravity/get-apigee-token.sh
```

**Shell Profile (`~/.zshrc` or `~/.bashrc`):**
```bash
export AGY_LLM_GATEWAY_URL="https://APIGEE_HOST/PROXY_BASEPATH"
export AGY_LLM_GATEWAY_API_KEY="$(~/.antigravity/get-apigee-token.sh)"
export AGY_LLM_GATEWAY_WIRE_PROTOCOL="genai"
export AGY_LLM_GATEWAY_HEADERS='{"x-apikey": "APIGEE_KEY", "X-Goog-User-Project": "PROJECT_ID", "X-Cost-Center": "Core-Engineering"}'
export AGY_LLM_GATEWAY_MODELS="gemini-3.8-flash,gemini-3.1-pro-preview,gemini-3.1-flash-lite"
```
*(If `gcloud` is not installed on developer workstations, set `export AGY_LLM_GATEWAY_API_KEY="APIGEE_KEY"` directly.)*

---

### Side-by-Side Comparison: Claude CLI vs. Antigravity CLI on Apigee

| Setting | Claude CLI (`apigee-claude-cli`) | Antigravity (`antigravity-gateway-v1`) |
|---|---|---|
| **Config File** | `~/.claude/settings.json` | `/Library/Application Support/Antigravity/admin_settings.json` |
| **Gateway Base URL** | `"ANTHROPIC_VERTEX_BASE_URL": "https://APIGEE_HOST/apigee-claude-cli/v1"` | `"url": "https://APIGEE_HOST/antigravity/v1"` (`AGY_LLM_GATEWAY_URL`) |
| **Wire Protocol** | Vertex Anthropic (`CLAUDE_CODE_USE_VERTEX=1`) | Google GenAI (`"wireProtocol": "genai"`) |
| **Apigee API Key** | `"ANTHROPIC_CUSTOM_HEADERS": "x-apikey: APIGEE_KEY"` | `"customHeaders": {"x-apikey": "APIGEE_KEY"}` or `"apiKey": "APIGEE_KEY"` |
| **Identity Token Helper** | `"apiKeyHelper": "~/.claude/get-apigee-token.sh"` | `AGY_LLM_GATEWAY_API_KEY="$(~/.antigravity/get-apigee-token.sh)"` |
| **Skip Client OAuth** | `"CLAUDE_CODE_SKIP_VERTEX_AUTH": "1"` | `"auth": {"suppressInteractiveLogin": true}` |

---

## 2. Apigee Proxy Architecture (`antigravity-gateway-v1`)

Base path: `/antigravity/v1`

### Supported Upstream & Client Endpoints
1. **Unbuffered SSE Streaming (`POST /v1beta/models/{model}:streamGenerateContent?alt=sse`)**
   - Routed to `targets/vertex-stream.xml` with `response.streaming.enabled=true` and `io.timeout.millis=300000`.
   - Rewrites target URL to:
     `https://aiplatform.googleapis.com/v1/projects/{organization.name}/locations/global/publishers/google/models/{flow.target_model}:streamGenerateContent?alt=sse`
   - Skips response body parsing policies in `PostFlow` so `text/event-stream` chunks flush immediately without buffering.
2. **Unary Inference (`POST /v1beta/models/{model}:generateContent`)**
   - Routed to `targets/vertex.xml` and rewritten to Vertex AI `:generateContent`.
   - Extracts token counts (`EV-ModelResponse`), calculates cost (`KVM-GetModelRates` + `JS-CalculateCost`), and emits `x-gateway-*` headers.
3. **Internal Telemetry Acknowledgement (`POST /v1internal:*`)**
   - Matches `/v1internal:recordCodeAssistMetrics`, `/v1internal:registerInteraction`, and `/v1internal:recordInteraction`.
   - Handled via a null route (`RouteRule name="telemetry-ack"`) and `AM-AckTelemetry` returning `200 OK` (`{}`).
4. **Header Preservation & Auth Mediation (`AM-RemoveAuthorization`)**
   - Strips client gateway credentials (`x-apikey`, `x-goog-api-key`, `Authorization`, `X-Identity-Token`, `X-User-Email`) before forwarding to Vertex AI using the proxy's attached GCP Service Account (`GoogleAccessToken` with `roles/aiplatform.user`).
   - Preserves `User-Agent: Antigravity/<version> (aidev_client; auth_method=gateway)`, `X-Goog-Api-Client`, `X-Goog-User-Project`, and custom `X-*` headers unchanged to Vertex AI.

---

## 3. Deployment Commands

```bash
SK=/path/to/apigee-skills/skills
export APIGEE_ORG="PROJECT_ID"
export APIGEE_ENV="dev"
export RUNTIME_SA="ai-client@${APIGEE_ORG}.iam.gserviceaccount.com"

# 1. Validate bundle
python3 $SK/apigee-proxy-builder/scripts/validate_bundle.py \
  . --strict

# 2. Import and deploy proxy
python3 $SK/apigee-proxy-lifecycle/scripts/apigee_ctl.py update \
  . --env $APIGEE_ENV --sa $RUNTIME_SA

# 3. Apply API Product & create Developer App credentials
python3 $SK/apigee-proxy-lifecycle/scripts/apigee_ctl.py product-apply \
  ./config/api_product.json --env $APIGEE_ENV

python3 $SK/apigee-proxy-lifecycle/scripts/apigee_ctl.py app-create \
  developer@example.com antigravity-cli-app \
  --product "Antigravity Enterprise Gateway" \
  --create-developer \
  --credentials-out ./antigravity-cli-app.creds.json
```

---

## 4. Verification & Troubleshooting

### Step 1: Verify SSE Streaming Ingress with `curl`
```bash
curl -N -X POST "https://APIGEE_HOST/antigravity/v1/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse" \
  -H "Authorization: Bearer APIGEE_KEY" \
  -H "x-apikey: APIGEE_KEY" \
  -H "Content-Type: application/json" \
  -H "User-Agent: Antigravity/1.4.7 (aidev_client; auth_method=gateway)" \
  -d '{"contents": [{"role": "user", "parts": [{"text": "Reply with PONG"}]}]}'
```

### Step 2: Verify Telemetry Endpoints with `curl`
```bash
curl -i -X POST "https://APIGEE_HOST/antigravity/v1/v1internal:recordCodeAssistMetrics" \
  -H "Authorization: Bearer APIGEE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Step 3: Verify `agy` CLI
```bash
agy --prompt "Explain binary search in Go in 3 bullet points"
```

### Step 4: Verify Attribution in Cloud Logging
```text
logName="projects/PROJECT_ID/logs/apigee" AND jsonPayload.apiProxyName="antigravity-gateway-v1"
```
Confirm `jsonPayload.userAgent` contains `Antigravity/<version> (...; auth_method=gateway)` and `jsonPayload.responseStatusCode="200"`.

