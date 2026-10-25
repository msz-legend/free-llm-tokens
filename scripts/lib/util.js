// lib/util.js — paths, JSON io, homedir helpers (zero-dep, ESM)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HOME = os.homedir();
export const STATE_DIR = process.env.FREE_MODELS_STATE_HOME
  ? path.join(process.env.FREE_MODELS_STATE_HOME, '.free-models')
  : path.join(HOME, '.free-models');
export const STATE = {
  cacheJson: path.join(STATE_DIR, 'cache.json'),
  reportsDir: path.join(STATE_DIR, 'reports'),
  backupsDir: path.join(STATE_DIR, 'backups'),
};

export const isWindows = process.platform === 'win32';

export function ensureStatedir() {
  for (const p of [STATE_DIR, STATE.reportsDir, STATE.backupsDir]) fs.mkdirSync(p, { recursive: true });
}

export function readJson(file, fallback) {
  try {
    if (fs.existsSync(file)) {
      let text = fs.readFileSync(file, 'utf8');
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // PowerShell BOM 免疫
      return JSON.parse(text);
    }
  } catch (e) {
    console.error(`[free-models] ${file} 解析失败（${e.message}）——请手动修复或删除后重试`);
    process.exitCode = 2;
  }
  return fallback;
}

export function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

export function backupFile(file, tag) {
  if (!fs.existsSync(file)) return null;
  ensureStatedir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.basename(file);
  const dest = path.join(STATE.backupsDir, `${tag ?? 'file'}-${stamp}-${base}`);
  fs.copyFileSync(file, dest);
  return dest;
}

export function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

export function arg(opts, name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

export function hasFlag(name) {
  return process.argv.includes(name);
}

export async function ask(question) {
  if (!process.stdin.isTTY) {
    throw new Error('stdin 非交互终端，无法交互输入——请在真实终端运行，或给脚本传 --key / --yes 等显式参数');
  }
  const readline = await import('node:readline/promises');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return rl.question(question).finally(() => rl.close());
}

/** 可控失败：替代 process.exit（避免与未关闭 socket 触发 libuv 断言崩溃） */
export class Fatal extends Error {
  constructor(message, code = 1) { super(message); this.name = 'Fatal'; this.exitCode = code; }
}
export function fatal(msg, code = 1) { throw new Fatal(msg, code); }
export const endWith = (e, tag = '[free-models]') => {
  const code = e?.exitCode ?? 1;
  console.error(`${tag} ${e?.message ?? e}`);
  process.exitCode = code;
};
