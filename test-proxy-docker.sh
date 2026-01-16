#!/bin/bash
# Docker-only test script for server-side API proxy architecture
# This script tests the proxy in Docker environment

set -e

echo "🐳 Testing Server-Side API Proxy in Docker"
echo "=========================================="
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running"
    echo "   Start Docker and try again"
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Check if containers are running
echo "📦 Checking containers..."
BACKEND_STATUS=$(docker-compose ps -q resume-matcher-backend 2>/dev/null)
FRONTEND_STATUS=$(docker-compose ps -q resume-matcher-frontend 2>/dev/null)

if [ -z "$BACKEND_STATUS" ] || [ -z "$FRONTEND_STATUS" ]; then
    echo "⚠️  Containers not running. Starting them now..."
    echo ""
    docker-compose up -d
    echo ""
    echo "⏳ Waiting for services to be healthy (60 seconds)..."
    sleep 60
fi

# Check backend health
echo "🏥 Checking backend health..."
BACKEND_HEALTH=$(docker-compose ps | grep resume-matcher-backend | grep -o "healthy" || echo "")
if [ "$BACKEND_HEALTH" = "healthy" ]; then
    echo "✅ Backend is healthy"
else
    echo "⚠️  Backend health check pending..."
    docker-compose logs backend | tail -n 20
fi

echo ""

# Check frontend health
echo "🏥 Checking frontend health..."
FRONTEND_HEALTH=$(docker-compose ps | grep resume-matcher-frontend | grep -o "healthy" || echo "")
if [ "$FRONTEND_HEALTH" = "healthy" ]; then
    echo "✅ Frontend is healthy"
else
    echo "⚠️  Frontend health check pending..."
fi

echo ""

# Test API proxy through frontend
echo "🔄 Testing API proxy (Browser → Frontend → Backend)..."
RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:3000/api/health 2>/dev/null || echo "error\n000")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ API proxy is working!"
    echo "   Response: $BODY"
else
    echo "❌ API proxy test failed (HTTP $HTTP_CODE)"
    if [ "$HTTP_CODE" = "000" ]; then
        echo "   Frontend may not be ready yet. Wait a bit and try:"
        echo "   curl http://localhost:3000/api/health"
    else
        echo "   Response: $BODY"
    fi
fi

echo ""

# Check environment variables
echo "🔧 Checking Docker environment..."
BACKEND_URL=$(docker-compose exec -T frontend printenv BACKEND_URL 2>/dev/null || echo "not set")
echo "   BACKEND_URL: $BACKEND_URL"
if [ "$BACKEND_URL" != "not set" ]; then
    echo "✅ BACKEND_URL is configured"
else
    echo "⚠️  BACKEND_URL not set in frontend container"
fi

echo ""

# Get network IPs
echo "🌐 Access URLs:"
echo "   Local:         http://localhost:3000"
echo "   Docker Bridge: http://$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' resume-matcher-frontend 2>/dev/null || echo "N/A"):3000"

# Try to get LAN IP
LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -n "$LAN_IP" ]; then
    echo "   LAN:           http://$LAN_IP:3000"
fi

echo ""
echo "📝 Testing Instructions:"
echo ""
echo "1. Open browser and go to: http://localhost:3000"
echo "2. Open DevTools (F12) → Network tab"
echo "3. Navigate the app (e.g., Dashboard)"
echo "4. Verify:"
echo "   - Requests go to /api/* (port 3000, NOT 8000)"
echo "   - No CORS errors in Console"
echo "   - Data loads successfully"
echo ""
echo "5. Test from other devices on your network:"
echo "   - LAN: http://$LAN_IP:3000"
echo "   - Tailscale: http://your-tailscale-hostname:3000"
echo ""
echo "🔍 Troubleshooting:"
echo "   View logs:     docker-compose logs -f"
echo "   Restart:       docker-compose restart"
echo "   Rebuild:       docker-compose up --build"
echo "   Full reset:    docker-compose down && docker-compose up --build"
echo ""
echo "✨ Server-side proxy should eliminate ALL CORS issues!"

