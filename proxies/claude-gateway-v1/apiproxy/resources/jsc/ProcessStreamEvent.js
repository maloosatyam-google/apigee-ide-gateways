// Accumulate streamed Claude SSE text (content_block_delta) and token counts (message_start / message_delta)
// into flow.responseText, flow.promptTokenCount, flow.candidatesTokenCount, flow.totalTokenCount, and flow.tx_cost_usd
// so PostClientFlow ML-CloudLogging and EventFlow DC-ModelAnalytics record full prompt/response, token, and cost metrics.
context.setVariable("flow.stream_done", "false");
context.setVariable("flow.is_streaming", "true");

try {
  var rawData = context.getVariable("response.event.current.data") || context.getVariable("response.event.current.content") || "";
  if (rawData) {
    var lines = String(rawData).split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line.indexOf("data:") === 0) {
        line = line.substring(5).trim();
      }
      if (!line || line.charAt(0) !== "{") {
        continue;
      }
      var ev = null;
      try {
        ev = JSON.parse(line);
      } catch (e) {
        continue;
      }
      if (!ev || typeof ev !== "object") {
        continue;
      }
      var evType = String(ev.type || "");
      if (evType === "message_start" && ev.message && ev.message.usage) {
        if (ev.message.usage.input_tokens !== undefined) {
          context.setVariable("flow.saved_stream_prompt_tokens", String(ev.message.usage.input_tokens));
        }
        if (ev.message.usage.output_tokens !== undefined) {
          context.setVariable("flow.saved_stream_candidates_tokens", String(ev.message.usage.output_tokens));
        }
      } else if (evType === "content_block_delta" && ev.delta && ev.delta.text) {
        var prev = context.getVariable("flow.responseText") || "";
        if (prev.length < 4096) {
          context.setVariable("flow.responseText", (prev + ev.delta.text).substring(0, 4096));
        }
      } else if (evType === "message_delta") {
        if (ev.usage && ev.usage.output_tokens !== undefined) {
          context.setVariable("flow.saved_stream_candidates_tokens", String(ev.usage.output_tokens));
        }
        var pTok = parseInt(context.getVariable("flow.saved_stream_prompt_tokens") || "0", 10) || 0;
        var cTok = parseInt(context.getVariable("flow.saved_stream_candidates_tokens") || "0", 10) || 0;
        context.setVariable("flow.promptTokenCount", String(pTok));
        context.setVariable("flow.candidatesTokenCount", String(cTok));
        context.setVariable("flow.totalTokenCount", String(pTok + cTok));
        context.setVariable("flow.stream_done", "true");

        // Calculate cost from ai-model-rates KVM if loaded
        var model = String(context.getVariable("flow.target_model") || context.getVariable("flow.model") || "").toLowerCase().trim();
        var rawCard = context.getVariable("flow.model_rates_json");
        if (rawCard) {
          try {
            var card = JSON.parse(String(rawCard));
            var rate = card[model] || card[model.split("@")[0]] || card["default"] || null;
            if (rate && !isNaN(parseFloat(rate.input)) && !isNaN(parseFloat(rate.output))) {
              var usd = (pTok / 1000000.0) * parseFloat(rate.input) + (cTok / 1000000.0) * parseFloat(rate.output);
              context.setVariable("flow.tx_cost_usd", usd.toFixed(6));
              context.setVariable("flow.cost_source", "kvm");
            }
          } catch (rateErr) {
            context.setVariable("flow.cost_source", "unavailable: invalid rate card JSON");
          }
        }
      }
    }
  }
} catch (err) {
  // Never fail an SSE chunk
}
