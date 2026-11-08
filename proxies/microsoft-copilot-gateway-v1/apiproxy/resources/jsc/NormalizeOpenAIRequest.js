// Normalize Microsoft Copilot Studio / Azure OpenAI (/openai/deployments/{model}/chat/completions)
// and OpenAI (/v1/chat/completions) requests for Vertex AI (both Google Gemini and Anthropic Claude).
var content = context.getVariable("request.content");
var pathSuffix = String(context.getVariable("proxy.pathsuffix") || "");
var orgName = String(context.getVariable("organization.name") || "");

// Extract deployment_id from Azure OpenAI path if present:
// e.g. /openai/deployments/gemini-3.8-flash/chat/completions or /v1/openai/deployments/claude-sonnet-5/chat/completions
var deploymentMatch = pathSuffix.match(/^\/(?:v1\/)?openai\/deployments\/([^\/]+)\/chat\/completions/i);
var pathDeploymentModel = deploymentMatch ? decodeURIComponent(deploymentMatch[1]) : "";

var body = {};
if (content) {
  try {
    body = JSON.parse(content);
  } catch (e) {
    body = {};
  }
}

var rawModel = String(body.model || pathDeploymentModel || "gemini-3.8-flash").trim();
context.setVariable("flow.requested_model", rawModel);

// Strip provider prefix if present (google/ or anthropic/ or azure/)
var cleanModel = rawModel;
if (cleanModel.indexOf("/") !== -1) {
  var parts = cleanModel.split("/");
  cleanModel = parts[parts.length - 1];
}

// Map common Azure OpenAI / OpenAI model aliases to Vertex AI models
var modelAliases = {
  "gpt-4o": "gemini-3.8-flash",
  "gpt-4.1": "gemini-3.8-flash",
  "gpt-4": "gemini-3.1-pro-preview",
  "gpt-4-turbo": "gemini-3.8-flash",
  "gpt-4o-mini": "gemini-3.1-flash-lite",
  "gpt-4.1-mini": "gemini-3.1-flash-lite",
  "gpt-3.5-turbo": "gemini-3.1-flash-lite",
  "o1": "gemini-4-argon",
  "o3-mini": "gemini-4-argon"
};
if (modelAliases[cleanModel]) {
  cleanModel = modelAliases[cleanModel];
}

// Extract last user prompt for Model Armor (SUP-UserPrompt) & Cloud Logging
var prompt = "";
if (body.messages && Array.isArray(body.messages) && body.messages.length > 0) {
  for (var i = body.messages.length - 1; i >= 0; i--) {
    var msg = body.messages[i];
    if (msg && (msg.role === "user" || i === body.messages.length - 1)) {
      if (typeof msg.content === "string") {
        prompt = msg.content;
      } else if (Array.isArray(msg.content)) {
        var textParts = [];
        for (var j = 0; j < msg.content.length; j++) {
          if (msg.content[j] && msg.content[j].text) {
            textParts.push(msg.content[j].text);
          }
        }
        prompt = textParts.join(" ");
      }
      if (prompt) break;
    }
  }
}
if (prompt) {
  context.setVariable("flow.userPrompt", prompt.substring(0, 4096));
}

var isStreamRequested = (body.stream === true);
context.setVariable("flow.client_stream", isStreamRequested ? "true" : "false");

// Determine whether target model is Anthropic Claude or Google Gemini on Vertex AI
var isClaude = (cleanModel.indexOf("claude") === 0 || rawModel.indexOf("anthropic/") === 0);

if (isClaude) {
  var claudeExact = {
    "claude-sonnet-5": "claude-sonnet-5",
    "claude-opus-5-5": "claude-opus-5-5",
    "claude-haiku-5-5": "claude-haiku-5-5",
    "claude-opus-4-5@20251101": "claude-opus-4-5@20251101",
    "claude-opus-4-5-20251101": "claude-opus-4-5@20251101",
    "claude-opus-4-5": "claude-opus-4-5@20251101",
    "claude-haiku-4-5@20251001": "claude-haiku-4-5@20251001",
    "claude-haiku-4-5-20251001": "claude-haiku-4-5@20251001",
    "claude-haiku-4-5": "claude-haiku-4-5@20251001"
  };
  var vertexClaudeModel = claudeExact[cleanModel];
  if (!vertexClaudeModel) {
    if (cleanModel.indexOf("opus") !== -1) {
      vertexClaudeModel = "claude-opus-5-5";
    } else if (cleanModel.indexOf("haiku") !== -1) {
      vertexClaudeModel = "claude-haiku-5-5";
    } else {
      vertexClaudeModel = "claude-sonnet-5";
    }
  }
  var bareClaudeModel = vertexClaudeModel.split("@")[0];

  context.setVariable("flow.target_provider", "anthropic");
  context.setVariable("flow.model", bareClaudeModel);
  context.setVariable("flow.target_model", bareClaudeModel);
  context.setVariable("flow.quota_model", bareClaudeModel);
  // Route Claude via Vertex :rawPredict and format as OpenAI JSON or OpenAI SSE in PostFlow
  context.setVariable("flow.is_stream", "false");
  context.setVariable("flow.is_streaming", isStreamRequested ? "true" : "false");
  context.setVariable(
    "flow.vertex_target_url",
    "https://aiplatform.googleapis.com/v1/projects/" + orgName + "/locations/global/publishers/anthropic/models/" + vertexClaudeModel + ":rawPredict"
  );

  // Convert OpenAI Chat Completions payload to Vertex AI Anthropic :rawPredict payload
  var systemParts = [];
  var anthropicMessages = [];
  if (body.messages && Array.isArray(body.messages)) {
    for (var m = 0; m < body.messages.length; m++) {
      var item = body.messages[m];
      if (!item) continue;
      if (item.role === "system" || item.role === "developer") {
        if (typeof item.content === "string") {
          systemParts.push(item.content);
        }
      } else {
        anthropicMessages.push({
          role: item.role === "assistant" ? "assistant" : "user",
          content: item.content || ""
        });
      }
    }
  }
  if (anthropicMessages.length === 0) {
    anthropicMessages.push({ role: "user", content: prompt || "Hello" });
  }

  var anthropicBody = {
    anthropic_version: "vertex-2023-10-16",
    max_tokens: body.max_completion_tokens || body.max_tokens || 4096,
    messages: anthropicMessages
  };
  if (systemParts.length > 0) {
    anthropicBody.system = systemParts.join("\n\n");
  }
  if (typeof body.temperature === "number") {
    anthropicBody.temperature = body.temperature;
  }
  if (typeof body.top_p === "number") {
    anthropicBody.top_p = body.top_p;
  }

  context.setVariable("request.content", JSON.stringify(anthropicBody));
} else {
  // Google Gemini model via Vertex AI OpenAI-compatible endpoint
  var bareGeminiModel = cleanModel || "gemini-3.8-flash";
  context.setVariable("flow.target_provider", "google");
  context.setVariable("flow.model", bareGeminiModel);
  context.setVariable("flow.target_model", bareGeminiModel);
  context.setVariable("flow.quota_model", bareGeminiModel);
  context.setVariable("flow.is_stream", isStreamRequested ? "true" : "false");
  context.setVariable("flow.is_streaming", isStreamRequested ? "true" : "false");
  context.setVariable(
    "flow.vertex_target_url",
    "https://aiplatform.googleapis.com/v1beta1/projects/" + orgName + "/locations/global/endpoints/openapi/chat/completions"
  );

  body.model = "google/" + bareGeminiModel;
  if (isStreamRequested) {
    if (!body.stream_options || typeof body.stream_options !== "object") {
      body.stream_options = {};
    }
    body.stream_options.include_usage = true;
  }
  context.setVariable("request.content", JSON.stringify(body));
}
