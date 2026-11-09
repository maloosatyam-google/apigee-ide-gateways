// Unified SSE EventFlow processor for ide-gateway-v1 across:
//   1. GenAI SSE (:streamGenerateContent?alt=sse -> candidates[].content.parts[].text, usageMetadata)
//   2. Anthropic Claude SSE (:streamRawPredict -> content_block_delta.delta.text, message_start/message_delta usage)
//   3. OpenAI SSE (/endpoints/openapi/chat/completions -> choices[].delta.content, usage)
context.setVariable("flow.stream_done", "false");
context.setVariable("flow.is_streaming", "true");
context.setVariable("flow.currentChunkText", "");
var rawEvent = context.getVariable("response.event.current.data") || "";

if (rawEvent) {
  try {
    var lines = String(rawEvent).split("\n");
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (line.indexOf("data:") === 0) {
        line = line.substring(5).trim();
      }
      if (!line || line === "[DONE]" || line.charAt(0) !== "{") continue;

      var chunk = JSON.parse(line);
      var deltaText = "";

      // 1. OpenAI SSE format
      if (chunk.choices && Array.isArray(chunk.choices) && chunk.choices.length > 0) {
        var delta = chunk.choices[0].delta;
        if (delta && typeof delta.content === "string" && delta.content.length > 0) {
          deltaText = delta.content;
        }
      }
      // 2. GenAI SSE format
      else if (chunk.candidates && Array.isArray(chunk.candidates) && chunk.candidates.length > 0) {
        var cand = chunk.candidates[0];
        if (cand && cand.content && Array.isArray(cand.content.parts)) {
          for (var p = 0; p < cand.content.parts.length; p++) {
            var part = cand.content.parts[p];
            if (part && typeof part.text === "string" && !part.thought) {
              deltaText += part.text;
            }
          }
        }
      }
      // 3. Anthropic Claude SSE format
      else if (chunk.type === "content_block_delta" && chunk.delta && typeof chunk.delta.text === "string") {
        deltaText = chunk.delta.text;
      }

      if (deltaText) {
        context.setVariable("flow.currentChunkText", deltaText);
        var prev = context.getVariable("flow.responseText") || "";
        if (prev.length < 4096) {
          context.setVariable("flow.responseText", (prev + deltaText).substring(0, 4096));
        }
      }

      // Token Usage Extraction:
      // A. OpenAI usage
      if (chunk.usage && (chunk.usage.total_tokens || chunk.usage.prompt_tokens)) {
        var oaiP = parseInt(chunk.usage.prompt_tokens || "0", 10);
        var oaiC = parseInt(chunk.usage.completion_tokens || "0", 10);
        var oaiT = parseInt(chunk.usage.total_tokens || String(oaiP + oaiC), 10);
        context.setVariable("flow.promptTokenCount", String(oaiP));
        context.setVariable("flow.candidatesTokenCount", String(oaiC));
        context.setVariable("flow.totalTokenCount", String(oaiT));
        context.setVariable("flow.stream_done", "true");
      }
      // B. GenAI usageMetadata
      else if (chunk.usageMetadata && chunk.usageMetadata.totalTokenCount) {
        var genP = parseInt(chunk.usageMetadata.promptTokenCount || "0", 10);
        var genC = parseInt(chunk.usageMetadata.candidatesTokenCount || "0", 10);
        var genT = parseInt(chunk.usageMetadata.totalTokenCount || String(genP + genC), 10);
        context.setVariable("flow.promptTokenCount", String(genP));
        context.setVariable("flow.candidatesTokenCount", String(genC));
        context.setVariable("flow.totalTokenCount", String(genT));
        if (chunk.candidates && chunk.candidates[0] && chunk.candidates[0].finishReason) {
          context.setVariable("flow.stream_done", "true");
        }
      }
      // C. Anthropic Claude message_start & message_delta usage
      else if (chunk.type === "message_start" && chunk.message && chunk.message.usage) {
        var claudeIn = parseInt(chunk.message.usage.input_tokens || "0", 10);
        context.setVariable("flow.promptTokenCount", String(claudeIn));
      } else if (chunk.type === "message_delta" && chunk.usage && chunk.usage.output_tokens) {
        var claudeP = parseInt(context.getVariable("flow.promptTokenCount") || "0", 10);
        var claudeOut = parseInt(chunk.usage.output_tokens || "0", 10);
        var claudeTot = claudeP + claudeOut;
        context.setVariable("flow.candidatesTokenCount", String(claudeOut));
        context.setVariable("flow.totalTokenCount", String(claudeTot));
        context.setVariable("flow.stream_done", "true");
      }

      // Calculate cost when stream_done is set
      if (context.getVariable("flow.stream_done") === "true") {
        var pTok = parseInt(context.getVariable("flow.promptTokenCount") || "0", 10);
        var cTok = parseInt(context.getVariable("flow.candidatesTokenCount") || "0", 10);
        var tTok = parseInt(context.getVariable("flow.totalTokenCount") || "0", 10);
        var bTok = (tTok > pTok) ? (tTok - pTok) : cTok;
        var model = context.getVariable("flow.target_model") || "gemini-3.8-flash";
        var ratesJson = context.getVariable("flow.model_rates_json");
        var inputRate = 0.15;
        var outputRate = 0.60;
        if (ratesJson) {
          try {
            var rates = JSON.parse(ratesJson);
            var r = rates[model] || rates[model.split("@")[0]] || rates["default"];
            if (r) {
              inputRate = parseFloat(r.input);
              outputRate = parseFloat(r.output);
            }
          } catch (e) {}
        }
        var cost = ((pTok / 1000000.0) * inputRate) + ((bTok / 1000000.0) * outputRate);
        context.setVariable("flow.tx_cost_usd", cost.toFixed(6));
      }
    }
  } catch (e) {
    // Ignore non-JSON SSE keepalives
  }
}
