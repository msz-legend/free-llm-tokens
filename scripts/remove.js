#!/usr/bin/env node
// remove.js — 从 harness 原生配置移除接入源（确认制；备份先行；可选 purge env）
// 用法：node scripts/remove.js <sourceId> [--harness opencode,codex,claude|all] [--purge-env] [--yes] [--json]
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { loadSources } from './lib/registry.js';
import { pid, envKeyName, CONFIG_PATHS } from './lib/harness.js';
import { ask, readJson, writeJson, STATE_DIR, hasFlag, backupFile } from './lib/util.js';

const human = (m) => { if (!hasFlag('--json')) console.log(m); };
function argStr(name, def = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

async function main() {
  const sourceId = process.argv[2];
  const src = loadSources().find((s) => s.id === sourceId);
  if (!src) { console.error(`[remove] 未知源：${sourceId}`); process.exit(2); }
  const id = pid(sourceId);

  const hi = argStr('--harness', 'all');
  const harnesses = hi === 'all' ? ['opencode', 'codex', 'claude'] : String(hi).split(',').filter(Boolean);

  if (!hasFlag('--yes')) {
    let a;
    try { a = await ask(`确认从 ${harnesses.join('/')} 移除 ${src.name}? (y/N) `); }
    catch { console.error('[remove] 需要交互确认；非交互环境请显式加 --yes'); process.exit(2); }
    if (!/^y(es)?$/i.test(a.trim())) { human('已取消'); process.exit(0); }
  }
  const removed = {};

  if (harnesses.includes('opencode')) {
    const bak = backupFile(CONFIG_PATHS.opencode, 'opencode-remove');
    const cfg = readJson(CONFIG_PATHS.opencode, null);
    if (cfg?.provider?.[id]) {
      delete cfg.provider[id];
      if (typeof cfg.model === 'string' && cfg.model.startsWith(`${id}/`)) delete cfg.model;
      writeJson(CONFIG_PATHS.opencode, cfg);
      removed.opencode = true;
      human(`✅ OpenCode：已移除 ${id}${bak ? `（备份 ${path.basename(bak)}）` : ''}`);
    } else human(`· OpenCode：未接入，跳过`);
  }

  if (harnesses.includes('codex')) {
    const file = CONFIG_PATHS.codex;
    if (fs.existsSync(file)) {
      const bak = backupFile(file, 'codex-remove');
      let text = fs.readFileSync(file, 'utf8');
      const re = new RegExp(`# free-models:begin:${id}\\b[\\s\\S]*?# free-models:end:${id}\\b\\n?`, 'g');
      if (re.test(text)) {
        text = text.replace(re, '');
        // 顶层激活行指向本 provider 的：整行注释保留历史（其它 provider 的激活行不动）
        const actRe = new RegExp(`^\\s*model_provider\\s*=\\s*["']${id}["']?\\s*(#.*)?$`);
        const lines = text.split(/\r?\n/).map((line) => (actRe.test(line) ? `# [free-models removed] ${line.trim()}` : line));
        fs.writeFileSync(file, lines.join('\n'), 'utf8');
        removed.codex = true;
        human(`✅ Codex：已移除 ${id} 段（备份 ${bak ? path.basename(bak) : '无'}；激活行已注释，请重选默认 provider）`);
      } else human(`· Codex：未写入，跳过`);
    } else human(`· Codex：无 config.toml，跳过`);
  }

  if (harnesses.includes('claude')) {
    const cfg = readJson(CONFIG_PATHS.claude, null);
    const env = cfg?.env;
    const connected = readJson(path.join(STATE_DIR, 'connected.json'), { records: [] });
    // 单激活位归属：claude env 由"最后一条带 claude target 的接入记录"拥有
    const lastClaude = [...(connected.records ?? [])].reverse().find((r) => (r.targets ?? []).includes('claude'));
    const ours = lastClaude && lastClaude.sourceId === sourceId;
    if (env?.ANTHROPIC_BASE_URL && ours) {
      const bak = backupFile(CONFIG_PATHS.claude, 'claude-remove');
      delete env.ANTHROPIC_BASE_URL;
      delete env.ANTHROPIC_AUTH_TOKEN;
      delete env.ANTHROPIC_MODEL;
      if (env.ANTHROPIC_API_KEY === '') delete env.ANTHROPIC_API_KEY;
      writeJson(CONFIG_PATHS.claude, cfg);
      removed.claude = true;
      human(`✅ Claude Code：env 占用键已清除（备份 ${bak ? path.basename(bak) : '无'}）`);
    } else if (env?.ANTHROPIC_BASE_URL && !ours) {
      human(`⚠ Claude Code 当前激活的 ${env.ANTHROPIC_BASE_URL} 不属于 connected.json 里记录的 ${sourceId} 接入——不动（可能是你自配的网关）。`);
    } else human(`· Claude Code：无占用，跳过`);
  }

  if (hasFlag('--purge-env')) {
    human(`键值自清提示（用户自行执行）：Windows PowerShell：[Environment]::SetEnvironmentVariable('${envKeyName(sourceId)}', $null, 'User')`);
  }

  const cache = readJson(path.join(STATE_DIR, 'cache.json'), {});
  cache.badges?.[sourceId] && delete cache.badges[sourceId];
  writeJson(path.join(STATE_DIR, 'cache.json'), cache);
  human(`\n✅ 移除完成（${Object.entries(removed).filter(([, v]) => v).map(([k]) => k).join(',') || '无实际写入'}）。探针徽章已清。`);
}

main().catch((e) => { console.error('[remove] fatal:', e?.message ?? e); process.exit(1); });