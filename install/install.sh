#!/usr/bin/env bash
# install.sh — copy the full free-llm-tokens runtime (SKILL.md + scripts/ + registry/ + docs/) into each agent's skills dir
# usage: ./install/install.sh [agents,opencode,claude,codex|all]
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
skill_md="$repo/skills/free-llm-tokens/SKILL.md"
[ -f "$skill_md" ] || { echo "SKILL.md not found at $skill_md" >&2; exit 1; }
h="${1:-all}"
want() { [ "$h" = "all" ] || printf '%s' "$h" | tr ',' '\n' | grep -qx "$1"; }

install_one() {
  local name="$1" dir="$2"
  mkdir -p "$dir"
  rm -rf "$dir/scripts" "$dir/registry" "$dir/docs"
  cp "$skill_md" "$dir/SKILL.md"
  cp -R "$repo/scripts" "$repo/registry" "$repo/docs" "$dir/"
  for f in scripts/refresh.js scripts/lib/registry.js registry/sources.json registry/rules.json; do
    [ -f "$dir/$f" ] || { echo "install incomplete for $name: missing $f" >&2; exit 1; }
  done
  echo "✅ $name → $dir (SKILL.md + scripts/ + registry/ + docs/)"
}

if want agents;   then install_one agents   "$HOME/.agents/skills/free-llm-tokens"; fi
if want opencode; then install_one opencode "$HOME/.config/opencode/skills/free-llm-tokens"; fi
if want claude;   then install_one claude   "$HOME/.claude/skills/free-llm-tokens"; fi
if want codex;    then install_one codex    "$HOME/.codex/prompts/free-llm-tokens"; fi
if want hermes;   then
  # Hermes home: $HERMES_HOME → ~/.hermes (Windows GUI 版实际在 %LOCALAPPDATA%\hermes)
  hermes_home="${HERMES_HOME:-}"
  [ -n "$hermes_home" ] || hermes_home="$HOME/.hermes"
  install_one hermes "$hermes_home/skills/free-llm-tokens"
fi
echo 'Self-check: node "$HOME/.agents/skills/free-llm-tokens/scripts/status.js"'
echo "Restart the harness session to load. Uninstall = delete the above dirs."
