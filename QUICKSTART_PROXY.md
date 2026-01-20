# Quick Start Guide: Server-Side API Proxy

## What's New?

Your frontend now uses a **server-side proxy** to eliminate CORS issues. All browser requests go through Next.js, which then forwards them to the backend.

## Before You Start

No CORS configuration needed anymore! The app will work from:
- ✅ `http://localhost:3000`
- ✅ `http://192.168.1.3:3000` (your LAN IP)
- ✅ `http://spark-e3a0.tailf591f2.ts.net:3000` (your Tailscale)
- ✅ Any other IP or hostname

## Quick Test (5 minutes)

### 1. Start the Services

**Terminal 1 - Backend:**
```bash
cd apps/backend
uv run uvicorn app.main:app --reload
```

**Terminal 2 - Frontend:**
```bash
cd apps/frontend
npm run dev
```

### 2. Run the Test Script

```bash
./test-proxy.sh
```

This will verify:
- ✅ Backend is running
- ✅ Frontend is running
- ✅ Proxy is working
- ✅ Environment is configured

### 3. Test in Browser

1. Open **http://localhost:3000** in your browser
2. Open **DevTools** (F12) → **Network** tab
3. Navigate the app (e.g., view dashboard)
4. **Verify:**
   - Requests go to `/api/*` (port 3000), **NOT** `:8000`
   - No CORS errors in console

### 4. Test from Other Devices

Try accessing from:
- Your phone on the same WiFi: `http://192.168.1.3:3000`
- Your MacBook via Tailscale: `http://spark-e3a0.tailf591f2.ts.net:3000`

**Should work without any changes!** 🎉

## What Changed?

### Files Modified

1. **`apps/frontend/lib/api/client.ts`** - Simplified API client
   - Client-side calls now go to `/api/*` (same-origin)
   - Server-side calls connect directly to backend

2. **`apps/frontend/.env.local`** - Added `BACKEND_URL`
   ```env
   BACKEND_URL=http://localhost:8000
   ```

3. **`docker-compose.yml`** - Updated frontend environment
   ```yaml
   environment:
     - BACKEND_URL=http://resume-matcher-backend:8000
   ```

### Files Created

1. **`apps/frontend/app/api/[...proxy]/route.ts`** - API proxy route
   - Handles all `/api/*` requests
   - Forwards to backend
   - Removes CORS headers

2. **`docs/agent/30-architecture/server-side-proxy.md`** - Full documentation

## Backend CORS (Optional)

Your backend `.env` currently has:
```env
CORS_ORIGINS=["http://localhost:3000","http://192.168.1.3:3000","http://resume-matcher-frontend:3000"]
```

**With the new proxy, CORS is optional!** You can:

**Option 1: Keep as-is** (works fine, allows direct backend access)

**Option 2: Simplify to wildcard:**
```env
CORS_ORIGINS=*
```

**Option 3: Remove CORS entirely** (if you don't need direct backend access)
- Comment out or remove the CORS middleware in `apps/backend/app/main.py`

## Docker Testing

```bash
# Rebuild with new changes
docker-compose down
docker-compose up --build

# Test from any network
http://localhost:3000
http://your-ip:3000
```

## Troubleshooting

### "Cannot connect to backend"

Check frontend `.env.local`:
```bash
cat apps/frontend/.env.local
# Should show: BACKEND_URL=http://localhost:8000
```

### "404 on /api/* requests"

Restart Next.js:
```bash
cd apps/frontend
npm run dev
```

### "CORS errors still appearing"

1. Hard refresh browser (Ctrl+Shift+R / Cmd+Shift+R)
2. Clear browser cache
3. Make sure requests go to `/api/*` not `localhost:8000` in DevTools

## Documentation

For complete details, see:
- **SERVER_SIDE_PROXY_REFACTORING.md** - This refactoring summary
- **docs/agent/30-architecture/server-side-proxy.md** - Full architecture guide
- **.github/copilot-instructions.md** - Updated development guidelines

## Questions?

The key insight: Browser → Next.js (same-origin) → Backend (server-to-server)

No CORS needed at any step! 🎉

