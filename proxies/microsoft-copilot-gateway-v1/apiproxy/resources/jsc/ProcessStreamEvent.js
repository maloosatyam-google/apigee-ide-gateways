// Process Vertex AI OpenAI SSE event (chat.completion.chunk) inside <EventFlow>
// Accumulates streamed choices[0].delta.content into flow.responseText and extracts final usage
// + calculates cost so PostClientFlow ML-CloudLogging and EventFlow DC-ModelAnalytics have full data.
context.setVariable("flow.stream_done", "false");
context.setVariable("flow.is_streaming", "true");
var raw = context.getVariable("response.event.current.data") || "";
if (raw && String(raw).trim() !== "[DONE]") {
  try {
    var evt = JSON.parse(String(raw));

    // 1. Accumulate delta text from choices[0].delta.content
    if (evt.choices && evt.choices.length > 0 && evt.choices[0].delta && evt.choices[0].delta.content) {
      var acc = context.getVariable("flow.responseText") || "";
      acc += evt.choices[0].delta.content;
      context.setVariable("flow.responseText", acc.substring(0, 4096));
    }

    // 2. Extract token counts from usage
    if (evt.usage) {
      var u = evt.usage;
      var inTok = parseInt(u.prompt_tokens || "0", 10) || 0;
      var outTok = parseInt(u.completion_tokens || "0", 10) || 0;
      var totTok = parseInt(u.total_tokens || "0", 10) || (inTok + outTok);

      context.setVariable("flow.promptTokenCount", String(inTok));
      context.setVariable("flow.candidatesTokenCount", String(outTok));
      context.setVariable("flow.totalTokenCount", String(totTok));
      context.setVariable("flow.stream_done", "true");

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
      var billableOut = (totTok > inTok) ? (totTok - inTok) : outTok;
      var costUsd = ((inTok * rates.input) + (billableOut * rates.output)) / 1000000.0;
      context.setVariable("flow.tx_cost_usd", costUsd.toFixed(6));
    }
  } catch (e) {
    // Ignore non-JSON or [DONE] frames
  }
}
