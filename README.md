# Apigee X Enterprise Gateways for AI Coding Assistants & Copilots (`apigee-ide-gateways`)

Enterprise reverse proxies on **Google Cloud Apigee X** that route developer IDE, CLI, and Copilot traffic to **Google Cloud Vertex AI** (`aiplatform.googleapis.com` — both **Google Gemini** and **Anthropic Claude** models) with full enterprise governance:
- API Key + GCP Identity JWT per-user attribution
- Google Cloud Model Armor prompt & response sanitization (including continuous SSE scanning)
- Per-model `LLMTokenQuota` enforcement & token counting (non-streaming + SSE `EventFlow`)
- KVM-driven real-time cost calculation (`ai-model-rates`)
- Full `PostClientFlow` Cloud Logging audit trail (`projects/{org}/logs/apigee`)

Supports both **Dedicated Per-Assistant Proxies** and a **Single Unified Multi-Assistant Proxy (`ide-gateway-v1`)** across:
1. **Google Antigravity** (`agy` CLI, Antigravity App / IDE, and ACP Server) — [`proxies/antigravity-gateway-v1`](proxies/antigravity-gateway-v1)
2. **Anthropic Claude Code** (`claude` CLI & Claude Desktop App) — [`proxies/claude-gateway-v1`](proxies/claude-gateway-v1)
3. **GitHub Copilot** (VS Code Copilot Chat BYOK & GitHub Copilot CLI) — [`proxies/github-copilot/v1`](proxies/github-copilot/v1)
4. **Microsoft Copilot** (Microsoft Copilot Studio, M365 Agents SDK, and Azure OpenAI clients) — [`proxies/microsoft-copilot-gateway-v1`](proxies/microsoft-copilot-gateway-v1)

---

## 1. Repository Layout

```text
apigee-ide-gateways/
├── proxies/
│   ├── antigravity-gateway-v1/        # Dedicated Google Antigravity proxy (/antigravity/v1)
│   ├── claude-gateway-v1/             # Dedicated Claude Code & Desktop proxy (/claude/v1)
│   ├── github-copilot-gateway-v1/            # Dedicated GitHub Copilot OpenAI proxy (/github-copilot/v1)
│   ├── microsoft-copilot-gateway-v1/  # Dedicated Microsoft Copilot & Azure OpenAI proxy (/microsoft-copilot/v1)
│   └── ide-gateway-v1/                # Unified Multi-Assistant proxy (/ide-gateway/v1)
├── products/
│   ├── antigravity_gateway.json       # API Product for antigravity-gateway-v1
│   ├── claude_cli_gateway.json        # API Product for claude-gateway-v1
│   ├── github_copilot_gateway.json       # API Product for github-copilot-gateway-v1 (GitHub Copilot)
│   ├── microsoft_copilot_gateway.json # API Product for microsoft-copilot-gateway-v1 (Microsoft Copilot)
│   └── ide_gateway_unified.json       # Unified API Product covering all proxies
├── client-configs/
│   ├── antigravity/                   # admin_settings.example.json, WINDOWS_APP_SETUP.md
│   ├── claude-code/                   # settings.example.json, WINDOWS_APP_SETUP.md
│   ├── github-copilot/                # vscode_settings.example.json, WINDOWS_APP_SETUP.md
│   └── microsoft-copilot/             # copilot_studio_connection.example.json, WINDOWS_APP_SETUP.md
└── scripts/
    ├── validate_all.sh                # Strict bundle validation across all 5 proxies
    └── verify_antigravity_gateway.sh  # End-to-end curl & agy CLI verification suite
```

---

## 2. Side-by-Side Comparison across Assistants & Copilots

| Capability | Google Antigravity (`agy` / App) | Claude Code & Desktop | GitHub Copilot (VS Code BYOK / CLI) | Microsoft Copilot (Copilot Studio / Azure OpenAI) |
|---|---|---|---|---|
| **Dedicated Proxy** | `antigravity-gateway-v1` (`/antigravity/v1`) | `claude-gateway-v1` (`/claude/v1`) | `github-copilot-gateway-v1` (`/github-copilot/v1`) | `microsoft-copilot-gateway-v1` (`/microsoft-copilot/v1`) |
| **Wire Protocol** | Google GenAI (`wireProtocol: "genai"`) | Anthropic Messages (`/v1/messages` & `:streamRawPredict`) | OpenAI Chat Completions (`/v1/chat/completions`) | Azure OpenAI (`/openai/deployments/{model}/chat/completions`) & OpenAI (`/v1/chat/completions`) |
| **Upstream Vertex AI Models** | Google Gemini (`gemini-4-argon`, `gemini-3.8-flash`, `gemini-3.1-pro-preview`, `gemini-3.1-flash-lite`) | Anthropic Claude (`claude-sonnet-5`, `claude-opus-5-5`, `claude-haiku-5-5`) | Google Gemini (`gemini-4-argon`, `gemini-3.8-flash`, `gemini-3.1-pro-preview`, `gemini-3.1-flash-lite`) | Google Gemini **and** Anthropic Claude (`gemini-4-argon`, `gemini-3.8-flash`, `claude-sonnet-5`, `claude-opus-5-5`) |
| **Auth Header** | `x-apikey`, `x-goog-api-key`, or `Authorization: Bearer` | `x-api-key`, `x-apikey`, or `Authorization: Bearer` | `Authorization: Bearer` or `x-apikey` | `api-key` (Azure OpenAI), `Authorization: Bearer`, or `x-apikey` |
| **Windows Setup Guide** | [`client-configs/antigravity/WINDOWS_APP_SETUP.md`](client-configs/antigravity/WINDOWS_APP_SETUP.md) | [`client-configs/claude-code/WINDOWS_APP_SETUP.md`](client-configs/claude-code/WINDOWS_APP_SETUP.md) | [`client-configs/github-copilot/WINDOWS_APP_SETUP.md`](client-configs/github-copilot/WINDOWS_APP_SETUP.md) | [`client-configs/microsoft-copilot/WINDOWS_APP_SETUP.md`](client-configs/microsoft-copilot/WINDOWS_APP_SETUP.md) |
