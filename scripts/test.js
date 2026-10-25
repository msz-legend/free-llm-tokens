#!/usr/bin/env node
// test.js — 五段全链路探针（key→目录→completion→tool-call→限速抽样）+ 徽章缓存 + 死源计数
// 用法：node scripts/test.js <sourceId|all> [--deep] [--json]
import path from 'node:path';
import fs from 'node:fs';
import process from 'node:process';
import { loadSources, loadRules, gateParams } from './lib/registry.js';
import { CONFIG_PATHS, supportedProtocolsFor, envKeyName } from './lib/harness.js';
import { probeCompletion, probeAnthropic, probeKeyModels, probeToolCall, sampleRate } from './lib/probe.js';
import { readJson, writeJson, STATE_DIR, STATE, hasFlag, todayStamp, fatal, endWith } from './lib/util.js';

function argStr(name, def = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const human = (m) => { if (!hasFlag('--json')) console.log(m); };

/** key 解析顺序：keyless→null；env → opencode.json → claude settings.json */
function resolveKey(sourceId) {
  const src = loadSources().find((s) => s.id === sourceId);
  if (src?.categories?.includes('keyless')) return { key: null, from: 'keyless（匿名，无 Authorization 头）' };
  const envName = envKeyName(sourceId);
  if (process.env[envName]) return { key: process.env[envName], from: `env:${envName}` };
  const oc = readJson(CONFIG_PATHS.opencode, {});
  const p = oc.provider?.[`free-${sourceId}`]?.options?.apiKey;
  if (p) return { key: p, from: 'opencode.json' };
  const cs = readJson(CONFIG_PATHS.claude, null);
  if (cs?.env?.ANTHROPIC_AUTH_TOKEN && String(cs.env.ANTHROPIC_BASE_URL ?? '').length > 0) return { key: cs.env.ANTHROPIC_AUTH_TOKEN, from: 'claude settings' };
  return { key: null, from: null };
}

function pickFree(ids = []) {
  return ids.find((i) => /:free$/i.test(i) && !/^kilo-auto\//.test(i)) ?? ids.find((i) => /flash|mini|small/i.test(i)) ?? ids[0] ?? null;
}
function pickModel(src, kmIds) {
  if (process.argv.includes('--model')) return argStr('--model');
  return src.models?.ids?.[0] ?? pickFree(kmIds ?? []);
}

async function testSource(src, connectedBases, gp) {
  const { key, from } = resolveKey(src.id);
  const p = supportedProtocolsFor(src);
  const r = { sourceId: src.id, keyFrom: from, at: new Date().toISOString() };
  const keyless = src.categories?.includes('keyless');
  if (!key && !keyless) { r.verdict = 'no-key'; return r; }

  const baseO = p.openai;
  const baseA = p.anthropic;
  const model = pickModel(src, null);
  const steps = {};

  if (baseO) {
    const km = await probeKeyModels(baseO, key);
    steps.key = km.ok ? 'ok' : `fail(${km.status})`;
    if (km.ok && !model) r.model = pickFree(km.ids) ?? null; else r.model = model;
    if (r.model) {
      const c = await probeCompletion(baseO, key, r.model);
      steps.completion = c.ok ? `ok(${c.ms}ms)` : `fail(${c.status}${c.err ? ':' + String(c.err).slice(0, 60) : ''})`;
      const t = await probeToolCall(baseO, key, r.model);
      steps.toolcall = t.verdict;
      if (hasFlag('--deep') && c.ok) {
        const rs = await sampleRate(baseO, key, r.model, loadRules().probe.rateSampleWindow);
        steps.rate = rs.requests ? `${rs.limited}/${rs.requests} 429` : 'skipped';
      }
    }
    r.modelsCount = km.count;
  }
  if (baseA && (src.id === 'openrouter' || src.id === 'bigmodel' || src.id === 'zai' || src.id === 'modelscope' || src.id === 'kilo')) {
    const pa = await probeAnthropic(baseA, key, r.model ?? model ?? 'claude-3-5-sonnet-latest');
    steps.anthropic = pa.ok ? `ok(${pa.ms}ms)` : `fail(${pa.status}${pa.err ? ':' + String(pa.err).slice(0, 60) : ''})`;
  }
  r.steps = steps;
  r.verdict = Object.values(steps).every((s) => !String(s).startsWith('fail')) ? 'ok' : Object.values(steps).some((s) => String(s).startsWith('ok')) ? 'partial' : 'fail';
  return r;
}

async function main() {
  const target = process.argv[2] ?? 'all';
  const sources = loadSources().filter((s) => !s.categories.includes('harness-attached'));
  const list = target === 'all' ? sources : sources.filter((s) => s.id === target);
  if (!list.length) { throw fatal(`无匹配源：${target}`, 2); }

  const cache = readJson(STATE.cacheJson, {});
  const gp = gateParams(loadRules());
  const outcomes = [];
  for (const src of list) {
    human(`\n▶ ${src.id}（${src.name}）`);
    const r = await testSource(src, null, gp);
    outcomes.push(r);
    human(`  ${r.verdict === 'ok' ? '✅' : r.verdict === 'partial' ? '△' : '✗'} ${r.verdict === 'no-key' ? `未发现 key：先 connect 或 export ${envKeyName(src.id)}` : Object.entries(r.steps ?? {}).map(([k, v]) => `${k}=${v}`).join(' · ') || r.verdict}`);
    cache.badges ??= {};
    cache.badges[src.id] = { verdict: r.verdict, steps: r.steps ?? {}, at: r.at, model: r.model ?? null };
    cache.probeHistory ??= {};
    cache.probeHistory[src.id] ??= [];
    cache.probeHistory[src.id].push({ at: r.at, verdict: r.verdict });
    if (cache.probeHistory[src.id].length > 30) cache.probeHistory[src.id] = cache.probeHistory[src.id].slice(-30);
  }
  // 死源候选：连续 deadStreak 失败
  const deadStreak = loadRules().flap?.deadStreak ?? 3;
  cache.deadCandidates = Object.entries(cache.probeHistory ?? {})
    .filter(([, h]) => h.slice(-deadStreak).length >= deadStreak && h.slice(-deadStreak).every((x) => x.verdict === 'fail'))
    .map(([id]) => id);
  writeJson(STATE.cacheJson, cache);

  human(`\n徽章已写入 ${path.basename(STATE.cacheJson)}${cache.deadCandidates.length ? `；死源候选：${cache.deadCandidates.join(', ')}（refresh 报告里经确认清理）` : ''}`);
  if (hasFlag('--json')) console.log(JSON.stringify(outcomes, null, 2));
}

main().catch((e) => endWith(e, '[test]'));
