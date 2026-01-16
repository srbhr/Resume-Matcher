# Server-Side API Proxy Architecture

## Overview

The Resume Matcher frontend now uses a **server-side API proxy** architecture that eliminates CORS issues entirely. All API requests from the browser go through Next.js API routes, which then proxy to the backend server.

## Architecture Flow

```
Browser Request → Next.js /api/* (same-origin, no CORS)
                    ↓
                Next.js API Proxy
                    ↓
                Backend API (server-to-server, no CORS)
```

## Benefits

1. **No CORS Issues**: Browser requests are same-origin (to Next.js), eliminating CORS problems
2. **Simplified Configuration**: No need to configure CORS origins for every possible client IP/hostname
3. **Better Security**: Backend is not directly exposed to browsers
4. **Single Entry Point**: All traffic goes through Next.js frontend
5. **Works Everywhere**: Local network, Tailscale, Docker, production - no configuration changes needed

## Implementation

### 1. API Proxy Route (`apps/frontend/app/api/[...proxy]/route.ts`)

This catch-all route handles all `/api/*` requests and proxies them to the backend:

- Copies request method, headers, and body
- Forwards to backend at `${BACKEND_URL}/api/v1/{path}`
- Returns backend response to browser
- Handles all HTTP methods (GET, POST, PUT, PATCH, DELETE)
- Supports JSON and multipart/form-data (file uploads)

### 2. Updated API Client (`apps/frontend/lib/api/client.ts`)

Simplified to use the proxy:

```typescript
export function getApiBase(): string {
  // Server-side: Connect directly to backend
  if (typeof window === 'undefined') {
    return `${BACKEND_URL}/api/v1`;
  }
  
  // Client-side: Use Next.js API proxy (same-origin)
  return '/api';
}
```

### 3. Environment Variables

#### Frontend (`apps/frontend/.env.local`)

```env
# URL for Next.js server to connect to backend (server-to-server)
BACKEND_URL=http://localhost:8000
```

#### Docker Compose

```yaml
frontend:
  environment:
    - BACKEND_URL=http://resume-matcher-backend:8000
```

## Configuration for Different Environments

### Local Development

```env
# apps/frontend/.env.local
BACKEND_URL=http://localhost:8000
```

Access from:
- `http://localhost:3000` ✅
- `http://127.0.0.1:3000` ✅
- `http://192.168.1.x:3000` ✅ (LAN)
- Tailscale URL ✅

**No configuration changes needed!** All access points work automatically.

### Docker Compose

```yaml
frontend:
  environment:
    - BACKEND_URL=http://resume-matcher-backend:8000
```

The frontend service connects to the backend service name within Docker network.

### Production

```env
BACKEND_URL=http://your-backend-service:8000
# Or if backend is external:
BACKEND_URL=https://api.yourdomain.com
```

## Migration from Old Architecture

### Before (Direct Browser → Backend)

```typescript
// Browser called backend directly
const API_URL = process.env.NEXT_PUBLIC_API_URL; // Exposed to browser
fetch(`${API_URL}/api/v1/resumes`); // CORS required!
```

**Problems:**
- CORS configuration needed
- Must add every client IP/hostname to CORS_ORIGINS
- Fails on new networks/IPs
- Backend exposed to browsers

### After (Browser → Next.js → Backend)

```typescript
// Browser calls Next.js proxy
fetch('/api/resumes'); // Same-origin, no CORS!

// Next.js server proxies to backend
const BACKEND_URL = process.env.BACKEND_URL; // Server-side only
fetch(`${BACKEND_URL}/api/v1/resumes`); // Server-to-server, no CORS!
```

**Benefits:**
- No CORS configuration needed
- Works from any IP/hostname
- Backend not exposed to browsers
- Single configuration point

## Troubleshooting

### Issue: API requests fail with 404

**Cause**: API proxy route not loaded or incorrect path

**Solution**: 
- Restart Next.js dev server: `npm run dev:frontend`
- Check that `/apps/frontend/app/api/[...proxy]/route.ts` exists
- Verify browser is calling `/api/*` not `/api/v1/*`

### Issue: Backend connection fails

**Cause**: BACKEND_URL not set or incorrect

**Solution**:
```bash
# Check frontend .env.local
cat apps/frontend/.env.local

# Should have:
BACKEND_URL=http://localhost:8000

# For Docker:
BACKEND_URL=http://resume-matcher-backend:8000
```

### Issue: Old CORS errors still appearing

**Cause**: Browser cache or code calling backend directly

**Solution**:
- Hard refresh browser (Ctrl+Shift+R / Cmd+Shift+R)
- Clear browser cache
- Verify `lib/api/client.ts` uses `getApiBase()` correctly

## Testing

### Test Local Setup

```bash
# Terminal 1: Start backend
cd apps/backend
uv run uvicorn app.main:app --reload

# Terminal 2: Start frontend
cd apps/frontend
npm run dev

# Test from browser at:
# - http://localhost:3000
# - http://192.168.1.x:3000
# - http://your-tailscale-url:3000
```

All should work without CORS errors!

### Test Docker Setup

```bash
# Build and start
docker-compose up --build

# Test from browser at:
# - http://localhost:3000
# - http://your-ip:3000
```

### Verify Proxy is Working

1. Open browser DevTools (F12)
2. Go to Network tab
3. Use the app (e.g., view dashboard)
4. Check requests - should see:
   - Request URL: `http://localhost:3000/api/resumes` (not port 8000!)
   - Status: 200 OK
   - No CORS errors in console

## Notes for Developers

### Adding New API Endpoints

No changes needed! The proxy automatically forwards all `/api/*` requests.

```typescript
// Old way (still works):
const response = await fetch('/api/resumes');

// Also works:
const response = await fetch('/api/new-endpoint');
```

### File Uploads

File uploads work through the proxy:

```typescript
const formData = new FormData();
formData.append('file', file);

const response = await fetch('/api/resumes/upload', {
  method: 'POST',
  body: formData,
});
```

### Server-Side API Calls

Next.js server components can call backend directly:

```typescript
// In server component or API route
const BACKEND_URL = process.env.BACKEND_URL;
const data = await fetch(`${BACKEND_URL}/api/v1/resumes`);
```

## Summary

The new server-side proxy architecture:

✅ Eliminates CORS issues completely  
✅ Works from any network/IP without configuration  
✅ Improves security (backend not exposed to browsers)  
✅ Simplifies deployment (single entry point)  
✅ Maintains backwards compatibility  

No more CORS configuration headaches! 🎉

