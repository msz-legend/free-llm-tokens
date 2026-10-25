# free-models

**A daily-refreshed registry of official free-tier LLM APIs, auto-connected into the native
configs of OpenCode / OpenAI Codex / Claude Code.**
Built for serious coding use (tool-call required, long context, explicit quotas). Zero npm
dependencies, Node ≥20. Primary docs are in Chinese: [README at repo root](../README.md).

## What it does

1. **Discover** — bundled curated registry (L1) of official free-tier sources with verified rate
   facts; `refresh` pulls daily feeds (L2: mnfst `data.json` CC0 + OpenRouter live directory) and
   merges into a local cache (L3), then filters by **production gates**:
   `tool-call required · ctx ≥128K · RPM ≥15 · RPD ≥50` (tunable in `registry/rules.json`).
2. **Connect** — `connect` shows a fact card → one-time privacy confirmation per provider → key
   probes → writes **native harness configs**. Every write is backed up to `~/.free-models/backups/`.
3. **Verify** — `test` runs a five-stage probe (key → model list → tiny completion → tool-call
   loop → rate sampling); budget ≤2K tokens per source. Badges expire after 14 days; 3 consecutive
   failures flag a dead-source candidate (removal only after your confirmation).
4. **Maintain** — daily diff report: additions / removals / rate flaps (>20%) / badge expiry /
   dead-source candidates.

## Quick start

```bash
node scripts/refresh.js
node scripts/status.js
node scripts/connect.js openrouter --harness opencode --model openrouter/free --key <YOUR_KEY>
node scripts/test.js openrouter
```

Direct-connect surface per harness (v1 facts):

| Harness | Protocol | Direct-connectable free sources | Others |
|---|---|---|---|
| OpenCode | OpenAI-compatible | all sources with an openai endpoint | — |
| OpenAI Codex | **Responses** (chat removed 2026-02) | Zhipu BigModel, Z.AI (official `/api/v1`) | local protocol shim needed (LiteLLM / claude-code-router / cc-switch; integrated only if already installed) |
| Claude Code | Anthropic Messages | OpenRouter (Anthropic Skin), Kilo (undocumented endpoint), ModelScope, SiliconFlow, Zhipu (free Flash over this endpoint is *not officially endorsed* — probe decides) | Groq / Gemini have no Anthropic endpoint (confirmed) |

Claude Code's env block is a **single-active-slot**: connecting a new source overwrites it
(auto-backed up); `remove` clears env keys only when that source was the last writer.

## Scope

Official free tiers only (you register and own the key) + clearly-tagged keyless anonymous
sources (Kilo / llm7 / OVH). Never included: shared keys, relay stations, keys scraped from
forums. Excluded: GitHub Models (retired 2026-07), Cerebras (card-required trial), beam-free
(not available to mainland China).

## Privacy model

Connecting a new provider first shows a one-time, explicit note: **everything you send through
this provider is visible to that vendor; free tiers commonly carry logging/training clauses.**
Keys live only in harness-native config (OpenCode provider options, Codex `env_key` environment
variable, Claude settings env block). No second keyring, no keys in the repo or logs.
See [PRIVACY.md](PRIVACY.md).

## Proxy note (mainland China)

Source entries carry an `access` tag (`cn-direct` / `proxy` / `unknown`). Feed failures degrade
gracefully. For proxied fetches on Node ≥25:
`NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7890 node scripts/refresh.js`

## Commands

| Command | Purpose |
|---|---|
| `node scripts/refresh.js [--json]` | pull today's feeds → gates → daily report |
| `node scripts/connect.js <id> [--harness …] [--key …] [--activate] [--skip-probe]` | fact card → probe → write config |
| `node scripts/test.js <id\|all> [--deep]` | five-stage full-chain probe |
| `node scripts/status.js` | health: connected sources × badges × dead candidates × shims |
| `node scripts/switch.js <id> [--model …]` | switch active model/opencode or codex |
| `node scripts/remove.js <id>` | remove from configs (confirmation required) |

State directory: `~/.free-models/` — `cache.json` / `reports/` / `backups/` / `connected.json`.

## License

MIT for code and docs. Upstream data referenced under its own license (mnfst: CC0).
