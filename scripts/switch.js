#!/usr/bin/env node
// switch.js — 在已接入的免费源间切换“当前激活”（OpenCode 顶层 model / Codex 顶层 model+model_provider）
// 用法：node scripts/switch.js <sourceId> [--model id] [--harness opencode,codex] [--json]
import path from 'node:path';
import process from 'node:process';
import { loadSources } from './lib/registry.js';
import { pid, opencodeDefaultModel, codexActivate, readCodexBlocks, CONFIG_PATHS } from './lib/harness.js';
import { readJson, writeJson, STATE_DIR, hasFlag, fatal, endWith } from './lib/util.js';

const human = (m) => { if (!hasFlag('--json')) console.log(m); };
function argStr(name, def = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

async function main() {
  const sourceId = process.argv[2];
  const src = loadSources().find((s) => s.id === sourceId);
  if (!src) { throw fatal(`未知源：${sourceId}`, 2); }
  const hi = argStr('--harness', 'opencode,codex');
  const model = argStr('--model') ?? src.models?.ids?.[0] ?? null;
  const results = {};

  if (hi.includes('opencode')) {
    const oc = readJson(CONFIG_PATHS.opencode, {});
    if (!oc.provider?.[pid(sourceId)]) { human(`⚠ OpenCode 未接入 ${sourceId}（先 connect --harness opencode）`); }
    else if (!model) { human('⚠ 未指定 --model 且该源无静态 model id；OpenCode 内 /models 可直接选'); }
    else { const r = opencodeDefaultModel(pid(sourceId), model); results.opencode = r; human(`✅ OpenCode 默认模型 → ${pid(sourceId)}/${model}（备份 ${r.backup ? path.basename(r.backup) : '无'}）`); }
  }
  if (hi.includes('codex')) {
    const blocks = readCodexBlocks();
    if (!blocks.includes(pid(sourceId))) { human(`⚠ Codex 未写入 ${sourceId}（先 connect --harness codex，需源有 Responses 端点）`); }
    else if (!model) { human('⚠ 未指定 --model（Codex 需显式 model id）'); }
    else { const r = codexActivate(sourceId, model); results.codex = r; human(`✅ Codex 激活 → model="${model}" model_provider="${pid(sourceId)}"（备份 ${path.basename(r.backup)}）`); }
  }
  if (hi.includes('claude')) {
    human('⚠ Claude Code 的 env 块为单激活位：切换=用另一源的 key 重跑 `connect <id> --harness claude`（原 key 被替换前自动备份）。');
  }

  const cache = readJson(path.join(STATE_DIR, 'cache.json'), {});
  cache.active ??= {};
  cache.active[`${Date.now()}`] = { sourceId, model, harness: hi, at: new Date().toISOString() };
  if (Object.keys(cache.active).length > 50) delete Object.keys(cache.active)[0];
  writeJson(path.join(STATE_DIR, 'cache.json'), cache);

  if (hasFlag('--json')) console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => endWith(e, '[switch]'));
