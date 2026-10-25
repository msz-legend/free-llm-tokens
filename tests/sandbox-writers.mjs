#!/usr/bin/env node
// tests/sandbox-writers.mjs — 在临时 USERPROFILE 里离线验证三家写入器（不碰真实配置）
// 运行：node tests/sandbox-writers.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (cond, msg) => { (cond ? pass++ : fail++); console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); };

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fm-sandbox-')));
const write = (rel, content) => { const f = path.join(tmp, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content, 'utf8'); return f; };
const readBack = (rel) => JSON.parse(fs.readFileSync(path.join(tmp, rel), 'utf8'));
const readText = (rel) => fs.readFileSync(path.join(tmp, rel), 'utf8');

// —— 伪造"已存在用户配置" ——
write('.config/opencode/opencode.json', JSON.stringify({
  '$schema': 'https://opencode.ai/config.json',
  'model': 'anthropic/claude-sonnet-4-5',
  'provider': { 'anthropic': { 'npm': '@ai-sdk/anthropic', 'options': { 'apiKey': 'sk-user-existing' } } },
}, null, 2));
write('.codex/config.toml', `# user codex config (snapshot)\nmodel = "gpt-5.3-mini"\nmodel_provider = "openai"\napproval_policy = "never"\n\n[model_providers.openai]\nname = "OpenAI"\n`);
write('.claude/settings.json', JSON.stringify({ env: { 'ANTHROPIC_BASE_URL': 'https://user-relay.example', 'ANTHROPIC_AUTH_TOKEN': 'tok-existing', 'permissionMode': 'default' }, 'model': 'claude-sonnet-4-5' }, null, 2));

const run = (args) => spawnSync('node', args.map(String), { cwd: ROOT, env: { ...process.env, USERPROFILE: tmp, HOME: tmp, FREE_MODELS_DRYRUN: '1' }, encoding: 'utf8' });

// —— 1) OpenCode 写入 ——
const r1 = run(['scripts/connect.js', 'openrouter', '--harness', 'opencode', '--model', 'openrouter/free', '--key', 'sk-or-test', '--skip-probe', '--yes', '--json']);
const oc1 = readBack('.config/opencode/opencode.json');
ok(r1.status === 0, `1a connect openrouter →opencode exit 0（实际 ${r1.status}）`);
ok(oc1.provider['free-openrouter']?.options?.baseURL === 'https://openrouter.ai/api/v1', '1b provider 写入 + baseURL');
ok(oc1.provider['free-ovh'] === undefined, '1c 未请求的源不写入');
ok(oc1.provider['anthropic']?.options?.apiKey === 'sk-user-existing', '1d 已有 provider 原样保留');
ok(oc1.model === 'anthropic/claude-sonnet-4-5', '1e 顶层 model 未被 connect 篡改');

// —— 1f agent 场景（非 TTY 无 key）必须明确报错而非静默假成功 ——
const r1x = run(['scripts/connect.js', 'openrouter', '--harness', 'opencode', '--skip-probe', '--yes', '--json']);
ok(r1x.status === 2 && /stdin 非交互终端/.test(r1x.stderr), '1f 非 TTY 无 key → exit 2 + 明确指引');

// —— 2) Codex + Claude 双写入（bigmodel 有 Responses + Anthropic 端点） ——
const r2 = run(['scripts/connect.js', 'bigmodel', '--harness', 'codex,claude', '--model', 'glm-4.7-flash', '--key', 'zhipu-sandbox', '--skip-probe', '--yes', '--activate', '--json']);
let cx = readText('.codex/config.toml');
const cs2 = readBack('.claude/settings.json');
ok(r2.status === 0, `2a connect bigmodel →codex,claude exit 0（实际 ${r2.status}，stderr=${r2.stderr.slice(0, 120)}）`);
ok(cx.includes('[model_providers.free-bigmodel]') && cx.includes('wire_api = "responses"'), '2b codex 锚点块写入');
ok(cx.includes('approval_policy = "never"'), '2c 用户其余 toml 内容保留');
ok(cx.match(/^model = /m)?.length === 1, '2d 顶层 model 行唯一（改写而非追加）');
ok(cx.includes('model = "glm-4.7-flash"') && cx.includes('model_provider = "free-bigmodel"'), '2e 已激活为默认');
ok(cs2.env.ANTHROPIC_BASE_URL === 'https://open.bigmodel.cn/api/anthropic', '2f claude env base 覆写');
ok(cs2.env.permissionMode === 'default', '2g claude 其余 env 键保留');

// —— 3) switch 切换激活 ——
run(['scripts/connect.js', 'zai', '--harness', 'codex', '--model', 'glm-5.3-flash', '--key', 'zai-sandbox', '--skip-probe', '--yes', '--json']);
const r3 = run(['scripts/switch.js', 'zai', '--harness', 'codex', '--model', 'glm-5.3-flash', '--json']);
cx = readText('.codex/config.toml');
ok(r3.status === 0, `3a switch →codex exit 0`);
ok(/^model_provider = "free-zai"/m.test(cx), '3b 激活行指向 free-zai');
ok(cx.includes('[model_providers.free-zai]'), '3c zai provider 段存在');

// —— 4) remove ——
const r5 = run(['scripts/remove.js', 'bigmodel', '--harness', 'codex,claude', '--yes', '--json']);
cx = readText('.codex/config.toml');
const cs5 = readBack('.claude/settings.json');
ok(r5.status === 0, `4a remove bigmodel exit 0`);
ok(!cx.includes('[model_providers.free-bigmodel]'), '4b codex 段已移除');
ok(cx.includes('[model_providers.free-zai]'), '4c 其它 free 段不受影响');
ok(!('ANTHROPIC_BASE_URL' in cs5.env), '4d claude env 占用键已清除（bigmodel 为最后 claude 写入者）');

console.log(`\n== ${pass} pass / ${fail} fail ==`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
