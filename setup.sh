
#!/usr/bin/env bash
#
# setup.sh - cross-platform setup for Resume Matcher
#
# Usage:
#   ./setup.sh [--help] [--start-dev]
#
# Requirements:
#   • Bash 4.4+ (for associative arrays)
#   • curl (for uv & ollama installers, if needed)
#
# After setup:
#   npm run dev       # start development server
#   npm run build     # build for production
#!/usr/bin/env bash
set -euo pipefail
export PYTHONDONTWRITEBYTECODE=1
IFS=$'\n\t'

OS="$(uname -s)"
case "$OS" in
  Linux*)   OS_TYPE="Linux" ;;
  Darwin*)  OS_TYPE="macOS" ;;
  MINGW*|MSYS*|CYGWIN*) OS_TYPE="GitBash" ;;
  *)        OS_TYPE="$OS" ;;
esac

usage() {
  cat <<EOF
Usage: $0 [--help] [--start-dev]

Options:
  --help       Show this help message and exit
  --start-dev  After setup completes, start the dev server

This script will:
  • Verify required tools: node, npm, python3, pip3, uv
  • Install Ollama & pull gemma3:4b model
  • Install dependencies via npm and uv
  • Create .env files if missing
EOF
}

START_DEV=false
if [[ "${1:-}" == "--help" ]]; then
  usage
  exit 0
elif [[ "${1:-}" == "--start-dev" ]]; then
  START_DEV=true
fi

info()    { echo -e "ℹ  $*"; }
success() { echo -e "✅ $*"; }
error()   { echo -e "❌ $*" >&2; exit 1; }

info "Detected operating system: $OS_TYPE"

if [[ "$OS_TYPE" == "GitBash" ]]; then
  echo "⚠️  Warning: You are using Git Bash on Windows."
  echo "   This setup script may fail due to file permission issues."
  echo "   👉 For best results, we recommend running it in WSL."
  read -p "Do you want to continue anyway? [y/N] " response
  if [[ ! "$response" =~ ^[Yy]$ ]]; then
    echo "Aborting setup."
    exit 1
  fi
fi

check_cmd() {
  local cmd=$1
  if ! command -v "$cmd" &> /dev/null; then
    error "$cmd is not installed. Please install it and retry."
  fi
}

check_node_version() {
  local min_major=18
  local ver
  ver=$(node --version | sed 's/^v\([0-9]*\).*/\1/')
  if (( ver < min_major )); then
    error "Node.js v${min_major}+ is required (found v$(node --version))."
  fi
}

info "Checking prerequisites…"
check_cmd node
check_node_version
check_cmd npm
check_cmd python3

if ! command -v pip3 &> /dev/null; then
  info "pip3 not found; trying to install…"
  python3 -m ensurepip --upgrade || error "ensurepip failed"
fi
check_cmd pip3
success "pip3 is available"

if ! command -v uv &> /dev/null; then
  info "Installing uv from Astral.sh…"
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi
check_cmd uv
success "All prerequisites satisfied."

info "Checking Ollama installation…"
if ! command -v ollama &> /dev/null; then
  info "Installing Ollama…"
  curl -LsSf https://ollama.com/install.sh | sh || error "Failed to install Ollama"
  export PATH="$HOME/.local/bin:$PATH"
  success "Ollama installed"
fi

if ! ollama list | grep -q 'gemma3:4b'; then
  info "Pulling gemma3:4b model…"
  ollama pull gemma3:4b || error "Failed to pull gemma3:4b"
  success "gemma3:4b model ready"
else
  info "gemma3:4b model already present—skipping"
fi

if [[ -f .env.example && ! -f .env ]]; then
  info "Creating root .env from .env.example"
  cp .env.example .env
  success "Root .env created"
elif [[ -f .env ]]; then
  info "Root .env already exists—skipping"
else
  info "No .env.example at root—skipping"
fi

info "Installing root dependencies with npm ci…"
npm ci
success "Root dependencies installed."

info "Setting up backend (apps/backend)…"
(
  cd apps/backend

  if [[ -f .env.sample && ! -f .env ]]; then
    info "Creating backend .env from .env.sample"
    cp .env.sample .env
    success "Backend .env created"
  else
    info "Backend .env exists or missing sample—skipping"
  fi

  if [[ -d .venv ]]; then
    info "Removing existing backend virtual environment…"
    if ! rm -rf .venv; then
      error "Failed to delete .venv. Please close any app using it and retry."
    fi
  fi

  info "Installing Python dependencies with uv (this may take a few seconds)…"
  uv sync
  success "Backend dependencies installed."
)

info "Setting up frontend (apps/frontend)…"
(
  cd apps/frontend
  if [[ -f .env.sample && ! -f .env ]]; then
    info "Creating frontend .env from .env.sample"
    cp .env.sample .env
    success "Frontend .env created"
  else
    info "Frontend .env exists or missing sample—skipping"
  fi

  info "Installing frontend dependencies with npm ci…"
  npm ci
  success "Frontend dependencies installed."
)

if [[ "$START_DEV" == true ]]; then
  info "Starting development server…"
  trap 'info "Shutting down dev server."; exit 0' SIGINT
  npm run dev
else
  success "🎉 Setup complete!

Next steps:
  • Run \`npm run dev\` to start development mode.
  • Run \`npm run build\` for production."
fi
