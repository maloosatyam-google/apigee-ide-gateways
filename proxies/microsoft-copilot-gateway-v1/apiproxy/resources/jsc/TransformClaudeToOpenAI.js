// Transform Vertex AI Anthropic (:rawPredict) response into OpenAI chat.completion JSON
// so downstream policies (EV-ModelResponse, LTQ-TokenCount, KVM-GetModelRates, JS-CalculateCost,
// SMR-SanitizeModelResponse, DC-ModelAnalytics, AM-SetResponseHeaders) work uniformly.
var rawResp = context.getVariable("response.content");
if (rawResp) {
  try {
    var claudeResp = JSON.parse(String(rawResp));
    var textParts = [];
    if (claudeResp.content && Array.isArray(claudeResp.content)) {
      for (var i = 0; i < claudeResp.content.length; i++) {
        var block = claudeResp.content[i];
        if (block && block.type === "text" && typeof block.text === "string") {
          textParts.push(block.text);
        }
      }
    }
    var assistantText = textParts.join("");
    var promptTokens = (claudeResp.usage && claudeResp.usage.input_tokens) ? Number(claudeResp.usage.input_tokens) : 0;
    var completionTokens = (claudeResp.usage && claudeResp.usage.output_tokens) ? Number(claudeResp.usage.output_tokens) : 0;
    var totalTokens = promptTokens + completionTokens;
    var modelName = String(context.getVariable("flow.target_model") || claudeResp.model || "claude-sonnet-5");
    var createdEpoch = Math.floor(Date.now() / 1000);
    var msgId = claudeResp.id || ("chatcmpl-" + createdEpoch);

    var openAIResp = {
      id: msgId,
      object: "chat.completion",
      created: createdEpoch,
      model: modelName,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: assistantText
          },
          logprobs: null,
          finish_reason: claudeResp.stop_reason === "max_tokens" ? "length" : "stop"
        }
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens
      }
    };

    context.setVariable("response.content", JSON.stringify(openAIResp));
  } catch (e) {
    // Leave response untouched if not valid JSON
  }
}
