// Process Vertex AI Gemini SSE event (:streamGenerateContent?alt=sse) inside <EventFlow>
// Accumulates streamed candidate text into flow.responseText and extracts final usageMetadata
// + calculates cost so PostClientFlow ML-CloudLogging and EventFlow DC-ModelAnalytics have full data.
context.setVariable("flow.stream_done", "false");
context.setVariable("flow.is_streaming", "true");
var raw = context.getVariable("response.event.current.data") || "";
if (raw) {
  try {
    var evt = JSON.parse(String(raw));

    // 1. Accumulate text parts from candidates[0].content.parts
    if (evt.candidates && evt.candidates.length > 0 && evt.candidates[0].content && evt.candidates[0].content.parts) {
      var parts = evt.candidates[0].content.parts;
      var acc = context.getVariable("flow.responseText") || "";
      for (var i = 0; i < parts.length; i++) {
        if (parts[i] && parts[i].text && !parts[i].thought) {
          acc += parts[i].text;
        }
      }
      if (acc) {
        context.setVariable("flow.responseText", acc.substring(0, 4096));
      }
    }

    // 2. Extract token counts from usageMetadata
    if (evt.usageMetadata) {
      var u = evt.usageMetadata;
      var inTok = parseInt(u.promptTokenCount || "0", 10) || 0;
      var outTok = parseInt(u.candidatesTokenCount || "0", 10) || 0;
      var thoughtTok = parseInt(u.thoughtsTokenCount || "0", 10) || 0;
      var totTok = parseInt(u.totalTokenCount || "0", 10) || (inTok + outTok + thoughtTok);

      context.setVariable("flow.promptTokenCount", String(inTok));
      context.setVariable("flow.candidatesTokenCount", String(outTok));
      context.setVariable("flow.thoughtsTokenCount", String(thoughtTok));
      context.setVariable("flow.totalTokenCount", String(totTok));

      if (evt.candidates && evt.candidates[0] && evt.candidates[0].finishReason) {
        context.setVariable("flow.stream_done", "true");
      }

      // 3. Compute costUsd from KVM rates if loaded
      var ratesJson = context.getVariable("flow.model_rates_json");
      var model = context.getVariable("flow.target_model") || context.getVariable("flow.model");
      var rates = { "input": 0.15, "output": 0.60 };
      if (ratesJson) {
        try {
          var allRates = JSON.parse(ratesJson);
          if (model && allRates[model]) {
            rates = allRates[model];
          } else if (allRates["default"]) {
            rates = allRates["default"];
          }
        } catch (e2) {}
      }
      var billableOut = (totTok > inTok) ? (totTok - inTok) : (outTok + thoughtTok);
      var costUsd = ((inTok * rates.input) + (billableOut * rates.output)) / 1000000.0;
      context.setVariable("flow.tx_cost_usd", costUsd.toFixed(6));
    }
  } catch (e) {
    // Ignore non-JSON keepalive frames
  }
}
