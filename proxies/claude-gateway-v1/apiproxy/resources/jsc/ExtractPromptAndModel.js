// Extract user prompt and model from Anthropic Claude Messages (both /v1/messages and Vertex :rawPredict/:streamRawPredict)
// into flow.userPrompt for SanitizeUserPrompt (Model Armor) and ML-CloudLogging.
// Also normalizes /v1/messages requests for Vertex AI (:rawPredict / :streamRawPredict).
var reqContent = context.getVariable("request.content") || "";
var pathSuffix = String(context.getVariable("proxy.pathsuffix") || "");
var payloadModified = false;

if (reqContent) {
  try {
    var payload = JSON.parse(String(reqContent));
    var prompt = "";

    // 1. Anthropic Claude / OpenAI format: messages[].content
    if (payload.messages && Array.isArray(payload.messages) && payload.messages.length > 0) {
      var lastMsg = payload.messages[payload.messages.length - 1];
      if (lastMsg) {
        if (typeof lastMsg.content === "string") {
          prompt = lastMsg.content;
        } else if (Array.isArray(lastMsg.content)) {
          var msgParts = [];
          for (var m = 0; m < lastMsg.content.length; m++) {
            if (lastMsg.content[m] && lastMsg.content[m].text) {
              msgParts.push(lastMsg.content[m].text);
            }
          }
          prompt = msgParts.join(" ");
        }
      }
    }

    if (prompt) {
      context.setVariable("flow.userPrompt", prompt.substring(0, 4096));
    }

    // Extract model from body if calling /v1/messages or /messages
    if (payload.model) {
      if (!context.getVariable("flow.model")) {
        context.setVariable("flow.model", String(payload.model));
      }
      // Vertex AI :rawPredict / :streamRawPredict requires model in URL, not in JSON body
      delete payload.model;
      payloadModified = true;
    }

    // Determine action (rawPredict, streamRawPredict, countTokens) when not in URL
    if (!context.getVariable("flow.action")) {
      if (pathSuffix.indexOf("count_tokens") !== -1 || pathSuffix.indexOf(":countTokens") !== -1) {
        context.setVariable("flow.action", "countTokens");
      } else if (payload.stream === true) {
        context.setVariable("flow.action", "streamRawPredict");
        context.setVariable("flow.is_streaming", "true");
      } else {
        context.setVariable("flow.action", "rawPredict");
      }
    }

    // Ensure anthropic_version is set for Vertex AI
    if (!payload.anthropic_version && context.getVariable("flow.action") !== "countTokens") {
      payload.anthropic_version = "vertex-2023-10-16";
      payloadModified = true;
    }

    if (payloadModified) {
      context.setVariable("request.content", JSON.stringify(payload));
    }
  } catch (e) {
    // Non-JSON payload; continue
  }
}

// Map requested Claude model ID to active Vertex AI publisher model ID and normalize flow.quota_model
var rawModel = String(context.getVariable("flow.model") || "claude-sonnet-5");
context.setVariable("flow.requested_model", rawModel);

var vertexModel = rawModel;
var exactModels = {
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

if (exactModels[rawModel]) {
  vertexModel = exactModels[rawModel];
} else if (rawModel.indexOf("opus") !== -1) {
  vertexModel = "claude-opus-5-5";
} else if (rawModel.indexOf("haiku") !== -1) {
  vertexModel = "claude-haiku-5-5";
} else {
  vertexModel = "claude-sonnet-5";
}

context.setVariable("flow.model", vertexModel);
context.setVariable("flow.target_model", vertexModel);
context.setVariable("flow.quota_model", vertexModel.split("@")[0]);
