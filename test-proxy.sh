#!/bin/bash
# Test script for server-side API proxy architecture
# This script verifies that the proxy is working correctly

set -e

echo "🔍 Testing Server-Side API Proxy Architecture"
echo "=============================================="
echo ""

# Check if backend is running
echo "📡 Checking backend (port 8000)..."
if curl -s -f http://localhost:8000/api/v1/health > /dev/null 2>&1; then
    echo "✅ Backend is running"
else
    echo "❌ Backend is NOT running"
    echo "   Start it with: cd apps/backend && uv run uvicorn app.main:app --reload"
    exit 1
fi

echo ""

# Check if frontend is running
echo "📡 Checking frontend (port 3000)..."
if curl -s -f http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ Frontend is running"
else
    echo "❌ Frontend is NOT running"
    echo "   Start it with: cd apps/frontend && npm run dev"
    exit 1
fi

echo ""

# Test API proxy
echo "🔄 Testing API proxy (/api/* → backend)..."
RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:3000/api/health)
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ API proxy is working!"
    echo "   Response: $BODY"
else
    echo "❌ API proxy failed (HTTP $HTTP_CODE)"
    echo "   Response: $BODY"
    exit 1
fi

echo ""

# Check environment variables
echo "🔧 Checking environment variables..."
if [ -f "apps/frontend/.env.local" ]; then
    if grep -q "BACKEND_URL" apps/frontend/.env.local; then
        echo "✅ BACKEND_URL is configured"
        grep "BACKEND_URL" apps/frontend/.env.local | head -n 1
    else
        echo "⚠️  BACKEND_URL not found in .env.local (will use fallback)"
    fi
else
    echo "⚠️  apps/frontend/.env.local not found"
fi

echo ""

# Test from browser perspective
echo "🌐 Browser Test URLs:"
echo "   Local:     http://localhost:3000"
echo "   LAN:       http://$(hostname -I | awk '{print $1}'):3000"
echo "   Tailscale: Check your Tailscale admin console for URL"
echo ""
echo "✨ All tests passed! Your proxy is working correctly."
echo ""
echo "📝 Next steps:"
echo "   1. Open http://localhost:3000 in your browser"
echo "   2. Open DevTools (F12) → Network tab"
echo "   3. Navigate the app and verify requests go to /api/* (not :8000)"
echo "   4. No CORS errors should appear in console"
echo ""
echo "🎉 Enjoy your CORS-free experience!"

