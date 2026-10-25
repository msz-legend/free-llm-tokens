#!/usr/bin/env node
// connect.js — 选源→事实卡+隐私确认→key 探针→写入 harness 原生配置（Q4/Q7/Q12 设计）
// 用法：node scripts/connect.js <sourceId> [--harness auto|opencode|codex|claude|a,b|all] [--model id]
//        [--key <key>] [--key-stdin] [--yes] [--skip-probe] [--force] [--activate] [--json]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { loadSources, loadRules, gateParams } from './lib/registry.js';
import { supportedProtocolsFor, pid, envKeyName, writeOpencode, writeClaude, writeCodexProvider, codexActivate, persistEnvVar, readClaudeActive } from './lib/harness.js';
import { probeCompletion, probeAnthropic, probeKeyModels, probeToolCall } from './lib/probe.js';
import { ask, readJson, writeJson, STATE_DIR, hasFlag, todayStamp } from './lib/util.js';

const CONNECTED_FILE = path.join(STATE_DIR, 'connected.json');

function human(msg) { if (!hasFlag('--json')) console.log(msg); }
function argStr(name, def = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

async function resolveKey(sourceId) {
  const argvKey = argStr('--key');
  if (argvKey) return { key: argvKey, how: 'arg' };
  const envName = envKeyName(sourceId);
  if (process.env[envName]) return { key: process.env[envName], how: `env:${envName}` };
  if (hasFlag('--key-stdin')) return { key: fs.readFileSync(0, 'utf8').trim(), how: 'stdin' };
  human(`🔑 输入 key 后回车（只写入 harness 原生配置，skill 不建第二份副本库）→ 环境变量名：${envName}`);
  let key;
  try { key = await ask('> '); }
  catch (e) { console.error(`[connect] ${e.message}。示例：node scripts/connect.js ${sourceId} --key <key> --harness …`); process.exit(2); }
  if (!key.trim()) { console.error('[connect] 未收到 key，退出'); process.exit(2); }
  return { key: key.trim(), how: 'prompt' };
}

function eligibleHarnesses(source) {
  const p = supportedProtocolsFor(source);
  const list = [];
  if (p.openai) list.push('opencode');
  if (p.responses) list.push('codex');
  if (p.anthropic) list.push('claude');
  return list;
}

function pickTargets(wanted, sourceId, eligible, say) {
  if (wanted === 'all') return eligible;
  return String(wanted).split(',').filter(Boolean).filter((x) => {
    if (eligible.includes(x)) return true;
    say(`⚠ ${x} 不适用于 ${sourceId}（缺 ${x === 'codex' ? 'Responses' : x === 'claude' ? 'Anthropic' : 'OpenAI'} 端点），跳过`);
    return false;
  });
}

async function main() {
  const sourceId = process.argv[2];
  const src = loadSources().find((s) => s.id === sourceId);
  if (!src) {
    console.error(`[connect] 未知 sourceId：${sourceId}；可用：${loadSources().filter((s) => !s.categories.includes('harness-attached')).map((s) => s.id).join(', ')}`);
    process.exit(2);
  }

  const eligible = eligibleHarnesses(src);
  let wanted = argStr('--harness', 'auto');
  if (wanted === 'auto') wanted = eligible.length === 1 ? eligible[0] : eligible.join(',');
  const targets = pickTargets(wanted, sourceId, eligible, human);
  if (!targets.length) { console.error('[connect] 无可写目标 harness，退出'); process.exit(2); }

  // 隐私确认（每个 provider 首次确认一次，之后不重复）
  const connected = readJson(CONNECTED_FILE, { confirmed: [], records: [] });
  const confirmedBefore = connected.confirmed.includes(sourceId);
  human(`\n【事实卡】${src.name}（${src.categories.join('·')} · ${src.access}）`);
  human(`  注册入口：${src.signup}`);
  for (const c of src.caveats ?? []) human(`  ⚠ ${c}`);
  human(`  ⚠ 隐私：接入后你经此 provider 发送的所有内容（含代码）该厂商可见；免费档普遍附训练/记录条款。`);
  if (!confirmedBefore && !hasFlag('--yes')) {
    let a;
    try { a = await ask('确认接入？(y/N) '); }
    catch { console.error('[connect] 隐私确认需要交互终端；非交互环境请显式加 --yes'); process.exit(2); }
    if (!/^y(es)?$/i.test(a.trim())) { human('已取消'); process.exit(0); }
  }

  const { key } = await resolveKey(sourceId);
  const p = supportedProtocolsFor(src);
  const bases = {
    opencode: p.openai,
    codex: p.responses,
    claude: p.anthropic,
  };

  // 探针（先探后账；--skip-probe 跳过）
  let model = argStr('--model') ?? src.models?.ids?.[0] ?? null;
  const probe = { keyModels: null, completion: null, toolcall: null, anthropic: null };
  if (!hasFlag('--skip-probe')) {
    human('\n🔍 探针中…');
    if (targets.includes('claude')) {
      const pa = await probeAnthropic(bases.claude, key, model ?? 'claude-3-5-sonnet-latest', { style: 'bearer' });
      probe.anthropic = pa;
      human(`  anthropic /v1/messages → ${pa.ok ? `OK ${pa.ms}ms` : `FAIL ${pa.status}${pa.err ? '：' + pa.err : ''}`}`);
      if (!pa.ok && src.id === 'bigmodel') human('  → 智谱免费 Flash 走 Anthropic 端点未经官方背书；失败属已知免责路径，建议主路径用 OpenCode(openai)。');
      if (!pa.ok && targets.length === 1 && targets[0] === 'claude' && !hasFlag('--force')) {
        console.error('[connect] Anthropic 探针失败，未写入配置（可用 --force 强制）。'); process.exit(1);
      }
    }
    if (targets.some((t) => t !== 'claude') && bases.opencode) {
      const km = await probeKeyModels(p.openai, key);
      probe.keyModels = { ok: km.ok, status: km.status, count: km.count };
      human(`  GET /models → ${km.ok ? `OK（${km.count} 个模型）` : `FAIL ${km.status}`}`);
      if (km.ok && !model) model = km.ids.find((i) => /flash|mini|small|free/i.test(i)) ?? km.ids[0] ?? null;
      if (!model && (src.models?.strategy === 'live')) model = 'openrouter/free';
      if (probe.keyModels.ok && !probe.keyModels.count && !hasFlag('--force')) { console.error('[connect] 目录空（key 可能无效或无免费模型），退出'); process.exit(1); }
      if (model && bases.opencode) {
        const pc = await probeCompletion(bases.opencode, key, model);
        probe.completion = { ok: pc.ok, status: pc.status, ms: pc.ms, verdict: (pc.text ?? pc.err ?? '').slice(0, 60) };
        human(`  chat completion（${model}） → ${pc.ok ? `OK ${pc.ms}ms · ${JSON.stringify(pc.text).slice(0, 60)}` : `FAIL ${pc.status}${pc.err ? '：' + pc.err : ''}`}`);
        if (!pc.ok && !hasFlag('--force')) { console.error('[connect] 模型探针失败，未写入配置（--force 强制 / --skip-probe 跳过 / --model 换模型）'); process.exit(1); }
        const pt = await probeToolCall(bases.opencode, key, model);
        probe.toolcall = { ok: pt.ok, verdict: pt.verdict, ms: pt.ms };
        human(`  tool-call → ${pt.verdict}（${pt.ms}ms）`);
      }
    }
  }

  // 逐 harness 写入
  const results = { sourceId, providerId: pid(sourceId), targets: {}, envName: envKeyName(sourceId) };
  for (const h of targets) {
    if (h === 'opencode') {
      const models = {};
      if (hasFlag('--model')) models[model] = { name: model };
      else if (src.models?.strategy === 'live') {
        const cache = readJson(path.join(STATE_DIR, 'cache.json'), {});
        const gp = gateParams(loadRules());
        for (const m of (cache.openrouter?.free ?? []).filter((x) => (x.ctx ?? 0) >= gp.ctxMin && x.toolcall !== false).slice(0, 12)) models[m.id] = { name: m.name };
        models['openrouter/free'] ??= { name: 'Free Models Router（兑底）' };
      } else for (const id of src.models?.ids ?? []) models[id] = { name: id };
      const r = writeOpencode(src, { base: bases.opencode, key, models, meta: { connectedAt: new Date().toISOString(), sourceId } });
      results.targets.opencode = { ...r, models: Object.keys(models) };
      human(`\n✅ OpenCode 已写入 ${r.file}${r.backup ? `（备份 ${path.basename(r.backup)}）` : ''}，模型 ${Object.keys(models).length} 个`);
    } else if (h === 'claude') {
      const active = readClaudeActive();
      if (active.has && active.base) human(`⚠️ 覆写警告：Claude Code 已激活 ${active.base}（单激活位）——本次写入将替换它；原值已随备份留存可回滚。`);
      const r = writeClaude(src, { base: bases.claude, key, model: model ?? src.models?.ids?.[0] ?? null });
      results.targets.claude = { ...r };
      human(`\n✅ Claude Code env 块已写入 ${r.file}${r.backup ? `（备份 ${path.basename(r.backup)}）` : ''}${model ? `（ANTHROPIC_MODEL=${model}）` : ''}`);
    } else if (h === 'codex') {
      const r = writeCodexProvider(src.id, { name: `free-models · ${src.name}`, base: bases.codex, wireApi: 'responses', envKey: results.envName });
      const ph = persistEnvVar(results.envName, key);
      results.targets.codex = { ...r, envName: results.envName, envPersisted: ph };
      human(`\n✅ Codex provider 已写入 ${r.file}（wire_api=responses；base=${bases.codex}）`);
      human(`   key → ${results.envName}（${ph}）`);
      if (hasFlag('--activate')) { const a = codexActivate(src.id, model ?? ''); results.targets.codex.activated = true; human(`   已激活为默认 provider/model=${model ?? ''}（备份 ${path.basename(a.backup)}）`); }
      else human('   尚未激活：接 switch 或 connect 附加 --activate');
    }
  }

  // 记账（confirmed 去重 + records 追加）
  const fresh = readJson(CONNECTED_FILE, { confirmed: [], records: [] });
  if (!fresh.confirmed.includes(sourceId)) fresh.confirmed.push(sourceId);
  fresh.records.push({ sourceId, providerId: results.providerId, targets, at: new Date().toISOString(), probe, forceOrSkip: hasFlag('--skip-probe') ? 'skip-probe' : 'probed' });
  writeJson(CONNECTED_FILE, fresh);

  human(`\n下一步：node scripts/test.js ${sourceId}（五段全链路）· node scripts/status.js（三配置体检）`);
  if (hasFlag('--json')) console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => { console.error('[connect] fatal:', e?.message ?? e, e?.cause?.code ? `(${e.cause.code})` : ''); process.exit(1); });
