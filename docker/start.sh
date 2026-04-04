#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Internal port configuration for single-port deployment.
FRONTEND_PORT="3000"
BACKEND_PORT="8000"

# Print banner
print_banner() {
    echo -e "${CYAN}"
    cat << 'EOF'

 ██████╗ ███████╗███████╗██╗   ██╗███╗   ███╗███████╗
 ██╔══██╗██╔════╝██╔════╝██║   ██║████╗ ████║██╔════╝
 ██████╔╝█████╗  ███████╗██║   ██║██╔████╔██║█████╗
 ██╔══██╗██╔══╝  ╚════██║██║   ██║██║╚██╔╝██║██╔══╝
 ██║  ██║███████╗███████║╚██████╔╝██║ ╚═╝ ██║███████╗
 ╚═╝  ╚═╝╚══════╝╚══════╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝

 ███╗   ███╗ █████╗ ████████╗ ██████╗██╗  ██╗███████╗██████╗
 ████╗ ████║██╔══██╗╚══██╔══╝██╔════╝██║  ██║██╔════╝██╔══██╗
 ██╔████╔██║███████║   ██║   ██║     ███████║█████╗  ██████╔╝
 ██║╚██╔╝██║██╔══██║   ██║   ██║     ██╔══██║██╔══╝  ██╔══██╗
 ██║ ╚═╝ ██║██║  ██║   ██║   ╚██████╗██║  ██║███████╗██║  ██║
 ╚═╝     ╚═╝╚═╝  ╚═╝   ╚═╝    ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝

EOF
    echo -e "${NC}"
    echo -e "${BOLD}        Crazy Stuff with Resumes and Cover letters${NC}"
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# Print status message
status() {
    echo -e "${GREEN}[✓]${NC} $1" >&2
}

# Print info message
info() {
    echo -e "${BLUE}[i]${NC} $1" >&2
}

# Print warning message
warn() {
    echo -e "${YELLOW}[!]${NC} $1" >&2
}

# Print error message
error() {
    echo -e "${RED}[✗]${NC} $1" >&2
}

# Docker-style secret loader: supports VAR or VAR_FILE
file_env() {
    local var="$1"
    local def="${2:-}"
    local file_var="${var}_FILE"

    if [ -n "${!var:-}" ] && [ -n "${!file_var:-}" ]; then
        error "Both $var and $file_var are set (but are exclusive)"
        exit 1
    fi

    local val="$def"
    if [ -n "${!var:-}" ]; then
        val="${!var}"
    elif [ -n "${!file_var:-}" ]; then
        if [ ! -r "${!file_var}" ]; then
            error "Cannot read ${!file_var} for $file_var"
            exit 1
        fi
        val="$(< "${!file_var}")"
    fi

    export "$var"="$val"
    unset "$file_var"
}

normalize_log_level() {
    local value="${1^^}"
    local fallback="${2}"
    local name="${3}"

    case "$value" in
        CRITICAL|ERROR|WARNING|INFO|DEBUG)
            echo "$value"
            ;;
        *)
            warn "Invalid ${name}='$1', using ${fallback}"
            echo "$fallback"
            ;;
    esac
}

# Exit code to propagate from failed child processes
EXIT_CODE=0

# Cleanup function for graceful shutdown
cleanup() {
    # Prevent re-entry from signals during cleanup
    trap '' SIGTERM SIGINT SIGQUIT

    echo "" >&2
    info "Shutting down Resume Matcher..."

    # Kill frontend if running
    if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        kill "$FRONTEND_PID" 2>/dev/null || true
        wait "$FRONTEND_PID" 2>/dev/null || true
    fi

    # Kill backend if running
    if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        kill "$BACKEND_PID" 2>/dev/null || true
        wait "$BACKEND_PID" 2>/dev/null || true
    fi

    status "Shutdown complete"
    exit "${EXIT_CODE}"
}

# Initialize PIDs so cleanup doesn't fail on early exit
BACKEND_PID=""
FRONTEND_PID=""

# Set up signal handlers
trap cleanup SIGTERM SIGINT SIGQUIT

# Print banner
print_banner

# Display routing configuration
info "Routing configuration:"
echo -e "  Public port:   ${BOLD}${FRONTEND_PORT}${NC}"
echo -e "  Internal API:  ${BOLD}${BACKEND_PORT}${NC} (proxied at /api)"
echo ""

# Resolve env vars and optional *_FILE secret mounts
info "Loading configuration from environment and *_FILE secrets..."
file_env "LOG_LEVEL" "INFO"
file_env "LOG_LLM" "WARNING"

file_env "LLM_PROVIDER" "openai"

# Only resolve optional LLM_* vars if they (or their *_FILE variants) are provided,
# so we don't override backend defaults with empty strings.
if [ -n "${LLM_MODEL:-}" ] || [ -n "${LLM_MODEL_FILE:-}" ]; then
    file_env "LLM_MODEL"
fi

if [ -n "${LLM_API_KEY:-}" ] || [ -n "${LLM_API_KEY_FILE:-}" ]; then
    file_env "LLM_API_KEY"
fi

if [ -n "${LLM_API_BASE:-}" ] || [ -n "${LLM_API_BASE_FILE:-}" ]; then
    file_env "LLM_API_BASE"
fi
APP_LOG_LEVEL="$(normalize_log_level "${LOG_LEVEL}" "INFO" "LOG_LEVEL")"
LLM_LOG_LEVEL="$(normalize_log_level "${LOG_LLM}" "WARNING" "LOG_LLM")"
export LOG_LEVEL="${APP_LOG_LEVEL}"
export LOG_LLM="${LLM_LOG_LEVEL}"
UVICORN_LOG_LEVEL="$(echo "${APP_LOG_LEVEL}" | tr '[:upper:]' '[:lower:]')"
info "Application log level: ${BOLD}${LOG_LEVEL}${NC}"
info "LiteLLM log level:     ${BOLD}${LOG_LLM}${NC}"
if [ "${LOG_LLM}" = "DEBUG" ]; then
    warn "LOG_LLM=DEBUG may log API keys in plaintext. Do not use in production."
fi
status "Configuration loaded"

# Check and create data directory
info "Checking data directory..."
DATA_DIR="/app/backend/data"
if [ ! -d "$DATA_DIR" ]; then
    mkdir -p "$DATA_DIR"
    status "Created data directory: $DATA_DIR"
else
    status "Data directory exists: $DATA_DIR"
fi

# Check for Playwright browsers
info "Checking Playwright browsers..."
if [ -d "/root/.cache/ms-playwright" ] || [ -d "/home/appuser/.cache/ms-playwright" ]; then
    status "Playwright browsers found"
else
    warn "Installing Playwright Chromium (this may take a moment)..."
    python -m playwright install chromium || {
        warn "Playwright install failed — PDF export may not work"
    }
    status "Playwright setup complete"
fi

# Start backend
echo ""
info "Starting backend server on internal port ${BACKEND_PORT}..."
cd /app/backend
trap '' SIGTERM SIGINT SIGQUIT
python -m uvicorn app.main:app --host 0.0.0.0 --port "${BACKEND_PORT}" --log-level "${UVICORN_LOG_LEVEL}" &
BACKEND_PID=$!
trap cleanup SIGTERM SIGINT SIGQUIT

# Wait for backend to be ready
info "Waiting for backend to be ready..."
for i in {1..30}; do
    if curl -s "http://127.0.0.1:${BACKEND_PORT}/api/v1/health" > /dev/null 2>&1; then
        status "Backend is ready (PID: $BACKEND_PID)"
        break
    fi
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        error "Backend process (PID: $BACKEND_PID) died during startup"
        exit 1
    fi
    if [ $i -eq 30 ]; then
        error "Backend failed to start within 30 seconds"
        exit 1
    fi
    sleep 1
done

# Start frontend
echo ""
info "Starting frontend server on port ${FRONTEND_PORT}..."
cd /app/frontend

# Next.js uses PORT environment variable
export HOSTNAME="0.0.0.0"
export PORT="${FRONTEND_PORT}"
if [ ! -f "server.js" ]; then
    error "Missing frontend standalone server.js. Rebuild the Docker image."
    exit 1
fi

trap '' SIGTERM SIGINT SIGQUIT
node server.js "$@" &
FRONTEND_PID=$!
trap cleanup SIGTERM SIGINT SIGQUIT
status "Frontend is running (PID: $FRONTEND_PID)"

# Wait for either process to exit, but ignore errexit for this wait
set +e
wait -n "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
EXIT_CODE=$?
set -e
warn "A process exited unexpectedly (exit code: ${EXIT_CODE}), shutting down..."
cleanup
