# 把免费源接进 Hermes 本体（手工步骤）

本 skill 的 `connect.js` 只写 OpenCode / OpenAI Codex / Claude Code，**不写 Hermes 配置**。
原因很实际：Hermes 有硬规矩——不要手改 `config.yaml`，要用 `hermes config set`；
而 `hermes config set` 在 agent 的非交互 shell 里会卡住（空 home 触发初始化）。所以这一步交给你在真终端 / Hermes 会话里做。

## 0. 定位 Hermes home

解析顺序：`$HERMES_HOME` → Windows 安装版 `%LOCALAPPDATA%\hermes` → `~/.hermes`（macOS/Linux）。

| 内容 | 位置 |
|---|---|
| 配置（settings） | `<home>/config.yaml` |
| 密钥（只放 key） | `<home>/.env` |
| skills | `<home>/skills` |

## 1. 选今天的源

```powershell
node "$HOME\.agents\skills\free-llm-tokens\scripts\refresh.js"
# 或直接看仓库里的 reports/latest.md
```

报告里 `- openrouter / <model-id>` 这些就是通过门槛的模型 id。

## 2. 路线 A：Hermes 内置 provider（推荐，最省事）

适用：`openrouter`、`zai`(GLM)、`deepseek`、`gemini` 以及 `<NAME>_API_KEY` 类内置 provider。

1）key 只写进 `.env`（不要写进 `config.yaml`）：

```
OPENROUTER_API_KEY=sk-or-...
```

也可以走 `hermes auth add openrouter`（带凭据池，能轮换多个 key）。

2）加一个别名（短形式 `provider/model`）：

```
hermes config set model.aliases.or-free openrouter/nvidia/nemotron-3.5-lightning:free
```

规则：**provider 放最前**，模型 id 里的 `/` 和 `:free` 后缀原样保留。

3）在会话里切换：`/model or-free`；要设成默认加 `--global`。

4）验证：`hermes chat -q "ping"`，或 `hermes doctor`。

## 3. 路线 B：非内置端点 / 自定义 base_url

适用：Kilo、llm7、OVH 这类 keyless 源或非内置端点。Hermes 用 `model_aliases` 全量形式，
key 通过 `key_env` 引用 `.env`：

```yaml
model_aliases:
  kilo-free:
    model: <模型 id>
    provider: custom
    base_url: "https://..."
    key_env: FREE_MODELS_KILO_KEY
```

操作顺序：**先备份 `config.yaml`** → 确认没有 Hermes gateway / 桌面端在跑 → 改 YAML → `hermes doctor` 验证。

> 这条是手工路径，本仓库未做自动化验证；改坏了用备份还原即可。

## 4. 边界与回滚

- `connect.js` / `status.js` 都不覆盖 Hermes，Hermes 侧不产生任何自动写入。
- 回滚：删掉 `config.yaml` 里对应的 alias 条目（用改前的备份），再从 `.env` 删掉那条 key。
  `hermes config --help` 里如果该版本提供 unset/remove 子命令，用它更稳（未在本机验证）。
