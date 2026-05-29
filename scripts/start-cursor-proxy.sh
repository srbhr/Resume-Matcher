#!/usr/bin/env bash
set -euo pipefail

if ! command -v agent >/dev/null 2>&1; then
  echo "Cursor Agent CLI not found. Install it with:"
  echo "  curl https://cursor.com/install -fsS | bash"
  echo "Then run: agent login"
  exit 1
fi

# Default chat-only mode uses an isolated temp HOME, so `agent login` credentials
# are not visible to spawned CLI processes. For local Resume Matcher use, prefer
# the real workspace + --force so existing `agent login` works non-interactively.
export CURSOR_BRIDGE_CHAT_ONLY_WORKSPACE="${CURSOR_BRIDGE_CHAT_ONLY_WORKSPACE:-false}"
export CURSOR_BRIDGE_FORCE="${CURSOR_BRIDGE_FORCE:-true}"

echo "Starting cursor-api-proxy on http://127.0.0.1:8765/v1 ..."
echo "  (CURSOR_BRIDGE_CHAT_ONLY_WORKSPACE=${CURSOR_BRIDGE_CHAT_ONLY_WORKSPACE}, CURSOR_BRIDGE_FORCE=${CURSOR_BRIDGE_FORCE})"
exec npx cursor-api-proxy
