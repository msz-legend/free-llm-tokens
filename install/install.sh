#!/usr/bin/env bash
# install.sh — copy skills/free-models into each harness's skills dir (never touches key configs)
# usage: ./install/install.sh [opencode,claude,codex|all]
set -euo pipefail
src="$(cd "$(dirname "$0")/.." && pwd)/skills/free-models"
[ -f "$src/SKILL.md" ] || { echo "SKILL.md not found at $src" >&2; exit 1; }
h="${1:-all}"
want() { [ "$h" = "all" ] || printf '%s' "$h" | tr ',' '\n' | grep -qx "$1"; }
if want opencode; then mkdir -p "$HOME/.config/opencode/skills/free-models"; cp "$src/SKILL.md" "$HOME/.config/opencode/skills/free-models/SKILL.md"; echo "✅ opencode → ~/.config/opencode/skills/free-models"; fi
if want claude;   then mkdir -p "$HOME/.claude/skills/free-models"; cp "$src/SKILL.md" "$HOME/.claude/skills/free-models/SKILL.md"; echo "✅ claude → ~/.claude/skills/free-models"; fi
if want codex;    then mkdir -p "$HOME/.codex/prompts/free-models"; cp "$src/SKILL.md" "$HOME/.codex/prompts/free-models/SKILL.md"; echo "✅ codex → ~/.codex/prompts/free-models (no native skills; placed as prompt)"; fi
echo "Restart the harness session to load. Uninstall = delete the above dirs."
