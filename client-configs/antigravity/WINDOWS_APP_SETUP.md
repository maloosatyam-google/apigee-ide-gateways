# Google Antigravity Desktop App & CLI (`agy`) — Windows Setup Guide

## Why Requests Can Bypass Apigee on Windows

When configuring the Antigravity Desktop App on Windows via `C:\ProgramData\Antigravity\admin_settings.json`, three common pitfalls cause Antigravity to silently ignore `admin_settings.json` (`Ignoring gateway admin settings: ...`) and fall back to direct `vertex-ai` (`//aiplatform.googleapis.com/projects/...`):

1. **PowerShell UTF-16 LE / UTF-8 BOM Encoding Trap**:
   - In Windows PowerShell 5.1 (`powershell.exe`), `>` redirection and `Out-File` write **UTF-16 LE (`FF FE`)** by default (and `-Encoding utf8` writes a **UTF-8 BOM `EF BB BF`**).
   - Antigravity's `admincontrols.ParseAdminSettings` parser (`hujson.Standardize` + `encoding/json/v2.Unmarshal`) requires **UTF-8 without BOM**. If the file has UTF-16 LE bytes, `ParseAdminSettings` returns an error, `language_server` logs `Ignoring gateway admin settings`, and Antigravity falls back to the user's cached `vertex-ai` / ADC login (`%USERPROFILE%\.gemini\antigravity\cache\acp-auth-state.json`).
2. **Top-Level `"models"` Schema**:
   - In `admin_settings.json`, `"models"` is a **top-level sibling** of `"gateway"` (not nested inside `"gateway"`) and uses `"list": [{"modelId": "..."}]` and `"tiers"`, not `"filter"`.
   - When `"models"` is nested inside `"gateway"`, Antigravity ignores the custom model list and displays the built-in catalog defaults (`gemini-4-argon` and `gemini-3.8-flash`).
3. **Startup-Only Config Loading & Cached Auth State**:
   - `C:\ProgramData\Antigravity\admin_settings.json` (and `%USERPROFILE%\.gemini\antigravity\config.json`) is read **only once** when the background `Antigravity` / `agy` / `language_server` process starts. All running Antigravity processes must be terminated before relaunching the app.
4. **`gemini-4-argon` `thinkingBudget` Default on Older Clients (e.g., `antigravity/hub/2.29.0`)**:
   - In Antigravity `2.29.0` (before `gemini-4-argon` was added to the client's built-in static catalog in `2.31.x`), any `gemini*` model in `models.list` that is not in the client's built-in catalog goes through `admincontrols.HydrateModelEntryDefaults`, which defaults `supportsThinking: true` and `thinkingBudget: 4096`.
   - Because Vertex AI `gemini-4-argon` uses `thinkingLevel` rather than `thinkingBudget`, sending `thinkingBudget: 4096` causes HTTP 400 (`Thinking budget is not supported for this model. Use thinking level instead.`).
   - Setting `"supportsThinking": false` on the `"gemini-4-argon"` entry in `models.list` prevents `HydrateModelEntryDefaults` from injecting `thinkingBudget: 4096` and allows Vertex AI `gemini-4-argon` to use its native default thinking level.

---

## Step-by-Step Windows PowerShell Setup

Run the following in an **Administrator PowerShell** window on Windows (replacing `<YOUR_APIGEE_HOST>` and `<YOUR_APIGEE_API_KEY>`):

```powershell
# 1. Stop all running Antigravity / agy / language_server background processes
Get-Process -Name "Antigravity","agy","language_server*" -ErrorAction SilentlyContinue | Stop-Process -Force

# 2. Ensure C:\ProgramData\Antigravity and user ~/.gemini/antigravity directories exist
New-Item -ItemType Directory -Force -Path "$env:ProgramData\Antigravity" | Out-Null
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.gemini\antigravity" | Out-Null

# 3. Define the admin_settings.json payload (exact admincontrols.AdminSettings schema)
$adminSettingsJson = @'
{
  "gateway": {
    "enabled": true,
    "url": "https://<YOUR_APIGEE_HOST>/antigravity/v1",
    "wireProtocol": "genai",
    "apiKey": "<YOUR_APIGEE_API_KEY>",
    "customHeaders": {
      "x-apikey": "<YOUR_APIGEE_API_KEY>",
      "X-Cost-Center": "Core-Engineering"
    }
  },
  "models": {
    "defaultModelId": "gemini-3.8-flash",
    "list": [
      {
        "modelId": "gemini-4-argon",
        "displayName": "Gemini 4 Argon",
        "provider": "google",
        "supportsThinking": false
      },
      {
        "modelId": "gemini-3.8-flash",
        "displayName": "Gemini 3.8 Flash",
        "provider": "google"
      },
      {
        "modelId": "gemini-3.1-pro-preview",
        "displayName": "Gemini 3.1 Pro",
        "provider": "google"
      },
      {
        "modelId": "gemini-3.1-flash-lite",
        "displayName": "Gemini 3.1 Flash Lite",
        "provider": "google"
      }
    ],
    "tiers": {
      "flashLite": [
        "gemini-3.1-flash-lite"
      ],
      "flash": [
        "gemini-3.8-flash"
      ],
      "pro": [
        "gemini-4-argon",
        "gemini-3.1-pro-preview"
      ]
    }
  }
}
'@

# 4. Write UTF-8 WITHOUT BOM to both MDM admin_settings.json and user config.json
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText("$env:ProgramData\Antigravity\admin_settings.json", $adminSettingsJson, $utf8NoBom)
[System.IO.File]::WriteAllText("$env:USERPROFILE\.gemini\antigravity\config.json", $adminSettingsJson, $utf8NoBom)

# 5. Clear any cached direct Vertex AI / ADC auth state so Gateway mode is enforced
Remove-Item -Path "$env:USERPROFILE\.gemini\antigravity\cache\acp-auth-state.json" -Force -ErrorAction SilentlyContinue
```

---

## Verification on Windows

1. **Verify the file starts with `7B` (`{`) and NOT `FF FE` (UTF-16) or `EF BB BF` (BOM)**:
   ```powershell
   $bytes = [System.IO.File]::ReadAllBytes("$env:ProgramData\Antigravity\admin_settings.json")[0..3]
   ($bytes | ForEach-Object { $_.ToString("X2") }) -join " "
   # Expected first byte: 7B
   ```
2. **Test connectivity directly from PowerShell to Apigee before launching the app**:
   ```powershell
   Invoke-RestMethod -Method Post `
     -Uri "https://<YOUR_APIGEE_HOST>/antigravity/v1/v1beta/models/gemini-3.8-flash:generateContent" `
     -Headers @{ "x-apikey" = "<YOUR_APIGEE_API_KEY>"; "Content-Type" = "application/json" } `
     -Body '{"contents":[{"role":"user","parts":[{"text":"Say PONG"}]}]}'
   ```
3. **Launch the Antigravity Desktop App**:
   - Open the model selector: you will see **Gemini 3.8 Flash**, **Gemini 3.1 Pro**, and **Gemini 3.1 Flash Lite** (confirming `admin_settings.json` was loaded).
   - Send a prompt and verify the request appears in **Apigee Debug Trace** on `antigravity-gateway-v1` (Revision 3).
