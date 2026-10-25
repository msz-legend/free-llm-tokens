#!/usr/bin/env bash
# install.sh — copy skills/free-llm-tokens into each agent's skills dir (never touches key configs)
# usage: ./install/install.sh [agents,opencode,claude,codex|all]
set -euo pipefail
src="$(cd "$(dirname "$0")/.." && pwd)/skills/free-llm-tokens"
[ -f "$src/SKILL.md" ] || { echo "SKILL.md not found at $src" >&2; exit 1; }
h="${1:-all}"
want() { [ "$h" = "all" ] || printf '%s' "$h" | tr ',' '\n' | grep -qx "$1"; }
if want agents;   then d="$HOME/.agents/skills/free-llm-tokens";        mkdir -p "$d"; cp "$src/SKILL.md" "$d/SKILL.md"; echo "✅ agents   → $d (AgentSkills universal dir)"; fi
if want opencode; then d="$HOME/.config/opencode/skills/free-llm-tokens"; mkdir -p "$d"; cp "$src/SKILL.md" "$d/SKILL.md"; echo "✅ opencode → $d"; fi
if want claude;   then d="$HOME/.claude/skills/free-llm-tokens";        mkdir -p "$d"; cp "$src/SKILL.md" "$d/SKILL.md"; echo "✅ claude   → $d"; fi
if want codex;    then d="$HOME/.codex/prompts/free-llm-tokens";        mkdir -p "$d"; cp "$src/SKILL.md" "$d/SKILL.md"; echo "✅ codex    → $d (no native skills; placed as prompt)"; fi
echo "Restart the harness session to load. Uninstall = delete the above dirs."
