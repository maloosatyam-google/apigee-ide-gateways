// If the Microsoft Copilot / OpenAI client requested stream=true on an Anthropic Claude model,
// convert the OpenAI chat.completion JSON into OpenAI SSE (text/event-stream) chunks.
var rawResp = context.getVariable("response.content");
if (rawResp) {
  try {
    var openAIResp = JSON.parse(String(rawResp));
    var contentText = (openAIResp.choices && openAIResp.choices[0] && openAIResp.choices[0].message)
      ? openAIResp.choices[0].message.content
      : "";
    var chunk1 = {
      id: openAIResp.id,
      object: "chat.completion.chunk",
      created: openAIResp.created,
      model: openAIResp.model,
      choices: [
        {
          index: 0,
          delta: {
            role: "assistant",
            content: contentText
          },
          logprobs: null,
          finish_reason: null
        }
      ]
    };
    var chunk2 = {
      id: openAIResp.id,
      object: "chat.completion.chunk",
      created: openAIResp.created,
      model: openAIResp.model,
      choices: [
        {
          index: 0,
          delta: {},
          logprobs: null,
          finish_reason: "stop"
        }
      ],
      usage: openAIResp.usage
    };
    var ssePayload = "data: " + JSON.stringify(chunk1) + "\n\n" +
                     "data: " + JSON.stringify(chunk2) + "\n\n" +
                     "data: [DONE]\n\n";
    context.setVariable("response.content", ssePayload);
    context.setVariable("response.header.Content-Type", "text/event-stream");
    context.setVariable("response.header.Cache-Control", "no-cache");
    context.setVariable("response.header.X-Accel-Buffering", "no");
  } catch (e) {
    // Leave untouched
  }
}
