// Unified Multi-Assistant Request Normalizer for ide-gateway-v1 (/ide-gateway/v1)
// Supports:
//   1. Google Antigravity (GenAI /models/{model}:generateContent & /v1internal:streamGenerateContent)
//   2. Anthropic Claude Code & Desktop (/v1/messages & /v1/projects/.../publishers/anthropic/models/{model}:*)
//   3. GitHub Copilot & Microsoft Copilot (/v1/chat/completions & /openai/deployments/{model}/chat/completions)
var rawContent = context.getVariable("request.content") || "";
var pathSuffix = String(context.getVariable("proxy.pathsuffix") || "");
var orgName = String(context.getVariable("organization.name") || "");

var body = {};
if (rawContent) {
  try {
    body = JSON.parse(String(rawContent));
  } catch (e) {
    body = {};
  }
}

function extractMessagesPrompt(messages) {
  if (!messages || !Array.isArray(messages) || messages.length === 0) return "";
  for (var i = messages.length - 1; i >= 0; i--) {
    var msg = messages[i];
    if (msg && (msg.role === "user" || i === messages.length - 1)) {
      if (typeof msg.content === "string") return msg.content;
      if (Array.isArray(msg.content)) {
        var parts = [];
        for (var j = 0; j < msg.content.length; j++) {
          if (msg.content[j] && msg.content[j].text) parts.push(msg.content[j].text);
        }
        if (parts.length > 0) return parts.join(" ");
      }
    }
  }
  return "";
}

function resolveClaudeModel(name) {
  var exact = {
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
  if (exact[name]) return exact[name];
  if (name.indexOf("opus") !== -1) return "claude-opus-5-5";
  if (name.indexOf("haiku") !== -1) return "claude-haiku-5-5";
  return "claude-sonnet-5";
}

// ---------------------------------------------------------------------------
// 1. Google Antigravity (GenAI /models/{model}:* or /v1internal:*)
// ---------------------------------------------------------------------------
if (pathSuffix.indexOf(":generateContent") !== -1 || pathSuffix.indexOf(":streamGenerateContent") !== -1) {
  var isGenAIStream = (pathSuffix.indexOf(":streamGenerateContent") !== -1);
  var genaiModel = "gemini-3.8-flash";
  var modelMatch = pathSuffix.match(/\/models\/([^\/:]+):/);
  if (modelMatch && modelMatch[1]) {
    genaiModel = modelMatch[1];
  } else if (body.model) {
    var mParts = String(body.model).split("/");
    genaiModel = mParts[mParts.length - 1];
  }
  if (genaiModel === "gemini-3.1-flash-lite-preview") {
    genaiModel = "gemini-3.1-flash-lite";
  }

  // Unwrap v1internal envelope if present ({ model, user_prompt_id, request: { contents, ... } })
  var innerReq = (body.request && typeof body.request === "object" && body.request.contents) ? body.request : body;
  var genaiPrompt = "";
  if (innerReq.contents && Array.isArray(innerReq.contents) && innerReq.contents.length > 0) {
    var lastTurn = innerReq.contents[innerReq.contents.length - 1];
    if (lastTurn && Array.isArray(lastTurn.parts)) {
      var pText = [];
      for (var p = 0; p < lastTurn.parts.length; p++) {
        if (lastTurn.parts[p] && lastTurn.parts[p].text) pText.push(lastTurn.parts[p].text);
      }
      genaiPrompt = pText.join(" ");
    }
  }
  if (genaiPrompt) {
    context.setVariable("flow.userPrompt", genaiPrompt.substring(0, 4096));
  }
  if (innerReq !== body) {
    delete innerReq.session_id;
    context.setVariable("request.content", JSON.stringify(innerReq));
  }

  context.setVariable("flow.wire_protocol", "genai");
  context.setVariable("flow.target_provider", "google");
  context.setVariable("flow.requested_model", genaiModel);
  context.setVariable("flow.model", genaiModel);
  context.setVariable("flow.target_model", genaiModel);
  context.setVariable("flow.quota_model", genaiModel);
  context.setVariable("flow.is_stream", isGenAIStream ? "true" : "false");
  context.setVariable("flow.is_streaming", isGenAIStream ? "true" : "false");
  context.setVariable(
    "flow.vertex_target_url",
    "https://aiplatform.googleapis.com/v1/projects/" + orgName + "/locations/global/publishers/google/models/" + genaiModel + (isGenAIStream ? ":streamGenerateContent?alt=sse" : ":generateContent")
  );
}
// ---------------------------------------------------------------------------
// 2. Anthropic Claude Code & Desktop (/v1/messages or /publishers/anthropic/models/*)
// ---------------------------------------------------------------------------
else if (pathSuffix.indexOf("/messages") !== -1 || pathSuffix.indexOf("/publishers/anthropic/models/") !== -1) {
  var claudeMatch = pathSuffix.match(/\/publishers\/anthropic\/models\/([^\/:]+):(rawPredict|streamRawPredict|countTokens)/);
  var rawClaudeModel = (claudeMatch && claudeMatch[1]) ? claudeMatch[1] : String(body.model || "claude-sonnet-5");
  var claudeAction = (claudeMatch && claudeMatch[2]) ? claudeMatch[2] : "";
  if (!claudeAction) {
    if (pathSuffix.indexOf("count_tokens") !== -1 || pathSuffix.indexOf(":countTokens") !== -1) {
      claudeAction = "countTokens";
    } else if (body.stream === true) {
      claudeAction = "streamRawPredict";
    } else {
      claudeAction = "rawPredict";
    }
  }

  var claudePrompt = extractMessagesPrompt(body.messages);
  if (claudePrompt) {
    context.setVariable("flow.userPrompt", claudePrompt.substring(0, 4096));
  }

  var vertexClaude = resolveClaudeModel(rawClaudeModel.toLowerCase().replace(/-(\d{8})$/, "@$1"));
  var bareClaude = vertexClaude.split("@")[0];
  var isClaudeCount = (claudeAction === "countTokens");
  var isClaudeStream = (!isClaudeCount) && (claudeAction === "streamRawPredict");

  if (isClaudeCount) {
    delete body.anthropic_version;
    body.model = vertexClaude;
    context.setVariable("request.content", JSON.stringify(body));
  } else {
    var modified = false;
    if (body.model) {
      delete body.model;
      modified = true;
    }
    if (!body.anthropic_version) {
      body.anthropic_version = "vertex-2023-10-16";
      modified = true;
    }
    if (modified) {
      context.setVariable("request.content", JSON.stringify(body));
    }
  }

  // Sanitize anthropic-beta header
  var betaHdr = context.getVariable("request.header.anthropic-beta");
  if (betaHdr) {
    var unsupBetas = ["advisor-tool", "per-turn-control", "mid-conversation-tool-changes", "inline-tools", "structured-outputs"];
    var rBetas = String(betaHdr).split(",");
    var fBetas = [];
    for (var bIdx = 0; bIdx < rBetas.length; bIdx++) {
      var flg = rBetas[bIdx].trim();
      if (!flg) continue;
      var bad = false;
      for (var uIdx = 0; uIdx < unsupBetas.length; uIdx++) {
        if (flg.indexOf(unsupBetas[uIdx]) === 0) { bad = true; break; }
      }
      if (!bad) fBetas.push(flg);
    }
    if (fBetas.length > 0) context.setVariable("request.header.anthropic-beta", fBetas.join(","));
    else context.removeVariable("request.header.anthropic-beta");
  }

  context.setVariable("flow.wire_protocol", "anthropic");
  context.setVariable("flow.target_provider", "anthropic");
  context.setVariable("flow.requested_model", rawClaudeModel);
  context.setVariable("flow.model", bareClaude);
  context.setVariable("flow.target_model", bareClaude);
  context.setVariable("flow.quota_model", bareClaude);
  context.setVariable("flow.is_stream", isClaudeStream ? "true" : "false");
  context.setVariable("flow.is_streaming", isClaudeStream ? "true" : "false");
  context.setVariable(
    "flow.vertex_target_url",
    "https://aiplatform.googleapis.com/v1/projects/" + orgName + "/locations/global/publishers/anthropic/models/" + (isClaudeCount ? "count-tokens:rawPredict" : (vertexClaude + ":" + claudeAction))
  );
}
// ---------------------------------------------------------------------------
// 3. GitHub Copilot & Microsoft Copilot (/v1/chat/completions & /openai/deployments/*)
// ---------------------------------------------------------------------------
else if (pathSuffix.indexOf("/chat/completions") !== -1) {
  var deployMatch = pathSuffix.match(/^\/(?:v1\/)?openai\/deployments\/([^\/]+)\/chat\/completions/i);
  var pathDeployModel = deployMatch ? decodeURIComponent(deployMatch[1]) : "";
  var rawOAIModel = String(body.model || pathDeployModel || "gemini-3.8-flash").trim();
  context.setVariable("flow.requested_model", rawOAIModel);

  var cleanOAIModel = rawOAIModel;
  if (cleanOAIModel.indexOf("/") !== -1) {
    var oaiParts = cleanOAIModel.split("/");
    cleanOAIModel = oaiParts[oaiParts.length - 1];
  }
  var aliases = {
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
  if (aliases[cleanOAIModel]) {
    cleanOAIModel = aliases[cleanOAIModel];
  }

  var oaiPrompt = extractMessagesPrompt(body.messages);
  if (oaiPrompt) {
    context.setVariable("flow.userPrompt", oaiPrompt.substring(0, 4096));
  }

  var isOAIStream = (body.stream === true);
  context.setVariable("flow.client_stream", isOAIStream ? "true" : "false");
  context.setVariable("flow.wire_protocol", "openai");

  if (cleanOAIModel.indexOf("claude") === 0 || rawOAIModel.indexOf("anthropic/") === 0) {
    var vClaude = resolveClaudeModel(cleanOAIModel);
    var bClaude = vClaude.split("@")[0];
    context.setVariable("flow.openai_to_claude", "true");
    context.setVariable("flow.target_provider", "anthropic");
    context.setVariable("flow.model", bClaude);
    context.setVariable("flow.target_model", bClaude);
    context.setVariable("flow.quota_model", bClaude);
    context.setVariable("flow.is_stream", "false");
    context.setVariable("flow.is_streaming", isOAIStream ? "true" : "false");
    context.setVariable(
      "flow.vertex_target_url",
      "https://aiplatform.googleapis.com/v1/projects/" + orgName + "/locations/global/publishers/anthropic/models/" + vClaude + ":rawPredict"
    );

    var sysParts = [];
    var anthMsgs = [];
    if (body.messages && Array.isArray(body.messages)) {
      for (var k = 0; k < body.messages.length; k++) {
        var item = body.messages[k];
        if (!item) continue;
        if (item.role === "system" || item.role === "developer") {
          if (typeof item.content === "string") sysParts.push(item.content);
        } else {
          anthMsgs.push({
            role: item.role === "assistant" ? "assistant" : "user",
            content: item.content || ""
          });
        }
      }
    }
    if (anthMsgs.length === 0) {
      anthMsgs.push({ role: "user", content: oaiPrompt || "Hello" });
    }
    var anthBody = {
      anthropic_version: "vertex-2023-10-16",
      max_tokens: body.max_completion_tokens || body.max_tokens || 4096,
      messages: anthMsgs
    };
    if (sysParts.length > 0) anthBody.system = sysParts.join("\n\n");
    if (typeof body.temperature === "number") anthBody.temperature = body.temperature;
    if (typeof body.top_p === "number") anthBody.top_p = body.top_p;
    context.setVariable("request.content", JSON.stringify(anthBody));
  } else {
    var bGemini = cleanOAIModel || "gemini-3.8-flash";
    context.setVariable("flow.openai_to_claude", "false");
    context.setVariable("flow.target_provider", "google");
    context.setVariable("flow.model", bGemini);
    context.setVariable("flow.target_model", bGemini);
    context.setVariable("flow.quota_model", bGemini);
    context.setVariable("flow.is_stream", isOAIStream ? "true" : "false");
    context.setVariable("flow.is_streaming", isOAIStream ? "true" : "false");
    context.setVariable(
      "flow.vertex_target_url",
      "https://aiplatform.googleapis.com/v1beta1/projects/" + orgName + "/locations/global/endpoints/openapi/chat/completions"
    );

    body.model = "google/" + bGemini;
    if (isOAIStream) {
      if (!body.stream_options || typeof body.stream_options !== "object") {
        body.stream_options = {};
      }
      body.stream_options.include_usage = true;
    }
    context.setVariable("request.content", JSON.stringify(body));
  }
}
