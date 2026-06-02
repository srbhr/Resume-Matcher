#!/usr/bin/env bash
# Install the (gitignored) monitor-e2e Claude Code skill from its committed
# source-of-truth playbook. Run once per clone if you want the agent layer.
set -euo pipefail
root="$(cd "$(dirname "$0")/../../.." && pwd)"
dest="$root/.claude/skills/monitor-e2e"
mkdir -p "$dest"
cp "$root/apps/backend/e2e_monitor/AGENT_PLAYBOOK.md" "$dest/SKILL.md"
echo "installed monitor-e2e skill -> $dest/SKILL.md (gitignored)"
