# 隐私与数据流向 · Privacy

> English summary below.

## 我们的原则

1. **key 只属于你**。free-llm-tokens 不注册账号、不拿走 key、不建第二份 keyring。
   key 由你亲手输入（终端交互）或在对话里显式给出后经 `--key` 传入，最终落在三类**原生**位置：
   - OpenCode：`~/.config/opencode/opencode.json` 的 `provider.free-<id>.options.apiKey`
   - OpenAI Codex：用户级环境变量 `FREE_MODELS_<ID>_KEY`（Windows `setx`），`config.toml` 里只存变量名
   - Claude Code：`~/.claude/settings.json` env 块 `ANTHROPIC_AUTH_TOKEN`
2. **无共享 key、无中转站**。永不收录论坛/Discord 分享的 key；所有源都是你自注册的官方免费档
   （或明确标注的 keyless 匿名源）。
3. **探针无声明泄漏**。`test/connect` 的探针请求直接从你的机器发往该厂商，skill 不上传任何内容
   到第三方服务器；探针内容是固定的几条无信息量样例（"Reply with one word: ping"、mock 天气工具），
   每源预算 <2K tokens。
4. **备份在本地**。每次写入配置前，原文件复制到 `~/.free-models/backups/`——不出本机。
5. **确认台账**。`~/.free-models/connected.json` 仅记录：哪个源、什么时间、接入了哪些 harness、
   隐私确认是否已给过——不含 key 本体。

## 你需要知情的一条

**无论哪个厂商：你经它发送的所有内容（包括代码）该厂商可见。**
这是免费档的普遍前提；多数厂商对免费档默认允许将 prompt 用于改进/训练（OpenRouter 上游、
Gemini、Mistral、智谱等条款各不相同，已在事实卡 spoilers 里逐条标注）。skill 在每个新 provider
第一次接入前用一句话向你确认；接入后不再重复询问，但你随时可用 `remove` 撤下。

---

**English summary**: Keys come only from you and are written exclusively into harness-native
config (OpenCode provider options / Codex user-level env var / Claude settings env block).
No shared keys, no scraping, no second keyring; probe requests go straight from your machine to
the vendor (~10-token samples, <2K tokens/source). Config backups stay in `~/.free-models/backups/`
and the ledger in `connected.json` never contains keys. Fact: everything you send to a provider
is visible to that vendor; free tiers commonly carry logging/training clauses — confirmed once
per new provider, removable anytime.
