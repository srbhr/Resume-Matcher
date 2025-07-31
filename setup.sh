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

set -euo pipefail
export PYTHONDONTWRITEBYTECODE=1
IFS=$'\n\t'

#–– Detect OS for compatibility ––#
OS="$(uname -s)"
case "$OS" in
  Linux*)   OS_TYPE="Linux" ;;
  Darwin*)  OS_TYPE="macOS" ;;
  *)        OS_TYPE="$OS" ;;
esac

#–– CLI help ––#
usage() {
  cat <<EOF
Usage: $0 [--help] [--start-dev]

Options:
  --help       Show this help message and exit
  --start-dev  After setup completes, start the dev server (with graceful SIGINT handling)

This script will:
  • Verify required tools: node, npm, python3, pip3, uv
  • Install Ollama & pull gemma3:4b model
  • Install root dependencies via npm ci
  • Bootstrap both root and backend .env files
  • Bootstrap backend venv and install Python deps via uv
  • Install frontend dependencies via npm ci
EOF
}

START_DEV=false
if [[ "${1:-}" == "--help" ]]; then
  usage
  exit 0
elif [[ "${1:-}" == "--start-dev" ]]; then
  START_DEV=true
fi

#–– Logging helpers ––#
info()    { echo -e "ℹ  $*"; }
success() { echo -e "✅ $*"; }
error()   { echo -e "❌ $*" >&2; exit 1; }

info "Detected operating system: $OS_TYPE"

#–– 1. Prerequisite checks ––#
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
  if [[ "$OS_TYPE" == "Linux" && -x "$(command -v apt-get)" ]]; then
    info "pip3 not found; installing via apt-get…"
    sudo apt-get update && sudo apt-get install -y python3-pip || error "Failed to install python3-pip"
  elif [[ "$OS_TYPE" == "Linux" && -x "$(command -v yum)" ]]; then
    info "pip3 not found; installing via yum…"
    sudo yum install -y python3-pip || error "Failed to install python3-pip"
  else
    info "pip3 not found; bootstrapping via ensurepip…"
    python3 -m ensurepip --upgrade || error "ensurepip failed"
  fi
fi
check_cmd pip3
success "pip3 is available"

# ensure uv
if ! command -v uv &> /dev/null; then
  info "uv not found; installing…"
  if [[ "$OS_TYPE" == "macOS" ]]; then
    brew install uv || error "Failed to install uv via Homebrew"
  else
    curl -LsSf https://astral.sh/uv/install.sh | sh || error "Failed to install uv"
    export PATH="$HOME/.local/bin:$PATH"
  fi
  success "uv installed"
fi
check_cmd uv
success "All prerequisites satisfied."

#–– 2. Ollama & model setup ––#
info "Checking Ollama installation…"
if ! command -v ollama &> /dev/null; then
  info "ollama not found; installing…"

  if [[ "$OS_TYPE" == "macOS" ]]; then
    brew install ollama || error "Failed to install Ollama via Homebrew"
  else
    # Download Ollama installer securely without using curl | sh
    curl -Lo ollama-install.sh https://ollama.com/install.sh || error "Failed to download Ollama installer"
    chmod +x ollama-install.sh
    ./ollama-install.sh || error "Failed to execute Ollama installer"
    rm ollama-install.sh
    export PATH="$HOME/.local/bin:$PATH"
  fi
  success "Ollama installed"
fi

if ! ollama list | grep -q 'gemma3:4b'; then
  info "Pulling gemma3:4b model…"
  ollama pull gemma3:4b || error "Failed to pull gemma3:4b"
  success "gemma3:4b model ready"
else
  info "gemma3:4b model already present—skipping"
fi

#–– 3. Bootstrap root .env ––#
if [[ -f .env.example && ! -f .env ]]; then
  info "Bootstrapping root .env from .env.example"
  cp .env.example .env
  success "Root .env created"
elif [[ -f .env ]]; then
  info "Root .env already exists—skipping"
else
  info "No .env.example at root—skipping"
fi

#–– 4. Install root dependencies ––#
info "Installing root dependencies with npm ci…"
npm ci
success "Root dependencies installed."

#–– 5. Setup backend ––#
info "Setting up backend (apps/backend)…"
(
  cd apps/backend

  # bootstrap backend .env
  if [[ -f .env.sample && ! -f .env ]]; then
    info "Bootstrapping backend .env from .env.sample"
    cp .env.sample .env
    success "Backend .env created"
  else
    info "Backend .env exists or .env.sample missing—skipping"
  fi

  info "Syncing Python deps via uv…"
  uv sync
  success "Backend dependencies ready."
)

#–– 6. Setup frontend ––#
info "Setting up frontend (apps/frontend)…"
(
  cd apps/frontend
  # bootstrap frontend .env
  if [[ -f .env.sample && ! -f .env ]]; then
    info "Bootstrapping frontend .env from .env.sample"
    cp .env.sample .env
    success "frontend .env created"
  else
    info "frontend .env exists or .env.sample missing—skipping"
  fi

  info "Installing frontend deps with npm ci…"
  npm ci
  success "Frontend dependencies ready."
)

#–– 7. Finish or start dev ––#
if [[ "$START_DEV" == true ]]; then
  info "Starting development server…"
  # trap SIGINT for graceful shutdown
  trap 'info "Gracefully shutting down development server."; exit 0' SIGINT
  npm run dev
else
  success "🎉 Setup complete!

Next steps:
  • Run \`npm run dev\` to start in development mode.
  • Run \`npm run build\` for production.
  • See SETUP.md for more details."
fi
