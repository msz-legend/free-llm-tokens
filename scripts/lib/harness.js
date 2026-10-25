// lib/harness.js — OpenCode / Codex / Claude Code 三家 harness 的原生配置读写
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { HOME, backupFile, readJson, writeJson } from './util.js';

export const CONFIG_PATHS = {
  opencode: path.join(HOME, '.config', 'opencode', 'opencode.json'),
  codex: path.join(HOME, '.codex', 'config.toml'),
  claude: path.join(HOME, '.claude', 'settings.json'),
};

export function pid(sourceId) { return `free-${sourceId}`; } // provider id 统一前缀
export function envKeyName(sourceId) { return `FREE_MODELS_${String(sourceId).toUpperCase().replace(/[^A-Z0-9]/g, '_')}_KEY`; }

export function detectHarnesses() {
  return Object.entries(CONFIG_PATHS).filter(([, f]) => fs.existsSync(f)).map(([id]) => id);
}

export function supportedProtocolsFor(source) {
  const e = source.endpoints ?? {};
  return {
    openai: typeof e.openai === 'string' ? e.openai : null,
    responses: typeof e.responses === 'string' ? e.responses : null,
    anthropic: typeof e.anthropic === 'string' ? e.anthropic : e.anthropic?.base ?? null,
    anthropicNote: e.anthropic?.note ?? null,
  };
}

/* ---------- OpenCode ---------- */

export function writeOpencode(source, { base, key, models, meta }) {
  const file = CONFIG_PATHS.opencode;
  const bak = backupFile(file, 'opencode');
  const cfg = readJson(file, {});
  cfg.provider = cfg.provider ?? {};
  cfg.provider[pid(source.id)] = {
    npm: '@ai-sdk/openai-compatible',
    name: `free-models · ${source.name}`,
    options: { baseURL: base, ...(key ? { apiKey: key } : {}) },
    ...(models && Object.keys(models).length ? { models } : {}),
    ...(meta ? { _free_models_meta: meta } : {}),
  };
  writeJson(file, cfg);
  return { file, backup: bak, providerId: pid(source.id) };
}

export function opencodeDefaultModel(providerId, modelId) {
  const file = CONFIG_PATHS.opencode;
  const bak = backupFile(file, 'opencode-switch');
  const cfg = readJson(file, {});
  cfg.model = `${providerId}/${modelId}`;
  writeJson(file, cfg);
  return { file, backup: bak };
}

/* ---------- Claude Code ---------- */

// 占用且仅占用这三个 env 键（Q12 “只动自己的地盘”）
export const CLAUDE_ENV_KEYS = ['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_MODEL'];

export function readClaudeActive() {
  const cfg = readJson(CONFIG_PATHS.claude, {});
  const env = cfg.env ?? {};
  return { base: env.ANTHROPIC_BASE_URL ?? null, model: env.ANTHROPIC_MODEL ?? null, has: Boolean(env.ANTHROPIC_BASE_URL) };
}

export function writeClaude(source, { base, key, model, headerStyle }) {
  const file = CONFIG_PATHS.claude;
  const bak = backupFile(file, 'claude');
  const cfg = readJson(file, {});
  cfg.env = cfg.env ?? {};
  cfg.env.ANTHROPIC_BASE_URL = base;
  cfg.env.ANTHROPIC_AUTH_TOKEN = key;
  // OpenRouter 集成指南：ANTHROPIC_API_KEY 必须显式为空，否则遮蔽 AUTH_TOKEN
  if (source.id === 'openrouter') cfg.env.ANTHROPIC_API_KEY = '';
  else delete cfg.env.ANTHROPIC_API_KEY;
  if (model) cfg.env.ANTHROPIC_MODEL = model; else delete cfg.env.ANTHROPIC_MODEL;
  writeJson(file, cfg);
  return { file, backup: bak };
}

/* ---------- Codex ---------- */

const BM = (id) => `# free-models:begin:${id}`;
// BLOCKMARK: defined above via BM
const EM = (id) => `# free-models:end:${id}`;

export function readCodexBlocks() {
  const file = CONFIG_PATHS.codex;
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  const re = /# free-models:begin:(\S[\w-]*)[\s\S]*?# free-models:end:\1/g;
  return [...text.matchAll(re)].map((m) => m[1]);
}

export function writeCodexProvider(sourceId, { name, base, wireApi, envKey, extra }) {
  const file = CONFIG_PATHS.codex;
  const bak = backupFile(file, 'codex');
  let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const id = pid(sourceId);
  const block = [
    BM(id),
    `[model_providers.${id}]`,
    `name = "${name.replace(/"/g, '\\"')}"`,
    `base_url = "${base.replace(/"/g, '\\"')}"`,
    `wire_api = "${wireApi}"`,
    `env_key = "${envKey}"`,
    ...(extra ?? []),
    EM(id),
    '',
  ].join('\n');
  const re = new RegExp(`${BM(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${EM(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`, 'g');
  if (re.test(text)) text = text.replace(re, '');
  text = text.trimEnd() + (text.trim() ? '\n\n' : '') + block;
  fs.writeFileSync(file, text, 'utf8');
  return { file, backup: bak };
}

/** 顶层激活：改写已有 model/model_provider 行；不存在则插入到首个 table 头之前 */
export function codexActivate(sourceId, modelId) {
  const file = CONFIG_PATHS.codex;
  const bak = backupFile(file, 'codex-activate');
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const id = pid(sourceId);
  const want = { model: modelId, model_provider: id };
  let firstTable = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\[/.test(lines[i]) && firstTable === -1) { firstTable = i; break; }
  }
  for (const [key, val] of Object.entries(want)) {
    const reKey = new RegExp(`^\\s*${key}\\s*=`);
    const idx = lines.findIndex((l, i) => (firstTable === -1 || i < firstTable) && reKey.test(l) && !l.trimStart().startsWith('#'));
    const value = JSON.stringify(String(val));
    if (idx >= 0) lines[idx] = `${key} = ${value}`;
    else {
      const at = firstTable === -1 ? lines.length : firstTable;
      lines.splice(at, 0, `${key} = ${value}`);
      if (firstTable !== -1) firstTable += 1;
    }
  }
  fs.writeFileSync(file, lines.join('\n'), 'utf8');
  return { file, backup: bak };
}

/* ---------- env（Codex 用） ---------- */

export function persistEnvVar(name, value) {
  if (process.env.FREE_MODELS_DRYRUN) return 'DRYRUN：未写入环境变量';
  if (process.platform === 'win32') {
    execFileSync('setx', [name, value], { stdio: 'pipe' });
    return 'setx（用户级，需重开终端生效）';
  }
  return `请手动写入 shell 配置：export ${name}="<key>"`;
}

/* ---------- 扫描已接入 ---------- */

export function scanConnected() {
  const out = { opencode: [], codex: [], claude: null };
  const oc = readJson(CONFIG_PATHS.opencode, {});
  for (const [id, p] of Object.entries(oc.provider ?? {})) {
    if (id.startsWith('free-')) out.opencode.push({ id, base: p?.options?.baseURL ?? null, models: Object.keys(p?.models ?? {}), name: p?.name ?? null });
  }
  out.codex = readCodexBlocks().map((id) => ({ id }));
  out.claude = readClaudeActive();
  return out;
}
