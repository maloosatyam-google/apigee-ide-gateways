# GitHub Copilot (VS Code BYOK & Copilot CLI) — Windows & macOS Setup Guide

## 1. VS Code GitHub Copilot Chat (BYOK — Bring Your Own Key)

1. Open VS Code User Settings (`settings.json`):
   - **Windows**: `%APPDATA%\Code\User\settings.json`
   - **macOS**: `~/Library/Application Support/Code/User/settings.json`
2. Add the `github.copilot.chat.customOAIModels` configuration (replacing `<YOUR_APIGEE_HOST>`):

```json
{
  "github.copilot.chat.customOAIModels": {
    "gemini-3.8-flash": {
      "name": "Gemini 3.8 Flash (Apigee Enterprise Gateway)",
      "url": "https://<YOUR_APIGEE_HOST>/apigee-copilot-cli/v1/chat/completions",
      "toolCalling": true,
      "vision": true,
      "thinking": true,
      "maxInputTokens": 200000,
      "maxOutputTokens": 16384,
      "requiresAPIKey": true
    },
    "gemini-3.1-pro-preview": {
      "name": "Gemini 3.1 Pro (Apigee Enterprise Gateway)",
      "url": "https://<YOUR_APIGEE_HOST>/apigee-copilot-cli/v1/chat/completions",
      "toolCalling": true,
      "vision": true,
      "thinking": true,
      "maxInputTokens": 200000,
      "maxOutputTokens": 16384,
      "requiresAPIKey": true
    },
    "gemini-3.1-flash-lite": {
      "name": "Gemini 3.1 Flash Lite (Apigee Enterprise Gateway)",
      "url": "https://<YOUR_APIGEE_HOST>/apigee-copilot-cli/v1/chat/completions",
      "toolCalling": true,
      "vision": true,
      "thinking": true,
      "maxInputTokens": 200000,
      "maxOutputTokens": 16384,
      "requiresAPIKey": true
    },
    "gemini-4-argon": {
      "name": "Gemini 4 Argon (Apigee Enterprise Gateway)",
      "url": "https://<YOUR_APIGEE_HOST>/apigee-copilot-cli/v1/chat/completions",
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

3. In VS Code, open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) -> **Chat: Manage Language Models** -> select **OpenAI Compatible** -> enter your Apigee API Key when prompted.

---

## 2. Windows PowerShell Verification

Test both non-streaming and SSE streaming directly from PowerShell on Windows:

```powershell
# 1. Model Discovery (GET /v1/models)
Invoke-RestMethod -Method Get `
  -Uri "https://<YOUR_APIGEE_HOST>/apigee-copilot-cli/v1/models" `
  -Headers @{ "Authorization" = "Bearer <YOUR_APIGEE_API_KEY>" }

# 2. Chat Completions (POST /v1/chat/completions)
Invoke-RestMethod -Method Post `
  -Uri "https://<YOUR_APIGEE_HOST>/apigee-copilot-cli/v1/chat/completions" `
  -Headers @{ "Authorization" = "Bearer <YOUR_APIGEE_API_KEY>"; "Content-Type" = "application/json" } `
  -Body '{"model":"gemini-3.8-flash","messages":[{"role":"user","content":"Reply PONG"}]}'
```
