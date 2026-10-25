---
name: free-llm-tokens
description: 把当日可用的官方免费档 LLM API Token 源（OpenRouter :free、智谱 GLM Flash、Z.AI、ModelScope、SiliconFlow、Gemini、Groq 等）接入本机各厂家 Agent 的原生配置（写入支持 OpenCode / OpenAI Codex / Claude Code；skill 本体可装进任何 AgentSkills 兼容 harness）。触发词：免费模型、免费 token、free tokens、free tier、free models、白嫖、换源、接个免费源、429 了、额度用完、切到免费、接入 provider。Agent 必须遵守：非交互环境不得挂起等待输入——connect 一律显式传 --key（由用户提供）或提示用户改用真终端；每接入一个新 provider，先在对话里向用户确认隐私条款再执行。
license: MIT
---

# free-llm-tokens — 免费 LLM Token 源注册表 + 各厂家 Agent 自动接入

**定位**：发现「今天可用」的官方免费档 LLM API（注册表 + 每日 feed），把你自己的 API key 接入
OpenCode / OpenAI Codex / Claude Code 的**原生配置文件**。面向正经 coding 使用：
生产门槛 tool-call 必须 + ctx≥128K + RPM≥15 + RPD≥50（可在 `registry/rules.json` 调整）。

**三条铁律**

1. **key 只来自用户**：用户自注册、自己提供（对话里明文给出、或已存在 `FREE_MODELS_<ID>_KEY` 环境变量 / `~/.free-models/config.env`）。skill 不代注册、不抓共享 key、不建第二份 keyring。
2. **非交互永不挂起**：脚本检测到 stdin 非 TTY 又缺显式参数时会 exit 2 并提示——agent 驱动时**必须** `--key <用户提供> --yes`（或让用户在真终端运行）；每个新 provider 第一次接入前，先在对话里告诉用户「你经此 provider 发送的所有内容该厂商可见（免费档普遍附训练/记录条款）」，得到确认后才跑。
3. **只动自己的地盘**：写入前自动备份到 `~/.free-models/backups/`；OpenCode 只增 `provider.free-<id>`、Codex 只增 `[model_providers.free-<id>]` 锚点段（wire_api="responses"）、Claude 只写 env 块的 `ANTHROPIC_BASE_URL/AUTH_TOKEN/MODEL` 三个键。拒绝静默覆盖用户已有 key。

## 定位本 skill（动手前先做这一步）

下表中的命令一律用**绝对路径**运行：`$S` = 本 `SKILL.md` 所在目录。**不要假设 cwd 是 skill 目录**，也别写 `node scripts/...`。

```powershell
# Windows
$S = Join-Path $HOME '.agents\skills\free-llm-tokens'
node "$S\scripts\status.js"     # 自检：能跑通说明运行时完整
```

```bash
# macOS / Linux
S="$HOME/.agents/skills/free-llm-tokens"
node "$S/scripts/status.js"
```

- 在**仓库 checkout** 里直接用时，`$S` = 仓库根目录（`scripts/`、`registry/` 就在根下），路径同理可用。
- **Hermes** 的落点是 `$HERMES_HOME/skills/free-llm-tokens`（Windows 安装版默认 `%LOCALAPPDATA%\hermes\skills\free-llm-tokens`）。
- 若 `$S/scripts/refresh.js` 不存在，说明安装不完整（旧版安装器只拷了 SKILL.md）——重跑 `install/install.ps1` 或 `install/install.sh`，会连 `scripts/`、`registry/`、`docs/` 一起装。

## 子命令（`$S/scripts/`，Node ≥20，零 npm 依赖）

| 命令 | 用途 | 关键参数 |
|---|---|---|
| `node "$S/scripts/refresh.js"` | 抓当日 feed（mnfst + OpenRouter live）→ 门槛筛选 → `~/.free-models/reports/当日.md` | `--json` 紧凑输出 |
| `node "$S/scripts/connect.js" <id>` | 选源→事实卡→探针(key/目录/completion/tool-call)→写入配置 | `--harness opencode\|codex\|claude\|a,b\|all`、`--key <k>`、`--model <id>`、`--activate`(codex)、`--skip-probe`、`--force`、`--yes` |
| `node "$S/scripts/test.js" <id\|all>` | 五段全链路探针 + 徽章写入缓存（连败 3 次→死源候选） | `--deep` 加限速抽样 |
| `node "$S/scripts/status.js"` | 三配置体检：已接入源×徽章×死源候选×shim 检测 | — |
| `node "$S/scripts/switch.js" <id>` | OpenCode 顶层 model / Codex 顶层 model+model_provider 切激活 | `--model <id>`、`--harness` |
| `node "$S/scripts/remove.js" <id>` | 从配置移除（确认制，Claude 仅当本源为最后写入者才清 env） | `--harness`、`--purge-env` |

源清单与限速事实：`$S/registry/sources.json`（14+ 条，每条含 caveats 事实卡）；门槛/探针参数：`$S/registry/rules.json`。

## 典型路由

- 「今天有哪些免费的」→ `refresh.js --json`，读报告给你列出**通过门槛**的源（区分 直连/需代理）。
- 「把 OpenRouter 接到 opencode」→ 用户给 key → `connect.js openrouter --harness opencode --key <k> --yes` →（探针自动跑）→ `test.js openrouter` 验证。
- 「接 codex」→ 只有 **bigmodel / zai** 有官方 Responses 端点可直连；其余源要本地协议转换（LiteLLM / claude-code-router / cc-switch，仅当用户已装才集成，不代装）。
- 「接 claude code」→ 有 Anthropic 端点的源：openrouter（皮肤）/ kilo（隐性）/ modelscope / siliconflow / bigmodel（免费 Flash 走此端点未经官方背书，探针出结论）。Claude 单激活位：接入即覆写（先警告再备份）。
- 「429 了 / 换一个」→ `status.js` 看徽章 → `switch.js <另一源>`（claude 则 re-connect）→ 提醒 OpenRouter 余额为负会连带屏蔽 free。
- 「这个源不行，删掉」→ 告知 fact-card 影响 → **用户确认后** `remove.js <id> --yes`。

## 网络与大陆访问

`$S/registry/sources.json` 每条带 `access` 标签（`cn-direct` / `proxy` / `unknown`）。
国际源抓取失败时：先降级而非报死（mnfst raw 偶发不通）。需代理时 PowerShell：
`$env:NODE_USE_ENV_PROXY=1; $env:HTTPS_PROXY='http://…'` 再跑脚本（Node 25 起官方 env-proxy）。

## 手工退化（无 Node 环境）

1. 读 `$S/registry/sources.json` 条目 → 官方页面注册拿 key。
2. OpenCode：`~/.config/opencode/opencode.json` 加 `provider.free-<id>`（模板见 `$S/docs/README.md`）。
3. Codex：`~/.codex/config.toml` 加 `[model_providers.free-<id>]`（wire_api="responses"、env_key）。
4. Claude：`~/.claude/settings.json` env 块三个 ANTHROPIC_* 键。
5. 改前手动复制原文件到别处做备份。

## 状态目录

`~/.free-models/`：`cache.json`（feed 合并 + 探针徽章）、`reports/当日.md`（daily diff）、
`backups/`（每次写入前的原配置）、`connected.json`（接入记录 + 隐私确认台账）。
