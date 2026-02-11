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

# Port configuration (can be overridden via environment variables)
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
BACKEND_PORT="${BACKEND_PORT:-8000}"

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
    echo -e "${GREEN}[✓]${NC} $1"
}

# Print info message
info() {
    echo -e "${BLUE}[i]${NC} $1"
}

# Print warning message
warn() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# Print error message
error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Cleanup function for graceful shutdown
cleanup() {
    echo ""
    info "Shutting down Resume Matcher..."

    # Kill backend if running
    if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        kill "$BACKEND_PID" 2>/dev/null || true
        wait "$BACKEND_PID" 2>/dev/null || true
    fi

    status "Shutdown complete"
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT SIGQUIT

# Print banner
print_banner

# Display port configuration
info "Port configuration:"
echo -e "  Frontend port: ${BOLD}${FRONTEND_PORT}${NC}"
echo -e "  Backend port:  ${BOLD}${BACKEND_PORT}${NC}"
echo ""

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
    cd /app/backend && python -m playwright install chromium 2>/dev/null || {
        warn "Playwright installation had warnings (this is usually OK)"
    }
    status "Playwright setup complete"
fi

# Start backend
echo ""
info "Starting backend server on port ${BACKEND_PORT}..."
cd /app/backend
python -m uvicorn app.main:app --host 0.0.0.0 --port ${BACKEND_PORT} &
BACKEND_PID=$!

# Wait for backend to be ready
info "Waiting for backend to be ready..."
for i in {1..30}; do
    if curl -s "http://localhost:${BACKEND_PORT}/api/v1/health" > /dev/null 2>&1; then
        status "Backend is ready (PID: $BACKEND_PID)"
        break
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
export PORT="${FRONTEND_PORT}"
if [ ! -f "server.js" ]; then
    error "Missing frontend standalone server.js. Rebuild the Docker image."
    exit 1
fi
node server.js &
FRONTEND_PID=$!

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
status "Resume Matcher is running!"
echo ""
echo -e "  ${BOLD}Frontend:${NC}  http://localhost:${FRONTEND_PORT}"
echo -e "  ${BOLD}Backend:${NC}   http://localhost:${BACKEND_PORT}"
echo -e "  ${BOLD}API Docs:${NC}  http://localhost:${BACKEND_PORT}/docs"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
info "Press Ctrl+C to stop"
echo ""

# Wait for processes
wait $FRONTEND_PID
