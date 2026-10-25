#!/usr/bin/env node
// status.js — 全局体检：已接入源 × 三 harness 配置同步 × 探针徽章/死源候选 × shim/env 检测
// 用法：node scripts/status.js [--json]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { loadSources, loadRules } from './lib/registry.js';
import { CONFIG_PATHS, scanConnected, envKeyName, readClaudeActive } from './lib/harness.js';
import { readJson, STATE_DIR, hasFlag, todayStamp } from './lib/util.js';

const human = (m) => { if (!hasFlag('--json')) console.log(m); };

function which(cmd) {
  try { execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'pipe' }); return true; } catch { return false; }
}

function detectShims() {
  const shims = {};
  shims['claude-code-router'] = which('ccr') || fs.existsSync(path.join(process.env.USERPROFILE ?? '', '.claude-code-router')) ? 'detected' : 'not-found';
  shims['litellm'] = which('litellm') ? 'detected' : 'not-found';
  shims['cc-switch'] = fs.existsSync(path.join(process.env.APPDATA ?? process.env.LOCALAPPDATA ?? '', 'cc-switch')) ? 'detected' : 'not-found';
  return shims;
}

function main() {
  const sources = loadSources();
  const cache = readJson(path.join(STATE_DIR, 'cache.json'), {});
  const connected = scanConnected();
  const shims = detectShims();
  const rules = loadRules();

  const rows = [];
  for (const s of sources.filter((x) => !x.categories.includes('harness-attached'))) {
    const oc = connected.opencode.find((x) => x.id === `free-${s.id}`);
    const cd = connected.codex.find((x) => x.id === `free-${s.id}`);
    const b = cache.badges?.[s.id];
    const prot = [];
    if (s.endpoints?.openai) prot.push('oc');
    if (s.endpoints?.responses) prot.push('cx');
    if (s.endpoints?.anthropic) prot.push('cc');
    rows.push({
      id: s.id,
      cfg: { opencode: oc ? `${oc.models.length}模型` : null, codex: cd ? '已写入' : null, claude: (readClaudeActive().base && (JSON.stringify(s.endpoints?.anthropic ?? '').includes(readClaudeActive().base ?? '\\u0000') || readClaudeActive().base?.includes(s.id))) ? '激活' : null },
      probe: b ? `${b.verdict}@${String(b.at).slice(0, 10)}` : '未探针',
      protocols: prot.join('/'),
    });
  }

  const sync = {
    opencodeCount: connected.opencode.length,
    codexCount: connected.codex.length,
    claudeActive: connected.claude,
    deadCandidates: cache.deadCandidates ?? [],
  };

  human(`# free-llm-tokens status — ${todayStamp()}`);
  human(`\n已接入：OpenCode ${sync.opencodeCount} 个 · Codex ${sync.codexCount} 个 · Claude Code 激活=${connected.claude.has ? connected.claude.base : '无'}`);
  human(`\n| 源 | 协议面 | 已写入 | 最近探针 |`);
  human(`|---|---|---|---|`);
  for (const r of rows) human(`| ${r.id} | ${r.protocols} | ${Object.entries(r.cfg).filter(([, v]) => v).map(([k, v]) => `${k}:${v}`).join('・') || '—'} | ${r.probe} |`);
  human(`\n死源候选：${sync.deadCandidates.join(', ') || '无'}`);
  human(`shim 检测：` + Object.entries(shims).map(([k, v]) => `${k}=${v}`).join(' · '));
  human(`门槛：ctx≥${rules.gates?.ctxMin ?? 128000} · rpm≥${rules.gates?.rpmMin ?? 15} · rpd≥${rules.gates?.rpdMin ?? 50} · tool-call 必须`);
  human(`\n配置文件：\n  ${CONFIG_PATHS.opencode}\n  ${CONFIG_PATHS.codex}\n  ${CONFIG_PATHS.claude}`);
  if (hasFlag('--json')) console.log(JSON.stringify({ rows, sync, shims }, null, 2));
}

main();
