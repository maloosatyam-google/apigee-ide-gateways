// Extract user prompt from Gemini contents[].parts[].text into flow.userPrompt
// for SanitizeUserPrompt (Model Armor) and ML-CloudLogging.
var reqContent = context.getVariable("request.content") || "";
if (reqContent) {
  try {
    var payload = JSON.parse(String(reqContent));
    var prompt = "";

    if (payload.contents && Array.isArray(payload.contents) && payload.contents.length > 0) {
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
  } catch (e) {
    // Non-JSON payload; continue
  }
}

