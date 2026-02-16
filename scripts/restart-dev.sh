#!/bin/bash
# Restart dev servers with clean cache
# Usage: bash scripts/restart-dev.sh

echo "==> Stopping running processes..."
taskkill //F //IM node.exe 2>/dev/null
taskkill //F //IM python.exe 2>/dev/null
sleep 2

echo "==> Clearing Python cache..."
find apps/backend -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null
find apps/backend -name "*.pyc" -delete 2>/dev/null

echo "==> Clearing Next.js dev lock..."
rm -f apps/frontend/.next/dev/lock 2>/dev/null

echo "==> Starting dev servers..."
npm run dev
