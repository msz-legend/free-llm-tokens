#!/usr/bin/env node
// refresh.js — 抓当日上游 feed → 合并本地缓存(L3) → 按生产门槛筛 → 当日 diff 报告
// 用法：node scripts/refresh.js [--json] [--no-openrouter] [--no-mnfst] [--quick]
// 代理：PowerShell 先 set NODE_USE_ENV_PROXY=1 与 $env:HTTPS_PROXY（详见 docs）
import path from 'node:path';
import { ensureStatedir, readJson, writeJson, STATE, STATE_DIR, todayStamp } from './lib/util.js';
import { loadSources, loadRules, loadUpstream, gateParams } from './lib/registry.js';
import { fetchJson } from './lib/feed.js';

const WRITER_RULES = ((r) => r.openrouter?.freeRouterModel ?? 'openrouter/free')(loadRules());

/** L1 ↔ mnfst 名称启发式匹配表 */
const MNFST_MATCH = {
  openrouter: [/openrouter/i], bigmodel: [/bigmodel|zhipu|z\.ai/i], zai: [/z\.?ai(?!m)/i],
  groq: [/groq/i], gemini: [/google|gemini/i], siliconflow: [/siliconflow|硅基/i],
  modelscope: [/modelscope|魔搭/i], ovh: [/ovh/i], kilo: [/kilo/i], mistral: [/mistral/i], nvidia: [/nvidia|nim/i],
};

function mnfstScalars(node, out = {}) { // 防御式字段提取（上游 schema 变更不崩）
  const val = (k) => node?.[k];
  out.baseUrl = out.baseUrl ?? val('baseUrl') ?? val('base_url') ?? val('url');
  const rl = val('rateLimit') ?? val('rate_limit');
  if (rl) Object.assign(out, { rpm: rl.rpm ?? out.rpm, rpd: rl.rpd ?? out.rpd, tpm: rl.tpm ?? out.tpm });
  return out;
}

async function fetchOpenRouter({ timeoutMs, retries }) {
  const j = await fetchJson('https://openrouter.ai/api/v1/models', { timeoutMs, retries });
  const all = Array.isArray(j?.data) ? j.data : [];
  const free = all
    .filter((m) => String(m.id ?? '').endsWith(':free') || Number(m?.pricing?.prompt ?? 1) === 0)
    .map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
      ctx: m.context_length ?? null,
      toolcall: Array.isArray(m.supported_parameters) ? m.supported_parameters.includes('tools') : null,
      upstreamFree: true,
    }));
  return { fetchedAt: new Date().toISOString(), total: all.length, free, hasWanted: free.some((f) => f.id === WRITER_RULES) };
}

async function fetchMnfst({ timeoutMs, retries }) {
  const j = await fetchJson('https://raw.githubusercontent.com/mnfst/awesome-free-llm-apis/main/data.json', { timeoutMs, retries });
  const arr = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : Array.isArray(j?.providers) ? j.providers : [];
  return { fetchedAt: j?.lastUpdated ?? new Date().toISOString(), count: arr.length, raw: arr.slice(0, 400), hasArray: arr.length > 0 };
}

/** 生产门槛评估：传入模型本体+源级参数 → {pass, reasons} */
function evalGate(model, src, gp) {
  const reasons = [];
  const num = (v) => (typeof v === 'number' ? v : null);
  const ctx = num(model.ctx);
  if (ctx === null) reasons.push('ctx:per-model 待探针'); else if (ctx < gp.ctxMin) reasons.push(`ctx ${ctx}<${gp.ctxMin}`);
  const rpm = num(src.gates?.rpm);
  if (rpm !== null && rpm < gp.rpmMin) reasons.push(`rpm ${rpm}<${gp.rpmMin}`);
  const rpd = num(src.gates?.rpd);
  if (rpd !== null && rpd < gp.rpdMin) reasons.push(`rpd ${rpd}<${gp.rpdMin}`);
  if (gp.toolcallRequired && model.toolcall === false) reasons.push('无 tool-call');
  const hardFail = reasons.filter((r) => !/(per-model|待探针|unverified)/.test(r));
  return { pass: hardFail.length === 0, reasons, cond: reasons.length > hardFail.length };
}

async function main() {
  ensureStatedir();
  const json = process.argv.includes('--json');
  const doOR = !process.argv.includes('--no-openrouter');
  const doMF = !process.argv.includes('--no-mnfst');
  const prev = readJson(STATE.cacheJson, { sources: {}, summaries: [] });
  const rules = loadRules();
  const gp = gateParams(rules);
  const feedsCfg = rules.feeds ?? { concurrency: 3, timeoutMs: 10000, retries: 1 };
  const sources = loadSources();
  const results = { date: todayStamp(), feeds: {}, additions: [], removals: [], notes: [] };

  // 并发抓取
  const jobs = [];
  if (doOR) jobs.push(["openrouter-live", () => fetchOpenRouter(feedsCfg)]);
  if (doMF) jobs.push(["mnfst-data", () => fetchMnfst(feedsCfg)]);
  await Promise.allSettled(jobs.map(async ([id, fn]) => {
    results.feeds[id] = { ok: true, ...(await fn()) };
  }));
  for (const [id] of jobs) if (!results.feeds[id]) results.feeds[id] = { ok: false, err: '未完成（网络/超时）' };

  // 合并 L2 → L3
  const cache = { ...prev, sources: { ...prev.sources }, summaries: prev.summaries ?? [] };
  const or = results.feeds['openrouter-live'];
  if (or?.ok) {
    const prevIds = (prev.sources?.openrouter?.freeIds ?? prev.openrouter?.freeIds ?? []).map((x) => x.id ?? x);
    const newIds = or.free.map((m) => m.id);
    results.additions = newIds.filter((id) => !prevIds.includes(id)).slice(0, 40);
    results.removals = prevIds.filter((id) => !newIds.includes(id)).slice(0, 40);
    cache.openrouter = { fetchedAt: or.fetchedAt, free: or.free, total: or.total };
  }
  const mf = results.feeds['mnfst-data'];
  if (mf?.ok && mf.hasArray) {
    cache.mnfst = { fetchedAt: mf.fetchedAt, count: mf.count };
    // mnfst 限速补强 L1 未确认项
    for (const [sid, patterns] of Object.entries(MNFST_MATCH)) {
      const hit = mf.raw.find((e) => patterns.some((p) => p.test(String(e?.name ?? e?.id ?? e?.title ?? ''))));
      if (!hit) continue;
      const sc = mnfstScalars(hit);
      const src = cache.sources?.[sid] ?? {};
      cache.sources[sid] = { ...src, mnfst: sc, mnfstFetchedAt: mf.fetchedAt };
      if (sc.rpm || sc.rpd) results.notes.push(`${sid}: mnfst 限速 rpm=${sc.rpm ?? '?'} rpd=${sc.rpd ?? '?'}`);
    }
  }

  // 门槛筛选 + 报告
  const gp2 = gp;
  const reportModels = [];
  let countPass = 0, countCond = 0, countFail = 0;
  for (const src of sources) {
    if (src.categories?.includes('harness-attached')) { results.notes.push(`${src.id}: 限 OpenCode 客户端使用，不参与通用接入清单`); continue; }
    const m0 = src.models?.strategy === 'live' ? (or?.ok ? or.free : [{ id: 'openrouter/free', ctx: null, toolcall: null }]) : null;
    let models = m0;
    if (!models) {
      models = (src.models?.ids ?? []).map((id) => ({ id, ctx: null, toolcall: null }));
      if (!models.length) models = [{ id: `(dynamic: 拉目录/探针后补充 — ${String(src.models?.note ?? '').slice(0, 60)})`, ctx: null, toolcall: null }];
    }
    for (const m of models) {
      const g = evalGate(m, src, gp2);
      g.pass ? countPass++ : g.cond ? countCond++ : countFail++;
      if (g.pass || g.cond) reportModels.push({ src: src.id, model: m.id, ctx: m.ctx, gate: g });
    }
  }

  cache.summaries.push({ date: results.date, pass: countPass, cond: countCond, fail: countFail, feeds: Object.fromEntries(Object.entries(results.feeds).map(([k, v]) => [k, v.ok])) });
  if (cache.summaries.length > 90) cache.summaries = cache.summaries.slice(-90);
  writeJson(STATE.cacheJson, cache);

  // 写当日报告
  const rptFile = path.join(STATE.reportsDir, `${results.date}.md`);
  const lines = [
    `# free-models 日报 ${results.date}`, '',
    `feeds：openrouter ${or?.ok ? `OK（${or.free.length} free / ${or.total}）` : 'FAIL'}・mnfst ${mf?.ok ? `OK（${mf.count}，快照 ${mf.fetchedAt}）` : 'FAIL（保持 L1 策展）'}`, '',
    `门槛筛选（pass/global${countPass}・条件通过${countCond}・被筛${countFail}）`, '',
    '## 通过/条件通过', '',
    ...reportModels.slice(0, 120).map((r) => `- ${r.src} / ${r.model}` + (r.gate.cond ? `　△ ${r.gate.reasons.join('; ')}` : '')),
    '', '## 模型集变化', '',
    results.additions.length + results.removals.length === 0
      ? '（与上次无差异）'
      : [...results.additions.map((x) => `- +${x}`), ...results.removals.map((x) => `- −${x}`)].join('\n'),
    '', '## 备注', '', ...(results.notes.length ? results.notes.map((n) => `- ${n}`) : ['- 无']),
  ];
  const fs = await import('node:fs');
  fs.mkdirSync(STATE.reportsDir, { recursive: true });
  // Windows 记事本/老 PowerShell 友好：UTF-8 BOM
  fs.writeFileSync(rptFile, '\ufeff' + lines.join('\n') + '\n', 'utf8');

  if (json) {
    console.log(JSON.stringify({ date: results.date, feeds: results.feeds, pass: countPass, cond: countCond, fail: countFail, report: rptFile }, null, 2));
  } else {
    console.log(`✅ refresh 完成 — 报告：${rptFile}`);
    console.log(`   通过 ${countPass}・条件通过 ${countCond}・被筛 ${countFail}｜新增模型 ${results.additions.length}・下架 ${results.removals.length}`);
    if (!or?.ok) console.log('⚠ openrouter feed 未抓到：国际源可能需代理（NODE_USE_ENV_PROXY=1 + HTTPS_PROXY）');
  }
}

main().catch((e) => { console.error('[refresh] fatal:', e.message); process.exit(1); });
