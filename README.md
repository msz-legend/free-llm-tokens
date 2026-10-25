# free-llm-tokens

[![ci](https://github.com/msz-legend/free-llm-tokens/actions/workflows/ci.yml/badge.svg)](https://github.com/msz-legend/free-llm-tokens/actions/workflows/ci.yml)
[![daily-refresh](https://github.com/msz-legend/free-llm-tokens/actions/workflows/daily-refresh.yml/badge.svg)](https://github.com/msz-legend/free-llm-tokens/actions/workflows/daily-refresh.yml)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**每日刷新的免费大模型 Token 源注册表 + 一键接入 OpenCode / OpenAI Codex / Claude Code 原生配置。**
面向正经 coding 生产使用（tool-call 必须、长上下文、明确额度口径），零 npm 依赖，Node ≥20。

> English version: [docs/README.md](docs/README.md) · [PRIVACY.md](docs/PRIVACY.md) · [LICENSE](LICENSE)

## 它做什么

1. **发现**：内置策展注册表（L1，14+ 官方免费档源，全部标注已核实的限速事实与坑位）；
   `refresh` 每日抓上游 feed（L2：mnfst `data.json` CC0 + OpenRouter 官方 live 目录）合并本地缓存（L3），
   按**生产门槛**筛选：`tool-call 必须 · ctx ≥128K · RPM ≥15 · RPD ≥50`（`registry/rules.json` 可调）。
2. **接入**：`connect` 走「事实卡 → 隐私确认（每 provider 一次）→ key 探针 → 写原生配置」；
   写前自动备份到 `~/.free-models/backups/`，只动 skill 自己的配置段，绝不覆盖你已有的其它 provider。
3. **验证**：`test` 五段全链路探针（key → 模型目录 → 小 completion → tool-call 回环 → 限速抽样）；
   火力预算每源 <2K tokens。徽章 14 天过期；连续 3 次失败升级「死源候选」。
4. **维护**：`refresh` 产出当日 diff 报告（新增/下架/限速突变 >20%/徽章过期/死源候选）——
   清理已接入配置一律**确认后**才执行（`remove`）。

## 快速开始

```powershell
# 1) 刷新当日清单
node scripts/refresh.js

# 2) 看体检（shim 检测 / 死源候选 / 三配置同步）
node scripts/status.js

# 3) 接入（示例：OpenRouter → OpenCode；key 在 https://openrouter.ai/keys 免费注册）
node scripts/connect.js openrouter --harness opencode --model openrouter/free --key <你的key>

# 4) 全链路验证
node scripts/test.js openrouter
```

三家的直连面（v1 事实）：

| Harness | 协议 | 可直连的免费源 | 其余源 |
|---|---|---|---|
| OpenCode | OpenAI 兼容 | 全部 openai 端点源 | — |
| OpenAI Codex | **Responses**（2026-02 起 chat 已移除） | 智谱 BigModel、Z.AI（官方 `/api/v1`） | 需本地协议转换（LiteLLM / claude-code-router / cc-switch；已装才集成，不代装） |
| Claude Code | Anthropic Messages | OpenRouter（Anthropic Skin）、Kilo（隐性端点）、ModelScope、SiliconFlow、智谱（免费 Flash 走此端点未经官方背书，探针出结论） | Groq / Gemini 确认无 Anthropic 端点 |

单激活位语义：OpenCode/Codex 用 `switch` 切默认；**Claude Code 的 env 块是单激活位**，
`connect` 新源会覆写（自动备份，可回滚），`remove` 只在「本源是最后写入者」时才清 env。

## 装进任意厂家的 Agent（可选）

skill 本体符合 AgentSkills 标准，clone 后一键装进多家 harness 的 skills 目录（不碰任何 key 配置）：

```powershell
.\install\install.ps1                     # 默认装全部 4 个落点
.\install\install.ps1 -Harnesses agents   # 只装 AgentSkills 通用标准目录
```

```bash
./install/install.sh                      # macOS / Linux 同理
```

| 落点 | 谁在读 |
|---|---|
| `~/.agents/skills/free-llm-tokens` | AgentSkills 通用标准目录（多家 harness 通吃） |
| `~/.config/opencode/skills/free-llm-tokens` | OpenCode |
| `~/.claude/skills/free-llm-tokens` | Claude Code |
| `~/.codex/prompts/free-llm-tokens` | OpenAI Codex（无原生 skills，放 prompts 作会话引用卡） |

卸载 = 删除对应目录，重启 harness 生效。

**兼容说明**：数据目录沿用 `~/.free-models`、环境变量沿用 `FREE_MODELS_*` 前缀、Codex 锚点注释沿用 `# free-models:begin/end`——与既有安装完全兼容，无需迁移。

## 收录边界

**只收官方免费档**（你自己注册拿 key）+ 少数明确标注的 keyless 匿名源（Kilo/llm7/OVH，单独分类）。
**永不收录**：共享 key / 中转站 / 论坛分享 key（合法与隐私风险）；已剔除 GitHub Models（2026-07 下架）、
Cerebras（改绑卡试用）、beam-free（不面向大陆）。

## 隐私模型（摘要）

- 每接入一个新 provider，先给你看**事实卡**（注册入口、已核实限速、caveats）与一句直白提示：
  **你经此 provider 发送的所有内容该厂商可见；免费档普遍附训练/记录条款。**
- key 只写入 harness 原生配置（OpenCode provider options / Codex env_key 环境变量 / Claude settings env 块）；
  skill 不建第二份 keyring，不把 key 写进仓库或日志。
- 详见 [docs/PRIVACY.md](docs/PRIVACY.md)。

## 网络与代理

源条目带 `access` 标签；`refresh` 抓取失败自动降级（保持 L1 策展）而非误报死源。
需代理时：

```powershell
$env:NODE_USE_ENV_PROXY = '1'
$env:HTTPS_PROXY = 'http://127.0.0.1:7890'
node scripts/refresh.js
```

## 目录结构

```
free-llm-tokens/
├── skills/free-llm-tokens/SKILL.md    # 供 harness 加载的 skill 门面（触发词/路由/铁律）
├── scripts/                       # refresh / connect / test / status / switch / remove + lib/
├── registry/                      # sources.json（L1 策展） · rules.json（门槛） · upstream.json（feed 表）
├── docs/                          # English README · PRIVACY.md
├── install/                       # 安装脚本（win/.sh）：复制 skill 到各 harness skills 目录
├── reports/                       # GitHub Actions 每日 refresh 产出的日报（reports/latest.md）
├── promo/                         # 小红书宣传图（源 HTML + PNG）
└── tests/sandbox-writers.mjs      # 沙箱写入器验收（临时 USERPROFILE，不碰真实配置）
```

状态目录 `~/.free-models/`：`cache.json` / `reports/` / `backups/` / `connected.json`（隐私确认台账）。

## 支持的源（2026-10-25 口径，`refresh` 会持续校正）

直连：智谱 BigModel（GLM-4.7-Flash，200K ctx）、SiliconFlow（实名）、ModelScope（2000 请求/日，单模型 500/日）。
需代理：OpenRouter（20 RPM · RPD 50，一次充 $10 → 1000）、Gemini（Flash 系 15 RPM/1500 RPD）、Groq（30 RPM 但 8K TPM）。
待验：NVIDIA NIM（40 RPM/10K RPD）、Mistral、Ollama Cloud、Gonka（月 ~1M tokens）。
Keyless 档：Kilo（200 请求/时/IP）、llm7（100K tokens/24h）、OVH（2 请求/分——被生产门槛筛掉，仅探测用）。

## 许可

MIT（代码与文档）。上游数据按其许可引用：mnfst data.json 为 CC0；OpenRouter live 目录按 API 条款读取。
