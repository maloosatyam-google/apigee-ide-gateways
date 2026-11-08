// Extract user prompt and model from Anthropic Claude Messages (or Gemini/OpenAI) request payload
// into flow.userPrompt for SanitizeUserPrompt (Model Armor) and ML-CloudLogging.
var reqContent = context.getVariable("request.content") || "";
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
    // 2. Google Gemini format: contents[].parts[].text
    else if (payload.contents && Array.isArray(payload.contents) && payload.contents.length > 0) {
      var lastContent = payload.contents[payload.contents.length - 1];
      if (lastContent && lastContent.parts && Array.isArray(lastContent.parts)) {
        var partsText = [];
        for (var p = 0; p < lastContent.parts.length; p++) {
          if (lastContent.parts[p] && lastContent.parts[p].text) {
            partsText.push(lastContent.parts[p].text);
          }
        }
        prompt = partsText.join(" ");
      }
    }

    if (prompt) {
      context.setVariable("flow.userPrompt", prompt.substring(0, 4096));
    }
    if (payload.model && !context.getVariable("flow.model")) {
      context.setVariable("flow.model", String(payload.model));
    }
  } catch (e) {
    // Non-JSON payload; continue
  }
}

// Normalize flow.quota_model by stripping @YYYYMMDD version suffix so it matches API Product llmOperations
var rawModel = context.getVariable("flow.model") || "";
if (rawModel) {
  var normalizedQuotaModel = String(rawModel).split("@")[0];
  context.setVariable("flow.quota_model", normalizedQuotaModel);
  context.setVariable("flow.target_model", String(rawModel));
}
