#!/bin/bash
# Hard restart Resume Matcher dev environment
# Usage: bash scripts/restart-dev.sh

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}==> 1. Stopping all running processes...${NC}"

# Kill known process types with force
# Using //F for taskkill compatibility in bash environments on Windows
taskkill //F //IM node.exe //T 2>/dev/null
taskkill //F //IM python.exe //T 2>/dev/null
taskkill //F //IM uvicorn.exe //T 2>/dev/null

# Extra cleanup for ports
if command -v npx &> /dev/null; then
    echo "    Cleaning ports 3000 and 8000..."
    npx kill-port 3000 8000 2>/dev/null
fi

echo -e "${BLUE}==> 2. Clearing caches and locks...${NC}"
# Python cache
find apps/backend -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null
find apps/backend -name "*.pyc" -delete 2>/dev/null

# Next.js locks/cache
rm -rf apps/frontend/.next/cache 2>/dev/null
rm -f apps/frontend/.next/dev/lock 2>/dev/null

echo -e "${BLUE}==> 3. Verifying Backend Environment...${NC}"
if command -v uv &> /dev/null; then
    echo "    Ensuring uv dependencies are synced..."
    (cd apps/backend && uv sync)
    
    echo "    Checking Playwright Chromium installation..."
    # Ensure Playwright browser is installed in the uv environment
    (cd apps/backend && uv run playwright install chromium)
else
    echo -e "${YELLOW}    Warning: uv not found. Falling back to local .venv...${NC}"
    if [ -f "apps/backend/.venv/Scripts/python.exe" ]; then
        apps/backend/.venv/Scripts/python.exe -m playwright install chromium
    else
        echo -e "${RED}    Error: Neither uv nor .venv/Scripts/python.exe found.${NC}"
    fi
fi

echo -e "${GREEN}==> 4. Starting dev servers...${NC}"
echo -e "${YELLOW}    Note: Use 'npm run dev' manually if this script exits immediately.${NC}"

# Start the dev process via npm (which uses concurrently)
npm run dev
