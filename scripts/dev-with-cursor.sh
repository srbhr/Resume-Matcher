#!/usr/bin/env bash
# Start cursor-api-proxy, Resume Matcher backend, and frontend for local testing.
#
# Usage:
#   ./scripts/dev-with-cursor.sh
#
# Prerequisites:
#   - Cursor Agent CLI: curl https://cursor.com/install -fsS | bash && agent login
#   - uv, Node.js 22+, npm
#   - Configure Settings → Cursor (http://127.0.0.1:8765/v1, model: auto)
#
# Press Ctrl+C to stop all services.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT/apps/backend"
FRONTEND_DIR="$ROOT/apps/frontend"

CURSOR_PROXY_URL="${CURSOR_PROXY_URL:-http://127.0.0.1:8765}"
BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8000}"
BACKEND_HEALTH_URL="${BACKEND_HEALTH_URL:-${BACKEND_URL}/api/v1/health}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"

PROXY_PID=""
BACKEND_PID=""
FRONTEND_PID=""

log() {
  printf '[dev-with-cursor] %s\n' "$*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "ERROR: '$1' not found. $2"
    exit 1
  fi
}

wait_for_url() {
  local name="$1"
  local url="$2"
  local max_attempts="${3:-60}"
  local attempt=1

  while (( attempt <= max_attempts )); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      log "$name is up ($url)"
      return 0
    fi
    sleep 1
    (( attempt++ )) || true
  done

  log "ERROR: Timed out waiting for $name at $url"
  return 1
}

cleanup() {
  log "Shutting down..."
  if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null || true
    wait "$FRONTEND_PID" 2>/dev/null || true
  fi
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
  if [[ -n "$PROXY_PID" ]] && kill -0 "$PROXY_PID" 2>/dev/null; then
    kill "$PROXY_PID" 2>/dev/null || true
    wait "$PROXY_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

require_cmd curl "Install curl or use a shell with curl available."
require_cmd node "Install Node.js 22+ from https://nodejs.org"
require_cmd npm "npm should ship with Node.js"
require_cmd uv "Install uv: curl -LsSf https://astral.sh/uv/install.sh | sh"
require_cmd npx "npx should ship with Node.js"

if ! command -v agent >/dev/null 2>&1; then
  log "ERROR: Cursor Agent CLI ('agent') not found."
  log "  curl https://cursor.com/install -fsS | bash"
  log "  agent login"
  exit 1
fi

if ! agent status >/dev/null 2>&1; then
  log "ERROR: Cursor Agent CLI is not logged in."
  log "  agent login"
  log "  Or set CURSOR_API_KEY when starting the proxy (see SETUP.md Option C)."
  exit 1
fi

# Default chat-only mode uses an isolated temp HOME, so `agent login` credentials
# are not visible to spawned CLI processes. Use real workspace + --force for local dev.
export CURSOR_BRIDGE_CHAT_ONLY_WORKSPACE="${CURSOR_BRIDGE_CHAT_ONLY_WORKSPACE:-false}"
export CURSOR_BRIDGE_FORCE="${CURSOR_BRIDGE_FORCE:-true}"

if [[ ! -f "$BACKEND_DIR/.env" ]] && [[ -f "$BACKEND_DIR/.env.example" ]]; then
  log "Creating apps/backend/.env from .env.example"
  cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
fi

log "Syncing backend dependencies..."
(cd "$BACKEND_DIR" && uv sync --quiet)

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  log "Installing frontend dependencies..."
  (cd "$FRONTEND_DIR" && npm install)
fi

log "Starting cursor-api-proxy on ${CURSOR_PROXY_URL}/v1 ..."
log "  CURSOR_BRIDGE_CHAT_ONLY_WORKSPACE=${CURSOR_BRIDGE_CHAT_ONLY_WORKSPACE}"
log "  CURSOR_BRIDGE_FORCE=${CURSOR_BRIDGE_FORCE}"
npx --yes cursor-api-proxy >/tmp/resume-matcher-cursor-proxy.log 2>&1 &
PROXY_PID=$!

wait_for_url "cursor-api-proxy" "${CURSOR_PROXY_URL}/health" 90

# Verify Cursor auth through the proxy (health alone is not enough).
if ! curl -fsS -X POST "${CURSOR_PROXY_URL}/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{"model":"auto","messages":[{"role":"user","content":"ok"}],"max_tokens":8}' \
  | grep -q '"content"'; then
  log "ERROR: cursor-api-proxy is up but Cursor auth failed."
  log "  Run: agent login"
  log "  Or: export CURSOR_API_KEY=... before starting the proxy"
  log "  See: tail -30 /tmp/resume-matcher-cursor-proxy.log"
  exit 1
fi
log "cursor-api-proxy auth check passed"

log "Starting backend on ${BACKEND_URL} ..."
(cd "$BACKEND_DIR" && uv run app) >/tmp/resume-matcher-backend.log 2>&1 &
BACKEND_PID=$!

wait_for_url "backend" "${BACKEND_HEALTH_URL}" 60

log "Starting frontend on ${FRONTEND_URL} ..."
(cd "$FRONTEND_DIR" && npm run dev) >/tmp/resume-matcher-frontend.log 2>&1 &
FRONTEND_PID=$!

wait_for_url "frontend" "${FRONTEND_URL}" 90

log ""
log "Ready for local testing:"
log "  App:        ${FRONTEND_URL}"
log "  Backend:    ${BACKEND_URL}"
log "  Cursor API: ${CURSOR_PROXY_URL}/v1"
log ""
log "Settings → Cursor (Subscription):"
log "  Base URL: http://127.0.0.1:8765/v1"
log "  Model:    auto"
log "  API key:  leave blank (unless CURSOR_BRIDGE_API_KEY is set on the proxy)"
log ""
log "Logs:"
log "  Proxy:    /tmp/resume-matcher-cursor-proxy.log"
log "  Backend:  /tmp/resume-matcher-backend.log"
log "  Frontend: /tmp/resume-matcher-frontend.log"
log ""
log "Press Ctrl+C to stop all services."

wait "$FRONTEND_PID"
