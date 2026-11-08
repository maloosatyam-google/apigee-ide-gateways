// Normalize Anthropic Claude usage (input_tokens, output_tokens) into flow.promptTokenCount,
// flow.candidatesTokenCount, and flow.totalTokenCount for LLMTokenQuota, DataCapture, and cost calculation.
var prompt = parseInt(context.getVariable("flow.claudePromptTokens") || "0", 10) || 0;
var output = parseInt(context.getVariable("flow.claudeCandidatesTokens") || "0", 10) || 0;
var total = prompt + output;

context.setVariable("flow.promptTokenCount", String(prompt));
context.setVariable("flow.candidatesTokenCount", String(output));
context.setVariable("flow.totalTokenCount", String(total));

