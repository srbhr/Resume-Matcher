# Server-Side API Proxy Migration Guide

## What Changed

The frontend has been refactored to use a **server-side API proxy** architecture that eliminates CORS issues completely. 

### Before (Direct Browser → Backend)
```
Browser (192.168.1.3:3000) → Backend (localhost:8000) ❌ CORS Error!
Browser (tailscale-url:3000) → Backend (localhost:8000) ❌ CORS Error!
```

### After (Browser → Next.js → Backend)
```
Browser (any IP/hostname) → Next.js /api/* (same-origin) → Backend (server-to-server)
✅ No CORS errors from any network!
```

## Files Changed

### New Files
1. **`apps/frontend/app/api/[...proxy]/route.ts`** - Server-side API proxy
   - Catches all `/api/*` requests from browser
   - Proxies to backend at `${BACKEND_URL}/api/v1/*`
   - Handles GET, POST, PUT, PATCH, DELETE, OPTIONS
   - Supports JSON and file uploads

2. **`apps/frontend/.env.example`** - Environment template
   - Documents `BACKEND_URL` variable

3. **`docs/agent/30-architecture/server-side-proxy.md`** - Complete documentation

### Modified Files
1. **`apps/frontend/lib/api/client.ts`** - Simplified API client
   - Client-side: Uses `/api` (relative path, same-origin)
   - Server-side: Uses `BACKEND_URL` to connect to backend
   - Removed complex CORS/hostname detection logic

2. **`apps/frontend/.env.local`** - Updated environment
   - Added `BACKEND_URL=http://localhost:8000`

3. **`docker-compose.yml`** - Updated frontend service
   - Added `BACKEND_URL=http://resume-matcher-backend:8000`
   - Updated CORS notes (now optional)

4. **`.github/copilot-instructions.md`** - Updated documentation links

## Testing the Changes

### Docker (Required Method)

```bash
# Stop any running containers
docker-compose down

# Rebuild with new changes
docker-compose up --build

# Test from browser:
# ✅ http://localhost:3000
# ✅ http://192.168.1.3:3000 (your LAN IP)
# ✅ http://spark-e3a0.tailf591f2.ts.net:3000 (your Tailscale URL)
# ✅ http://100.121.195.5:3000 (Tailscale IP)
```

### What to Verify

1. **No CORS Errors in Browser Console**
   - Open DevTools (F12) → Console
   - Should see NO "CORS" or "Access-Control-Allow-Origin" errors

2. **API Calls Go Through /api (not :8000)**
   - Open DevTools (F12) → Network tab
   - Click on any request
   - Request URL should be: `http://your-ip:3000/api/resumes` (NOT port 8000!)

3. **Dashboard Loads Data**
   - Dashboard should display resumes
   - No connection errors

4. **File Uploads Work**
   - Try uploading a resume
   - Should work without CORS errors

### Expected Behavior

| Access Method | Before | After |
|--------------|--------|-------|
| `localhost:3000` | ✅ Works | ✅ Works |
| `192.168.1.3:3000` | ❌ CORS Error | ✅ Works |
| `tailscale-url:3000` | ❌ CORS Error | ✅ Works |
| `100.121.195.5:3000` | ✅ Works | ✅ Works |

**After migration: ALL access methods work!**

## Architecture Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Browser (Any IP/hostname)                                    │
│                                                              │
│  fetch('/api/resumes') ← Same origin, no CORS!              │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ Next.js Frontend (Port 3000)                                 │
│                                                              │
│  /api/[...proxy]/route.ts                                   │
│  ↓                                                           │
│  Proxy to: ${BACKEND_URL}/api/v1/*                          │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ FastAPI Backend (Port 8000)                                  │
│                                                              │
│  Server-to-server call, no CORS!                            │
└─────────────────────────────────────────────────────────────┘
```

## Environment Variables

### Docker Compose (Production)
```yaml
frontend:
  environment:
    - BACKEND_URL=http://resume-matcher-backend:8000
```

### Local Development (If Needed)
```env
# apps/frontend/.env.local
BACKEND_URL=http://localhost:8000
```

## Troubleshooting

### Issue: "Failed to proxy request to backend"

**Symptoms**: 502 error in browser, console shows proxy error

**Causes & Solutions**:

1. **Backend not running**
   ```bash
   docker-compose ps
   # Should show resume-matcher-backend as "Up"
   ```

2. **Wrong BACKEND_URL**
   ```bash
   docker-compose logs frontend | grep BACKEND_URL
   # Should show: BACKEND_URL=http://resume-matcher-backend:8000
   ```

3. **Backend not healthy**
   ```bash
   docker-compose logs backend
   # Check for errors
   ```

### Issue: Still seeing CORS errors

**Cause**: Browser cached old code or using old build

**Solution**:
```bash
# Hard rebuild
docker-compose down
docker-compose build --no-cache
docker-compose up
```

### Issue: 404 on /api/* requests

**Cause**: Next.js proxy route not loaded

**Solution**:
```bash
# Check file exists
ls -la apps/frontend/app/api/[...proxy]/route.ts

# Rebuild frontend
docker-compose up --build frontend
```

## Rollback (If Needed)

If you need to revert to the old architecture:

```bash
git checkout HEAD~1 -- apps/frontend/lib/api/client.ts
git checkout HEAD~1 -- apps/frontend/.env.local
rm -rf apps/frontend/app/api/[...proxy]
git checkout HEAD~1 -- docker-compose.yml
```

Then update `CORS_ORIGINS` in backend to include all your IPs.

## Benefits Summary

✅ **No CORS Configuration Needed** - Works from any IP/hostname  
✅ **Better Security** - Backend not directly exposed to browsers  
✅ **Simpler Deployment** - One environment variable (`BACKEND_URL`)  
✅ **Works Everywhere** - LAN, Tailscale, localhost, production  
✅ **Maintains Performance** - No extra latency (server-to-server is fast)  
✅ **Backwards Compatible** - Existing API calls work without changes  

## Next Steps

1. **Test with Docker**: `docker-compose up --build`
2. **Access from multiple IPs**: Verify no CORS errors
3. **Check DevTools**: Confirm requests go to `/api/*` not `:8000`
4. **Update production**: Set `BACKEND_URL` to your production backend

## Questions?

- See detailed docs: `docs/agent/30-architecture/server-side-proxy.md`
- Architecture: All browser requests are same-origin to Next.js
- Docker only: Native development not supported for this test

---

**Migration Date**: January 15, 2026  
**Reason**: Eliminate CORS issues for remote access (LAN, Tailscale)  
**Status**: ✅ Ready for Docker testing

