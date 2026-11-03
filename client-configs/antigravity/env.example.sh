# Antigravity CLI & App Environment Variables
# Source in ~/.zshrc or ~/.bashrc
export AGY_LLM_GATEWAY_URL="https://APIGEE_HOST/antigravity/v1"
export AGY_LLM_GATEWAY_API_KEY="$(~/.antigravity/get-apigee-token.sh)"
export AGY_LLM_GATEWAY_WIRE_PROTOCOL="genai"
export AGY_LLM_GATEWAY_HEADERS='{"x-apikey": "APIGEE_KEY", "X-Goog-User-Project": "PROJECT_ID", "X-Cost-Center": "Core-Engineering"}'
export AGY_LLM_GATEWAY_MODELS="gemini-3.8-flash,gemini-3.1-pro-preview,gemini-3.1-flash-lite"
