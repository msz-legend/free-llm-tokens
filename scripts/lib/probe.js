// lib/probe.js — 五段全链路探针（key→目录→completion→tool-call→限速抽样）
// 规则（rules.json）：非流式、~10 token 小请求、每源 <2K tokens 预算
import { loadRules } from './registry.js';

async function jfetch(url, { key, headers, body, timeoutMs = 20000 }) {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(headers ?? {}), ...(key && !headers?.authorization && !headers?.['x-api-key'] ? { authorization: `Bearer ${key}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* 非 JSON 错误体 */ }
  return { status: res.status, json, text: text.slice(0, 400) };
}

/** 段1+2：key 有效性 + 模型目录（openai 兼容 GET {base}/models） */
export async function probeKeyModels(base, key) {
  const { status, json } = await jfetch(`${base.replace(/\/$/, '')}/models`, { key });
  const ids = Array.isArray(json?.data) ? json.data.map((m) => m?.id ?? m?.model).filter(Boolean) : [];
  return { ok: status === 200, status, count: ids.length, ids: ids.slice(0, 60) };
}

/** 段3：小 completion（openai chat） */
export async function probeCompletion(base, key, model, { maxTokens = 10, prompt } = {}) {
  const r = loadRules();
  const body = { model, messages: [{ role: 'user', content: prompt ?? r.probe.completionPrompt }], max_tokens: maxTokens, stream: false };
  const t0 = Date.now();
  const { status, json } = await jfetch(`${base.replace(/\/$/, '')}/chat/completions`, { key, body });
  return { ok: status === 200, status, ms: Date.now() - t0, text: json?.choices?.[0]?.message?.content ?? null, err: status !== 200 ? json?.error?.message ?? null : null };
}

/** 段4：tool-call 回环（生产门槛核心验证；无 tool_calls 返回也记 'refused'，非失败——有的免费模型选择不用工具） */
export async function probeToolCall(base, key, model, { headers } = {}) {
  const r = loadRules();
  const tc = r.probe.toolcallSchema;
  const body = {
    model,
    messages: [{ role: 'user', content: tc.userAsk }],
    tools: [{ type: 'function', function: { name: tc.name, description: tc.description, parameters: tc.parameters } }],
    tool_choice: 'auto',
    stream: false,
    max_tokens: 300,
  };
  const t0 = Date.now();
  const { status, json } = await jfetch(`${base.replace(/\/$/, '')}/chat/completions`, { key, body, headers });
  const msg = json?.choices?.[0]?.message;
  return {
    ok: status === 200, status, ms: Date.now() - t0,
    toolCalls: msg?.tool_calls?.length ?? 0,
    verdict: msg?.tool_calls?.length ? 'tool-call ok' : status === 200 ? 'refused (未走 tool)' : `fail: ${json?.error?.message ?? status}`,
  };
}

/** Anthropic /v1/messages 探针（Claude Code 直连路径；key 走 x-api-key 或 Bearer，按源决定） */
export async function probeAnthropic(base, key, model, { style = 'bearer' } = {}) {
  const headers = style === 'bearer'
    ? { authorization: `Bearer ${key}`, 'anthropic-version': '2023-06-01' }
    : { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
  const t0 = Date.now();
  const { status, json } = await jfetch(`${base.replace(/\/$/, '')}/v1/messages`, {
    headers, body: { model, max_tokens: 16, messages: [{ role: 'user', content: 'Reply with exactly one word: ping' }] },
  });
  return { ok: status === 200 && Array.isArray(json?.content), status, ms: Date.now() - t0, text: json?.content?.[0]?.text ?? null, err: status !== 200 ? json?.error?.message ?? null : null };
}

/** 段5：限速抽样（window 内连发 completion，统计 429） */
export async function sampleRate(base, key, model, { requests = 5, windowMs = 10000 } = {}) {
  const t0 = Date.now();
  const results = [];
  for (let i = 0; i < requests && Date.now() - t0 < windowMs; i++) {
    const r = await probeCompletion(base, key, model);
    results.push(r.ok ? 200 : r.status);
    await new Promise((s) => setTimeout(s, Math.max(0, windowMs / requests / 2)));
  }
  const limited = results.filter((s) => s === 429).length;
  return { requests: results.length, limited, statuses: results };
}
