# Configuring Claude Desktop App & Claude Code on Windows (`claude-gateway-v1`)

`claude-gateway-v1` (`/claude/v1`) natively supports **both**:
1. **Anthropic Messages & Model Discovery API (`GET /v1/models`, `POST /v1/messages`)** — used by the **Claude Desktop App (Third-Party Inference Mode)**
2. **Vertex AI Anthropic API (`:rawPredict` & `:streamRawPredict`)** — used by the **Claude Desktop "Code" tab**, **Claude Code CLI**, and **VS Code Claude Code Extension**

---

## Option A: Claude Desktop App on Windows (Chat + Cowork — Third-Party Inference Mode)

The Windows **Claude Desktop App (`Claude.exe`)** includes a built-in **Third-Party Inference Gateway** mode that routes requests through Apigee:

### 1. In-App GUI Setup
1. Open the **Claude Desktop App** on Windows (if already signed into a personal account, sign out first).
2. Click the top-left menu (`☰`) → **Help** → **Troubleshooting** → **Enable Developer Mode**.
3. Click the top-left menu (`☰`) → **Developer** → **Configure Third-Party Inference…**
4. Enter the following settings:
   - **Inference Provider:** `Gateway`
   - **Credential Kind:** `Static API key` (or `Command` pointing to `%USERPROFILE%\.claude\get-apigee-token.bat` for per-user GCP JWT identity attribution)
   - **Gateway Base URL:** `https://APIGEE_HOST/claude/v1`
   - **Auth Scheme:** `x-api-key` (or `bearer`)
   - **Gateway API Key:** `APIGEE_KEY`
   - **Models:** Add `claude-sonnet-5`, `claude-opus-5-5`, `claude-haiku-5-5` (the first entry becomes the Default Model in Cowork/Chat).
5. Click **Apply Changes** and restart the Claude Desktop App.

### 2. Automated PowerShell / Registry Setup (Windows Policy / MDM)
Alternatively, run this in **Administrator PowerShell** on Windows to configure Claude Desktop's Third-Party Inference via Windows Policy:

```powershell
New-Item -Path "HKLM:\SOFTWARE\Policies\Claude" -Force | Out-Null
Set-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Claude" -Name "inferenceProvider" -Value "gateway"
Set-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Claude" -Name "inferenceGatewayBaseUrl" -Value "https://APIGEE_HOST/claude/v1"
Set-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Claude" -Name "inferenceGatewayAuthScheme" -Value "x-api-key"
Set-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Claude" -Name "inferenceGatewayApiKey" -Value "APIGEE_KEY"
```

---

## Option B: Claude Desktop "Code" Tab, CLI & VS Code Extension (`%USERPROFILE%\.claude\settings.json`)

The **Code** tab inside the Claude Desktop App, the **Claude Code CLI**, and the **VS Code Extension** read `%USERPROFILE%\.claude\settings.json` and `%USERPROFILE%\.claude\get-apigee-token.bat`:

### Run in Windows PowerShell:
```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.claude"

@'
@echo off
call gcloud auth print-identity-token
'@ | Set-Content -Path "$env:USERPROFILE\.claude\get-apigee-token.bat" -Encoding ASCII

$helperPath = "$env:USERPROFILE\.claude\get-apigee-token.bat" -replace '\\', '\\'

@"
{
  "env": {
    "CLAUDE_CODE_USE_VERTEX": "1",
    "CLAUDE_CODE_SKIP_VERTEX_AUTH": "1",
    "ANTHROPIC_VERTEX_PROJECT_ID": "PROJECT_ID",
    "CLOUD_ML_REGION": "global",
    "ANTHROPIC_BASE_URL": "https://APIGEE_HOST/claude/v1",
    "ANTHROPIC_VERTEX_BASE_URL": "https://APIGEE_HOST/claude/v1",
    "ANTHROPIC_CUSTOM_HEADERS": "x-apikey: APIGEE_KEY"
  },
  "apiKeyHelper": "$helperPath",
  "model": "claude-sonnet-5",
  "theme": "auto"
}
"@ | Set-Content -Path "$env:USERPROFILE\.claude\settings.json" -Encoding UTF8
```
*(If testing without `gcloud` installed on Windows, you can omit `"apiKeyHelper"` and add `"ANTHROPIC_API_KEY": "APIGEE_KEY"` inside `"env"`.)*
