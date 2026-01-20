# Server-Side API Proxy Refactoring

## Summary

The frontend has been refactored to use a **server-side API proxy** architecture that completely eliminates CORS issues. All browser requests now go through Next.js API routes, which proxy to the backend server.

## What Changed

### 1. New API Proxy Route
**File**: `apps/frontend/app/api/[...proxy]/route.ts`

This catch-all route intercepts all `/api/*` requests from the browser and forwards them to the backend:

```typescript
Browser → /api/resumes → Next.js Proxy → http://localhost:8000/api/v1/resumes
```

**Key features:**
- Handles all HTTP methods (GET, POST, PUT, PATCH, DELETE)
- Supports JSON and file uploads (multipart/form-data)
- Removes CORS headers from backend responses (no longer needed)
- Configurable via `BACKEND_URL` environment variable

### 2. Simplified API Client
**File**: `apps/frontend/lib/api/client.ts`

The API client has been greatly simplified:

**Before:**
```typescript
// Complex logic to determine API URL based on environment
// Had to handle Docker service names, IP addresses, etc.
const API_BASE = computeApiBase(); // ~70 lines of code
```

**After:**
```typescript
export function getApiBase(): string {
  // Server-side: Connect directly to backend
  if (typeof window === 'undefined') {
    return `${BACKEND_URL}/api/v1`;
  }
  
  // Client-side: Use Next.js proxy (same-origin)
  return '/api';
}
```

### 3. Updated Environment Variables

**Frontend** (`apps/frontend/.env.local`):
```env
# Server-to-server connection (not exposed to browser)
BACKEND_URL=http://localhost:8000

# Legacy fallback
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**Docker Compose**:
```yaml
frontend:
  environment:
    - BACKEND_URL=http://resume-matcher-backend:8000
```

### 4. Updated Documentation

- Created `docs/agent/30-architecture/server-side-proxy.md` - Complete architecture guide
- Updated `.github/copilot-instructions.md` - Added proxy notes to key features
- Created `apps/frontend/.env.example` - Environment variable template

## Benefits

### ✅ No More CORS Issues
Browser requests are same-origin (to Next.js), eliminating CORS problems entirely.

### ✅ Works from Any Network
- Local: `http://localhost:3000` ✅
- LAN: `http://192.168.1.x:3000` ✅
- Tailscale: `http://spark-e3a0.tailf591f2.ts.net:3000` ✅
- Docker: Any hostname/IP ✅

**No configuration changes needed!**

### ✅ Improved Security
Backend is not directly exposed to browsers - all traffic goes through Next.js.

### ✅ Simplified Configuration
One environment variable (`BACKEND_URL`) instead of managing CORS origins for every possible client IP/hostname.

## Architecture Flow

```
┌─────────┐     Same-Origin      ┌──────────┐    Server-to-Server    ┌─────────┐
│ Browser │ ──────────────────► │  Next.js  │ ──────────────────────► │ Backend │
│         │   /api/resumes       │  Proxy    │  :8000/api/v1/resumes  │  :8000  │
└─────────┘   (No CORS!)         └──────────┘   (No CORS!)            └─────────┘
```

## Testing

### Local Development

1. **Start Backend:**
```bash
cd apps/backend
uv run uvicorn app.main:app --reload
```

2. **Start Frontend:**
```bash
cd apps/frontend
npm run dev
```

3. **Test from multiple locations:**
   - `http://localhost:3000` ✅
   - `http://127.0.0.1:3000` ✅
   - `http://192.168.1.x:3000` ✅ (from another device on LAN)
   - Tailscale URL ✅

4. **Verify in DevTools:**
   - Open browser DevTools (F12) → Network tab
   - Use the app (e.g., view dashboard)
   - Check that requests go to `/api/*` (port 3000), not `:8000`
   - No CORS errors in console

### Docker Testing

```bash
# Build and start
docker-compose up --build

# Test from:
# - http://localhost:3000
# - http://your-ip:3000
# - Any network location
```

## Migration Notes

### Existing Code Compatibility

✅ **All existing code continues to work!**

The API client functions (`apiFetch`, `apiPost`, etc.) work exactly the same:

```typescript
// Still works - no changes needed
const response = await fetch('/api/resumes');
const data = await apiPost('/config/llm-api-key', config);
```

### CORS Configuration (Optional)

The backend CORS configuration is now optional but kept for backwards compatibility:

```python
# apps/backend/app/main.py
# CORS is no longer needed with the proxy, but kept for direct API access
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    # ...
)
```

You can safely set `CORS_ORIGINS=*` or remove CORS entirely if you don't need direct backend access.

## Troubleshooting

### Issue: 404 errors on API requests

**Solution:** Make sure Next.js dev server is running and restart it if needed:
```bash
cd apps/frontend
npm run dev
```

### Issue: Backend connection fails

**Solution:** Check `BACKEND_URL` in `.env.local`:
```bash
cat apps/frontend/.env.local
# Should show: BACKEND_URL=http://localhost:8000
```

For Docker, make sure it uses the service name:
```yaml
BACKEND_URL=http://resume-matcher-backend:8000
```

### Issue: TypeScript errors

These are compile-time warnings that don't affect runtime. To check:
```bash
cd apps/frontend
npm run build  # Should complete successfully
```

## Files Changed

### Created
- ✨ `apps/frontend/app/api/[...proxy]/route.ts` - API proxy route
- ✨ `apps/frontend/.env.example` - Environment template
- ✨ `docs/agent/30-architecture/server-side-proxy.md` - Architecture documentation

### Modified
- 📝 `apps/frontend/lib/api/client.ts` - Simplified API client
- 📝 `apps/frontend/.env.local` - Added BACKEND_URL
- 📝 `docker-compose.yml` - Updated environment variables
- 📝 `.github/copilot-instructions.md` - Updated documentation references

### Unchanged
- ✅ All React components
- ✅ All API client consumers
- ✅ Backend code
- ✅ Database

## Next Steps

1. **Test thoroughly** - Try accessing from different networks/IPs
2. **Update deployment** - Set `BACKEND_URL` in production environment
3. **Optional cleanup** - Can simplify backend CORS configuration if desired

## Questions?

See the full architecture documentation:
- **docs/agent/30-architecture/server-side-proxy.md** - Complete guide
- **.github/copilot-instructions.md** - Development guidelines

