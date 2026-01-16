# Docker Remote Access Configuration

## Problem

When accessing Resume Matcher from a remote IP address (e.g., 100.121.195.5), the frontend cannot connect to the backend API because:
1. The frontend needs to know where the backend is located
2. The backend needs to allow CORS requests from that remote IP

## Solution

Resume Matcher uses intelligent routing to handle both local and remote access:

### How It Works

1. **Frontend Runtime Configuration** (`docker/frontend/docker-entrypoint.sh`)
   - Generates `runtime-config.js` at container startup
   - Sets `NEXT_PUBLIC_API_URL=http://resume-matcher-backend:8000`
   - Docker service name gets replaced with `window.location.hostname` for remote access
   - Falls back to `localhost:8000` for local development

2. **CORS Configuration** (`apps/backend/app/config.py`)
   - Backend accepts configured origins via `CORS_ORIGINS` environment variable
   - Supports JSON array format: `["http://localhost:3000","http://100.121.195.5:3000"]`
   - Supports comma-separated format: `http://localhost:3000,http://100.121.195.5:3000`

## Setup for Remote Access

### Step 1: Update docker-compose.yml

Edit `docker-compose.yml` and update the backend's `CORS_ORIGINS` environment variable:

```yaml
environment:
  - CORS_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000","http://100.121.195.5:3000"]
```

Replace `100.121.195.5` with your actual remote IP address.

### Step 2: Rebuild Containers

```bash
docker compose down
docker compose build
docker compose up -d
```

### Step 3: Access from Remote IP

Navigate to: `http://100.121.195.5:3000`

The frontend will automatically:
1. Load the runtime configuration
2. Detect that it's being accessed from `100.121.195.5`
3. Replace the Docker service name with the actual IP address
4. Connect to `http://100.121.195.5:8000` for API calls

## Example Configurations

### Single Remote IP

```yaml
- CORS_ORIGINS=["http://localhost:3000","http://192.168.1.100:3000"]
```

### Multiple Remote IPs

```yaml
- CORS_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000","http://192.168.1.100:3000","http://10.0.0.50:3000"]
```

### Comma-separated Format

```yaml
- CORS_ORIGINS='http://localhost:3000,http://127.0.0.1:3000,http://100.121.195.5:3000'
```

## Troubleshooting

### Issue: Frontend returns ERR_FAILED or 500 errors

**Cause:** CORS_ORIGINS doesn't include the remote IP

**Solution:** 
1. Check the IP address the browser is using
2. Add it to CORS_ORIGINS in docker-compose.yml
3. Rebuild and restart containers

### Issue: API calls show net::ERR_FAILED

**Cause:** Backend cannot resolve the API URL

**Solution:**
1. Check browser console (F12 → Console) to see actual API URL being used
2. Verify backend is running: `curl http://localhost:8000/api/v1/health`
3. Check CORS configuration: `docker logs resume-matcher-backend`

### Issue: Mixed content errors (HTTPS frontend + HTTP backend)

**Solution:** Use HTTPS for both frontend and backend, or use HTTP for both. Set up a reverse proxy (nginx) if needed.

## API Base URL Resolution

The frontend determines the API base URL using this logic:

```javascript
// If backend is accessible at http://resume-matcher-backend:8000
// (Docker service name detected)
→ Replace hostname with window.location.hostname
→ Result: http://100.121.195.5:8000

// If already a full IP or domain
→ Use as-is
→ Result: http://100.121.195.5:8000
```

## Network Architecture

```
┌─────────────────────────────────────────────────┐
│  Remote Client (100.121.195.5)                  │
│  Browser at 100.121.195.5:3000                  │
└──────────────────────┬──────────────────────────┘
                       │
                       │ HTTP Requests
                       │
       ┌───────────────┴────────────────────────────┐
       │         Docker Host Machine                │
       │                                            │
       ├─────────────────────┬──────────────────────┤
       │ Port 3000 (exposed) │ Port 8000 (exposed) │
       │         │           │         │           │
       │    ┌────▼───┐   ┌────▼───┐              │
       │    │Frontend │   │Backend │              │
       │    │Container│   │Container             │
       │    └─────────┘   └────────┘              │
       │                                          │
       └──────────────────────────────────────────┘
```

## Notes

- Local access (`localhost:3000`) bypasses Docker service name replacement
- The entrypoint script runs when container starts and generates the configuration
- Runtime config changes require container restart
- CORS configuration changes require container rebuild

