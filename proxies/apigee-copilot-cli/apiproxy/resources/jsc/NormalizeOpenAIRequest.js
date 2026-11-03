// Normalize OpenAI chat/completions request for Vertex AI OpenAI endpoint.
// Prefix "google/" when caller specifies a bare Gemini model ID (e.g. "gemini-3.8-flash")
// and extract flow.model / flow.target_model / flow.is_stream for routing & logging.
var raw = context.getVariable("request.content");
var isStream = "false";
var model = "google/gemini-3.8-flash";

if (raw) {
  try {
    var body = JSON.parse(String(raw));
    if (body && typeof body === "object") {
      if (body.model && typeof body.model === "string") {
        model = body.model.trim();
        if (model.indexOf("/") === -1) {
          body.model = "google/" + model;
          context.setVariable("request.content", JSON.stringify(body));
        }
      }
      if (body.stream === true) {
        isStream = "true";
      }
    }
  } catch (e) {
    // Leave payload unchanged if not valid JSON
  }
}

context.setVariable("flow.model", model);
context.setVariable("flow.target_model", model);
context.setVariable("flow.is_stream", isStream);
