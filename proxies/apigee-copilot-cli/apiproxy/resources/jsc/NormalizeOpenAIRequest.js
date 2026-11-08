// Normalize OpenAI chat/completions request for Vertex AI OpenAI endpoint:
// 1. Prefix "google/" when caller specifies a bare Gemini model ID (e.g. "gemini-3.8-flash")
//    while preserving the bare model ID in flow.model / flow.quota_model for LLMTokenQuota & KVM pricing.
// 2. Map "gemini-3.1-flash-lite" to Vertex AI's "google/gemini-3.1-flash-lite-preview".
// 3. Extract the latest user prompt from messages[] into flow.userPrompt for SUP-UserPrompt & ML-CloudLogging.
// 4. When stream === true, set stream_options.include_usage = true so Vertex AI emits token usage in the final SSE chunk.
var raw = context.getVariable("request.content");
var isStream = "false";
var requestedModel = "gemini-3.8-flash";
var bareModel = "gemini-3.8-flash";
var targetModel = "gemini-3.8-flash";
var prompt = "";

if (raw) {
  try {
    var body = JSON.parse(String(raw));
    var modified = false;

    if (body && typeof body === "object") {
      if (body.model && typeof body.model === "string") {
        requestedModel = body.model.trim();
        bareModel = requestedModel.indexOf("google/") === 0
          ? requestedModel.substring(7)
          : requestedModel;
        targetModel = bareModel === "gemini-3.1-flash-lite"
          ? "gemini-3.1-flash-lite-preview"
          : bareModel;
        var vertexModel = "google/" + targetModel;
        if (body.model !== vertexModel) {
          body.model = vertexModel;
          modified = true;
        }
      }

      if (body.stream === true) {
        isStream = "true";
        if (!body.stream_options || typeof body.stream_options !== "object") {
          body.stream_options = { include_usage: true };
          modified = true;
        } else if (body.stream_options.include_usage !== true) {
          body.stream_options.include_usage = true;
          modified = true;
        }
      }

      if (body.messages && Array.isArray(body.messages)) {
        for (var i = body.messages.length - 1; i >= 0; i--) {
          var m = body.messages[i];
          if (m && m.role === "user" && m.content) {
            if (typeof m.content === "string") {
              prompt = m.content;
            } else if (Array.isArray(m.content)) {
              var parts = [];
              for (var j = 0; j < m.content.length; j++) {
                if (m.content[j] && m.content[j].text) {
                  parts.push(m.content[j].text);
                }
              }
              prompt = parts.join(" ");
            }
            if (prompt) break;
          }
        }
      }

      if (modified) {
        context.setVariable("request.content", JSON.stringify(body));
      }
    }
  } catch (e) {
    // Leave payload unchanged if not valid JSON
  }
}

context.setVariable("flow.model", bareModel);
context.setVariable("flow.quota_model", bareModel);
context.setVariable("flow.target_model", targetModel);
context.setVariable("flow.is_stream", isStream);
context.setVariable("flow.is_streaming", isStream);
if (prompt) {
  context.setVariable("flow.userPrompt", prompt.substring(0, 4096));
}
