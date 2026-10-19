// AI writing with the teacher's own key. The key is kept only in this browser.

export const PROVIDERS = {
  gemini:{ name:"Google Gemini", note:"Free keys available", keyUrl:"https://aistudio.google.com/app/apikey",
           models:["gemini-2.5-flash","gemini-2.5-pro","gemini-2.5-flash-lite"], def:"gemini-2.5-flash" },
  openai:{ name:"OpenAI", note:"Paid", keyUrl:"https://platform.openai.com/api-keys",
           models:["gpt-4.1-mini","gpt-4.1","gpt-4o-mini","gpt-4o"], def:"gpt-4.1-mini" },
  anthropic:{ name:"Anthropic Claude", note:"Paid", keyUrl:"https://console.anthropic.com/settings/keys",
           models:["claude-sonnet-4-5","claude-haiku-4-5","claude-opus-4-1"], def:"claude-sonnet-4-5" }
};
const KEY = "ptl:ai";
export function getAI(){
  try { const v = JSON.parse(localStorage.getItem(KEY) || "{}"); if (PROVIDERS[v.provider]) return { provider:v.provider, model:v.model || PROVIDERS[v.provider].def, key:v.key || "" }; } catch(e) {}
  return { provider:"gemini", model:PROVIDERS.gemini.def, key:"" };
}
export function setAI(v){ try { localStorage.setItem(KEY, JSON.stringify(v)); } catch(e) {} }
export function clearAI(){ try { localStorage.removeItem(KEY); } catch(e) {} }
export const hasAI = () => !!getAI().key;

export const ERR = {
  no_key:"Add your AI key first: open your profile and paste it under AI.",
  bad_key:"The AI key wasn't accepted. Check it in your profile.",
  bad_model:"That AI model isn't available for your key. Choose another model in your profile.",
  rate_limited:"Your AI key has reached its limit for now. Wait a minute and try again.",
  prompt_too_large:"The text is too long. Use a shorter excerpt.",
  refused:"The AI wouldn't write this lesson. Try a different text.",
  empty_completion:"Nothing came back. Try again.",
  upstream_error:"The connection to the AI dropped. What arrived is kept; try again.",
  invalid_json:"The AI answer didn't come back in the right shape. Try again."
};

function fail(code, text, detail){ const e = new Error(code); e.code = code; e.text = text || ""; e.detail = detail || ""; return e; }

async function httpError(res){
  let body = ""; try { body = await res.text(); } catch(e) {}
  const low = body.toLowerCase();
  if (res.status === 401 || res.status === 403 || /api[_ ]?key|invalid.*key|permission/.test(low) && res.status === 400) return fail("bad_key", "", body);
  if (res.status === 404 || /model.*not.*found|not supported|does not exist/.test(low)) return fail("bad_model", "", body);
  if (res.status === 429) return fail("rate_limited", "", body);
  if (res.status === 413 || /too long|too many tokens|context length|exceeds/.test(low)) return fail("prompt_too_large", "", body);
  return fail("upstream_error", "", body);
}

// Read a server-sent-events stream, calling onData for each JSON payload
async function readSSE(res, onData, signal){
  const reader = res.body.getReader(), dec = new TextDecoder(); let buf = "";
  while (true) {
    if (signal && signal.aborted) throw fail("cancelled");
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream:true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/,""); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim(); if (!data || data === "[DONE]") continue;
      try { onData(JSON.parse(data)); } catch(e) { if (e && e.code) throw e; }
    }
  }
}

async function streamGemini(cfg, prompt, opt, push){
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:streamGenerateContent?alt=sse`;
  const res = await fetch(url, { method:"POST", signal:opt.signal, headers:{ "Content-Type":"application/json", "x-goog-api-key":cfg.key },
    body:JSON.stringify({ contents:[{ role:"user", parts:[{ text:prompt }] }],
      generationConfig:{ temperature: opt.json ? 0.4 : 0.85, maxOutputTokens:32768, ...(opt.json ? { responseMimeType:"application/json" } : {}) } }) });
  if (!res.ok) throw await httpError(res);
  let finish = "";
  await readSSE(res, d => {
    if (d.promptFeedback && d.promptFeedback.blockReason) throw fail("refused");
    const c = d.candidates && d.candidates[0]; if (!c) return;
    (c.content && c.content.parts || []).forEach(p => { if (p.text && !p.thought) push(p.text); });
    if (c.finishReason) finish = c.finishReason;
  }, opt.signal);
  if (/SAFETY|PROHIBITED|BLOCKLIST|RECITATION/.test(finish)) return { truncated:false, refused:true };
  return { truncated: finish === "MAX_TOKENS" };
}
async function streamOpenAI(cfg, prompt, opt, push){
  const res = await fetch("https://api.openai.com/v1/chat/completions", { method:"POST", signal:opt.signal,
    headers:{ "Content-Type":"application/json", "Authorization":"Bearer " + cfg.key },
    body:JSON.stringify({ model:cfg.model, stream:true, messages:[{ role:"user", content:prompt }],
      ...(opt.json ? { response_format:{ type:"json_object" } } : {}) }) });
  if (!res.ok) throw await httpError(res);
  let finish = "";
  await readSSE(res, d => { const c = d.choices && d.choices[0]; if (!c) return; if (c.delta && c.delta.content) push(c.delta.content); if (c.finish_reason) finish = c.finish_reason; }, opt.signal);
  return { truncated: finish === "length", refused: finish === "content_filter" };
}
async function streamAnthropic(cfg, prompt, opt, push){
  const res = await fetch("https://api.anthropic.com/v1/messages", { method:"POST", signal:opt.signal,
    headers:{ "Content-Type":"application/json", "x-api-key":cfg.key, "anthropic-version":"2023-06-01", "anthropic-dangerous-direct-browser-access":"true" },
    body:JSON.stringify({ model:cfg.model, max_tokens:16000, stream:true, messages:[{ role:"user", content:prompt }] }) });
  if (!res.ok) throw await httpError(res);
  let stop = "";
  await readSSE(res, d => {
    if (d.type === "content_block_delta" && d.delta && d.delta.text) push(d.delta.text);
    else if (d.type === "message_delta" && d.delta) stop = d.delta.stop_reason || stop;
    else if (d.type === "error") throw fail(/overloaded|rate/.test(JSON.stringify(d)) ? "rate_limited" : "upstream_error");
  }, opt.signal);
  return { truncated: stop === "max_tokens", refused: stop === "refusal" };
}
const RUN = { gemini:streamGemini, openai:streamOpenAI, anthropic:streamAnthropic };

// Same shape as before: resolves { text, truncated }; throws { code, text }
export async function sample(prompt, opt = {}){
  const cfg = getAI();
  if (!cfg.key) throw fail("no_key");
  let text = "";
  const push = t => { text += t; if (opt.onText) opt.onText({ text }); };
  try {
    const r = await RUN[cfg.provider](cfg, prompt, opt, push);
    if (r.refused && !text.trim()) throw fail("refused");
    if (!text.trim()) throw fail("empty_completion");
    return { text, truncated: !!r.truncated };
  } catch(e) {
    if (e && e.name === "AbortError") throw fail("cancelled", text);
    if (e && e.code) { e.text = text; throw e; }
    throw fail("upstream_error", text, String(e && e.message || e));
  }
}
export function parseJSON(text){
  let t = String(text || "").trim().replace(/^```(?:json)?\s*/i,"").replace(/```\s*$/,"").trim();
  try { return JSON.parse(t); } catch(e) {}
  const a = t.search(/[[{]/), b = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch(e) {} }
  throw fail("invalid_json");
}
sample.json = async (prompt, opt = {}) => parseJSON((await sample(prompt + "\n\nReply with JSON only, no other text.", { ...opt, json:true })).text);

// Check a key and list models the key can use
export async function testAI(cfg){
  if (cfg.provider === "gemini") {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers:{ "x-goog-api-key":cfg.key } });
    if (!res.ok) throw await httpError(res);
    const d = await res.json();
    return (d.models || []).filter(m => (m.supportedGenerationMethods || []).includes("generateContent") && /gemini/.test(m.name))
      .map(m => m.name.replace(/^models\//,"")).filter(n => !/embedding|aqa|vision|tts|image|live|audio/.test(n));
  }
  if (cfg.provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/models", { headers:{ "Authorization":"Bearer " + cfg.key } });
    if (!res.ok) throw await httpError(res);
    const d = await res.json();
    return (d.data || []).map(m => m.id).filter(n => /^(gpt-|o\d|chatgpt)/.test(n) && !/audio|realtime|transcribe|tts|image|search/.test(n)).sort();
  }
  const res = await fetch("https://api.anthropic.com/v1/models?limit=100", { headers:{ "x-api-key":cfg.key, "anthropic-version":"2023-06-01", "anthropic-dangerous-direct-browser-access":"true" } });
  if (!res.ok) throw await httpError(res);
  const d = await res.json();
  return (d.data || []).map(m => m.id);
}
