// Cost of one pass-through call from the shared ai-model-rates KVM (USD per 1M tokens).
var model = String(context.getVariable("flow.model") || "").toLowerCase().trim();
var prompt = parseInt(context.getVariable("flow.promptTokenCount") || "0", 10) || 0;
var candidates = parseInt(context.getVariable("flow.candidatesTokenCount") || "0", 10) || 0;
var thoughts = parseInt(context.getVariable("flow.thoughtsTokenCount") || "0", 10) || 0;
var output = candidates + thoughts;
var total = parseInt(context.getVariable("flow.totalTokenCount") || "0", 10) || (prompt + output);

if (!context.getVariable("flow.responseText") && context.getVariable("flow.wire_protocol") === "anthropic") {
  var rawResp = context.getVariable("response.content");
  if (rawResp) {
    try {
      var parsed = JSON.parse(String(rawResp));
      if (parsed.content && Array.isArray(parsed.content)) {
        var textBlocks = [];
        for (var i = 0; i < parsed.content.length; i++) {
          if (parsed.content[i] && parsed.content[i].type === "text" && parsed.content[i].text) {
            textBlocks.push(parsed.content[i].text);
          }
        }
        if (textBlocks.length > 0) {
          context.setVariable("flow.responseText", textBlocks.join("").substring(0, 4096));
        }
      }
    } catch (e) {}
  }
}

var rate = null;
var source = "unavailable: rate card not loaded";
var raw = context.getVariable("flow.model_rates_json");
if (raw) {
  try {
    var card = JSON.parse(String(raw));
    rate = card[model] || card[model.split("@")[0]] || card["default"] || null;
    source = rate ? "kvm" : "unavailable: no rate for " + model + " in the rate card";
  } catch (e) {
    source = "unavailable: rate card is not valid JSON";
  }
}

if (rate && !isNaN(parseFloat(rate.input)) && !isNaN(parseFloat(rate.output))) {
  var billableOut = (total > prompt) ? (total - prompt) : output;
  var usd = (prompt / 1000000.0) * parseFloat(rate.input) + (billableOut / 1000000.0) * parseFloat(rate.output);
  context.setVariable("flow.tx_cost_usd", usd.toFixed(6));
} else if (source === "kvm") {
  source = "unavailable: incomplete rate for " + model;
}
context.setVariable("flow.cost_source", source);
context.setVariable("flow.candidatesTokenCount", String(output));
context.setVariable("flow.totalTokenCount", String(total));
