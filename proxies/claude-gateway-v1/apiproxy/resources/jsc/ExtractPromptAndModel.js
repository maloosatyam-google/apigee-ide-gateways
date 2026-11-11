// Extract user prompt and model from Anthropic Claude Messages (both /v1/messages and Vertex :rawPredict/:streamRawPredict)
// into flow.userPrompt for SanitizeUserPrompt (Model Armor) and ML-CloudLogging.
// Also normalizes /v1/messages and /v1/messages/count_tokens requests for Vertex AI.
var reqContent = context.getVariable("request.content") || "";
var pathSuffix = String(context.getVariable("proxy.pathsuffix") || "");
var isCountTokens = (pathSuffix.indexOf("count_tokens") !== -1) || (pathSuffix.indexOf(":countTokens") !== -1) || (pathSuffix.indexOf("count-tokens") !== -1);

var payload = null;
if (reqContent) {
  try {
    payload = JSON.parse(String(reqContent));
  } catch (e) {
    payload = null;
  }
}

if (payload && typeof payload === "object") {
  var prompt = "";
  if (payload.messages && Array.isArray(payload.messages) && payload.messages.length > 0) {
    for (var i = payload.messages.length - 1; i >= 0; i--) {
      var msg = payload.messages[i];
      if (msg && msg.role === "user") {
        if (typeof msg.content === "string") {
          prompt = msg.content;
        } else if (Array.isArray(msg.content)) {
          var msgParts = [];
          for (var m = 0; m < msg.content.length; m++) {
            if (msg.content[m] && msg.content[m].text) {
              msgParts.push(msg.content[m].text);
            }
          }
          prompt = msgParts.join(" ");
        }
        if (prompt) break;
      }
    }
  }
  if (prompt) {
    context.setVariable("flow.userPrompt", prompt.substring(0, 4096));
  }
  if (payload.model && !context.getVariable("flow.model")) {
    context.setVariable("flow.model", String(payload.model));
  }
}

// Map requested Claude model ID to active Vertex AI publisher model ID and normalize flow.quota_model
var rawModel = String(context.getVariable("flow.model") || "claude-sonnet-5");
context.setVariable("flow.requested_model", rawModel);

var normModel = rawModel.toLowerCase().replace(/-(\d{8})$/, "@$1");
var bareNorm = normModel.split("@")[0];
var vertexModel = normModel;
var exactModels = {
  "claude-sonnet-5": "claude-sonnet-5",
  "claude-opus-5-5": "claude-opus-5-5",
  "claude-haiku-5-5": "claude-haiku-5-5",
  "claude-opus-4-5@20251101": "claude-opus-4-5@20251101",
  "claude-opus-4-5": "claude-opus-4-5@20251101",
  "claude-haiku-4-5@20251001": "claude-haiku-4-5@20251001",
  "claude-haiku-4-5": "claude-haiku-4-5@20251001"
};

if (exactModels[normModel]) {
  vertexModel = exactModels[normModel];
} else if (exactModels[bareNorm]) {
  vertexModel = exactModels[bareNorm];
} else if (bareNorm.indexOf("opus") !== -1) {
  vertexModel = "claude-opus-5-5";
} else if (bareNorm.indexOf("haiku") !== -1) {
  vertexModel = "claude-haiku-5-5";
} else {
  vertexModel = "claude-sonnet-5";
}

if (payload && typeof payload === "object") {
  if (isCountTokens) {
    delete payload.anthropic_version;
    payload.model = vertexModel;
    context.setVariable("flow.action", "rawPredict");
    context.setVariable("flow.model", "count-tokens");
  } else {
    delete payload.model;
    payload.anthropic_version = "vertex-2023-10-16";
    if (!context.getVariable("flow.action")) {
      if (payload.stream === true) {
        context.setVariable("flow.action", "streamRawPredict");
        context.setVariable("flow.is_streaming", "true");
      } else {
        context.setVariable("flow.action", "rawPredict");
      }
    }
    context.setVariable("flow.model", vertexModel);
  }
  context.setVariable("request.content", JSON.stringify(payload));
} else {
  context.setVariable("flow.model", vertexModel);
}

context.setVariable("flow.target_model", vertexModel.split("@")[0]);
context.setVariable("flow.quota_model", vertexModel.split("@")[0]);

// Sanitize anthropic-beta header to strip 1P-only beta flags rejected by Vertex AI
var betaHeader = context.getVariable("request.header.anthropic-beta");
if (betaHeader) {
  var unsupportedBetaPrefixes = [
    "advisor-tool",
    "per-turn-control",
    "mid-conversation-tool-changes",
    "inline-tools",
    "structured-outputs"
  ];
  var rawBetas = String(betaHeader).split(",");
  var filteredBetas = [];
  for (var b = 0; b < rawBetas.length; b++) {
    var flag = rawBetas[b].trim();
    if (!flag) continue;
    var isUnsupported = false;
    for (var u = 0; u < unsupportedBetaPrefixes.length; u++) {
      if (flag.indexOf(unsupportedBetaPrefixes[u]) === 0) {
        isUnsupported = true;
        break;
      }
    }
    if (!isUnsupported) {
      filteredBetas.push(flag);
    }
  }
  if (filteredBetas.length > 0) {
    context.setVariable("request.header.anthropic-beta", filteredBetas.join(","));
  } else {
    context.removeVariable("request.header.anthropic-beta");
  }
}
