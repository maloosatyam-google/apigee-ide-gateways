# Apigee X Enterprise Gateways for AI Coding Assistants (`apigee-ide-gateways`)

Enterprise reverse proxies on **Google Cloud Apigee X** that route developer IDE and CLI coding assistants to **Google Cloud Vertex AI** (`aiplatform.googleapis.com`) without requiring direct workstation internet egress to `*.googleapis.com` or interactive browser OAuth sign-in.

Supports both **Dedicated Per-Assistant Proxies** and a **Single Unified Multi-Assistant Proxy (`ide-gateway-v1`)** across:
1. **Google Antigravity** (`agy` CLI, Antigravity App / IDE, and ACP Server)
2. **Anthropic Claude Code** (`claude` CLI & IDE Extensions)
3. **GitHub Copilot** (VS Code Copilot Chat BYOK & OpenAI-Compatible CLI Clients)

---

## 1. Repository Layout

```text
apigee-ide-gateways/
├── proxies/
│   ├── antigravity-gateway-v1/        # Dedicated Google Antigravity proxy (/antigravity/v1)
│   ├── claude-gateway-v1/             # Dedicated Claude Code CLI proxy (/claude/v1)
│   ├── apigee-copilot-cli/            # Dedicated GitHub Copilot OpenAI proxy (/apigee-copilot-cli)
│   └── ide-gateway-v1/                # Unified Multi-Assistant proxy (/ide-gateway/v1)
├── products/
│   ├── antigravity_gateway.json       # API Product for antigravity-gateway-v1
│   ├── claude_cli_gateway.json        # API Product for claude-gateway-v1 (with llmOperationGroup token limits)
│   ├── copilot_cli_gateway.json       # API Product for apigee-copilot-cli
│   └── ide_gateway_unified.json       # Unified API Product covering all proxies
├── client-configs/
│   ├── antigravity/                   # admin_settings.example.json, env.example.sh, get-apigee-token.sh
│   ├── claude-code/                   # settings.example.json, get-apigee-token.sh
│   └── github-copilot/                # vscode_settings.example.json, copilot_cli_env.example.sh, get-apigee-token.sh
└── scripts/
    ├── validate_all.sh                # Strict bundle validation across all 4 proxies
    └── verify_antigravity_gateway.sh  # End-to-end curl & agy CLI verification suite
```

---

## 2. Side-by-Side Comparison across Coding Assistants

| Capability | Google Antigravity (`agy` / App) | Claude Code (`claude` CLI) | GitHub Copilot (BYOK / CLI) |
|---|---|---|---|
| **Dedicated Proxy** | `antigravity-gateway-v1` (`/antigravity/v1`) | `claude-gateway-v1` (`/claude/v1`) | `apigee-copilot-cli` (`/apigee-copilot-cli`) |
| **Unified Proxy** | `ide-gateway-v1` (`/ide-gateway/v1`) | `ide-gateway-v1` (`/ide-gateway/v1`) | `ide-gateway-v1` (`/ide-gateway/v1`) |
| **Wire Protocol** | Google GenAI (`wireProtocol: "genai"`) | Vertex Anthropic (`:streamRawPredict` / `:rawPredict`) | OpenAI Chat Completions (`/v1/chat/completions`) |
| **Upstream Vertex AI Target** | `/v1/projects/{org}/locations/global/publishers/google/models/{model}:streamGenerateContent?alt=sse` | `/v1/projects/{project}/locations/{region}/publishers/anthropic/models/{model}:streamRawPredict` | `/v1beta1/projects/{org}/locations/global/endpoints/openapi/chat/completions` |
| **Client Config File** | `/Library/Application Support/Antigravity/admin_settings.json` | `~/.claude/settings.json` | VS Code `settings.json` (`github.copilot.chat.customOAIModels`) |
| **Apigee API Key Header** | `x-apikey: APIGEE_KEY` or `Authorization: Bearer APIGEE_KEY` | `x-apikey: APIGEE_KEY` (`ANTHROPIC_CUSTOM_HEADERS`) | `Authorization: Bearer APIGEE_KEY` or `x-apikey: APIGEE_KEY` |
| **Per-User Identity Helper** | `~/.antigravity/get-apigee-token.sh` (`gcloud auth print-identity-token`) | `~/.claude/get-apigee-token.sh` (`gcloud auth print-identity-token`) | `~/.copilot/get-apigee-token.sh` (`gcloud auth print-identity-token`) |

---

## 3. Client Configuration Templates

### A. Google Antigravity (`agy` CLI & App)

**1. Workstation / MDM Config (`/Library/Application Support/Antigravity/admin_settings.json` on macOS, `/etc/antigravity/admin_settings.json` on Linux):**
See [`client-configs/antigravity/admin_settings.example.json`](client-configs/antigravity/admin_settings.example.json):
```json
{
  "gateway": {
    "enabled": true,
    "url": "https://APIGEE_HOST/antigravity/v1",
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
*(If using the unified proxy, set `"url": "https://APIGEE_HOST/ide-gateway/v1"`.)*

**2. Shell Environment Variables + Identity Token Helper (`~/.zshrc`):**
See [`client-configs/antigravity/env.example.sh`](client-configs/antigravity/env.example.sh) & [`client-configs/antigravity/get-apigee-token.sh`](client-configs/antigravity/get-apigee-token.sh):
```bash
export AGY_LLM_GATEWAY_URL="https://APIGEE_HOST/antigravity/v1"
export AGY_LLM_GATEWAY_API_KEY="$(~/.antigravity/get-apigee-token.sh)"
export AGY_LLM_GATEWAY_WIRE_PROTOCOL="genai"
export AGY_LLM_GATEWAY_HEADERS='{"x-apikey": "APIGEE_KEY", "X-Goog-User-Project": "PROJECT_ID", "X-Cost-Center": "Core-Engineering"}'
export AGY_LLM_GATEWAY_MODELS="gemini-3.8-flash,gemini-3.1-pro-preview,gemini-3.1-flash-lite"
```

---

### B. Anthropic Claude Code (`claude` CLI)

**1. Content of `~/.claude/settings.json`:**
See [`client-configs/claude-code/settings.example.json`](client-configs/claude-code/settings.example.json):
```json
{
  "env": {
    "CLAUDE_CODE_USE_VERTEX": "1",
    "CLAUDE_CODE_SKIP_VERTEX_AUTH": "1",
    "ANTHROPIC_VERTEX_PROJECT_ID": "PROJECT_ID",
    "CLOUD_ML_REGION": "global",
    "ANTHROPIC_BASE_URL": "https://APIGEE_HOST/claude/v1/v1",
    "ANTHROPIC_VERTEX_BASE_URL": "https://APIGEE_HOST/claude/v1/v1",
    "ANTHROPIC_CUSTOM_HEADERS": "x-apikey: APIGEE_KEY"
  },
  "apiKeyHelper": "~/.claude/get-apigee-token.sh",
  "model": "claude-sonnet-5",
  "theme": "auto"
}
```
*(If using the unified proxy, set `ANTHROPIC_BASE_URL` and `ANTHROPIC_VERTEX_BASE_URL` to `"https://APIGEE_HOST/ide-gateway/v1/v1"`.)*

**2. Content of `~/.claude/get-apigee-token.sh`:**
See [`client-configs/claude-code/get-apigee-token.sh`](client-configs/claude-code/get-apigee-token.sh):
```bash
#!/bin/bash
gcloud auth print-identity-token
```

---

### C. GitHub Copilot (VS Code BYOK & OpenAI CLI)

**1. VS Code `settings.json` (`github.copilot.chat.customOAIModels`):**
See [`client-configs/github-copilot/vscode_settings.example.json`](client-configs/github-copilot/vscode_settings.example.json):
```json
{
  "github.copilot.chat.customOAIModels": {
    "gemini-3.8-flash": {
      "name": "Gemini 3.8 Flash (Apigee Enterprise Gateway)",
      "url": "https://APIGEE_HOST/apigee-copilot-cli/v1/chat/completions",
      "toolCalling": true,
      "vision": true,
      "thinking": true,
      "maxInputTokens": 200000,
      "maxOutputTokens": 16384,
      "requiresAPIKey": true
    }
  }
}
```
*(If using the unified proxy, set `"url": "https://APIGEE_HOST/ide-gateway/v1/v1/chat/completions"`. Enter `APIGEE_KEY` when VS Code prompts for the model API key.)*

**2. OpenAI / Copilot CLI Environment Variables:**
See [`client-configs/github-copilot/copilot_cli_env.example.sh`](client-configs/github-copilot/copilot_cli_env.example.sh):
```bash
export OPENAI_BASE_URL="https://APIGEE_HOST/apigee-copilot-cli/v1"
export OPENAI_API_KEY="APIGEE_KEY"
```

---

## 4. Validate & Deploy Proxies

### Validate All Bundles
```bash
./scripts/validate_all.sh
```

### Deploy a Dedicated or Unified Proxy
```bash
SK=/path/to/apigee-skills/skills
export APIGEE_ORG="PROJECT_ID"
export APIGEE_ENV="dev"
export RUNTIME_SA="ai-client@${APIGEE_ORG}.iam.gserviceaccount.com"

# Deploy individual proxies or the unified ide-gateway-v1 proxy:
for P in antigravity-gateway-v1 claude-gateway-v1 apigee-copilot-cli ide-gateway-v1; do
  python3 $SK/apigee-proxy-lifecycle/scripts/apigee_ctl.py update \
    ./proxies/$P --env $APIGEE_ENV --sa $RUNTIME_SA
done

# Apply the Unified API Product
python3 $SK/apigee-proxy-lifecycle/scripts/apigee_ctl.py product-apply \
  ./products/ide_gateway_unified.json --env $APIGEE_ENV
```
