# Microsoft Copilot Studio & Azure OpenAI Setup (`microsoft-copilot-gateway-v1`)

This guide shows how to connect **Microsoft Copilot Studio**, **Microsoft 365 Agents SDK / Semantic Kernel**, and **Windows PowerShell / Azure OpenAI clients** to **Google Cloud Vertex AI (Gemini & Claude)** through the **`microsoft-copilot-gateway-v1`** Apigee X Enterprise Gateway (`/microsoft-copilot/v1`).

---

## 1. Supported Endpoints & Headers

- **Base URL**: `https://YOUR_APIGEE_HOST/microsoft-copilot/v1`
- **Authentication Headers Supported**:
  - `api-key: YOUR_APIGEE_API_KEY` *(Standard Azure OpenAI & Microsoft Copilot Studio header)*
  - `Authorization: Bearer YOUR_APIGEE_API_KEY` *(Standard OpenAI header, or GCP Identity JWT when paired with `api-key`)*
  - `x-api-key: YOUR_APIGEE_API_KEY` / `x-apikey: YOUR_APIGEE_API_KEY`
- **Supported Routes**:
  1. **Azure OpenAI Deployment Route**:
     - `POST https://YOUR_APIGEE_HOST/microsoft-copilot/v1/openai/deployments/{deployment-id}/chat/completions?api-version=2024-10-21`
  2. **OpenAI v1 Route**:
     - `POST https://YOUR_APIGEE_HOST/microsoft-copilot/v1/v1/chat/completions`
  3. **Model & Deployment Discovery**:
     - `GET https://YOUR_APIGEE_HOST/microsoft-copilot/v1/v1/models`
     - `GET https://YOUR_APIGEE_HOST/microsoft-copilot/v1/openai/deployments`
- **Supported Vertex AI Models (and Azure Aliases)**:
  - **Google Gemini**: `gemini-4-argon`, `gemini-3.8-flash`, `gemini-3.1-pro-preview`, `gemini-3.1-flash-lite`, `gemini-2.5-pro`, `gemini-2.5-flash`
  - **Anthropic Claude on Vertex AI**: `claude-sonnet-5`, `claude-opus-5-5`, `claude-haiku-5-5`, `claude-opus-4-5`, `claude-haiku-4-5`
  - **Azure OpenAI Deployment Aliases**: `gpt-4o` / `gpt-4.1` -> `gemini-3.8-flash`, `gpt-4o-mini` -> `gemini-3.1-flash-lite`, `o1` / `o3-mini` -> `gemini-4-argon`

---

## 2. Connecting Microsoft Copilot Studio (Custom Model / HTTP Action / AI Foundry Connector)

1. In **Microsoft Copilot Studio**, open your Agent -> **Settings** / **Actions** or **Azure OpenAI / Custom Model Connection**:
   - **Endpoint URL**: `https://YOUR_APIGEE_HOST/microsoft-copilot/v1`
   - **Authentication Type**: `API Key`
   - **Header Name**: `api-key`
   - **API Key**: `YOUR_APIGEE_API_KEY`
   - **Deployment Name**: `gemini-3.8-flash`, `gemini-4-argon`, or `claude-sonnet-5`
   - **API Version**: `2024-10-21`

---

## 3. Windows PowerShell Verification (Azure OpenAI & OpenAI v1 Formats)

Run the following in **Windows PowerShell**:

```powershell
$GatewayBase = "https://YOUR_APIGEE_HOST/microsoft-copilot/v1"
$ApiKey      = "YOUR_APIGEE_API_KEY"

# 1. Model Discovery
Invoke-RestMethod -Uri "$GatewayBase/v1/models" -Headers @{ "api-key" = $ApiKey } | ConvertTo-Json -Depth 5

# 2. Azure OpenAI Deployment Format -> Gemini 3.8 Flash on Vertex AI
Invoke-RestMethod -Method POST `
  -Uri "$GatewayBase/openai/deployments/gemini-3.8-flash/chat/completions?api-version=2024-10-21" `
  -Headers @{ "api-key" = $ApiKey; "Content-Type" = "application/json" } `
  -Body '{"messages":[{"role":"user","content":"Hello from Microsoft Copilot via Azure OpenAI protocol!"}],"stream":false}' | ConvertTo-Json -Depth 6

# 3. Azure OpenAI Deployment Format -> Claude Sonnet 5 on Vertex AI
Invoke-RestMethod -Method POST `
  -Uri "$GatewayBase/openai/deployments/claude-sonnet-5/chat/completions?api-version=2024-10-21" `
  -Headers @{ "api-key" = $ApiKey; "Content-Type" = "application/json" } `
  -Body '{"messages":[{"role":"user","content":"Hello Claude Sonnet 5 from Microsoft Copilot!"}],"stream":false}' | ConvertTo-Json -Depth 6
```
