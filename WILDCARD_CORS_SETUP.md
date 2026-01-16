# Wildcard CORS Configuration - Production Setup

## Overview

The Resume Matcher application is now configured to **allow connections from any origin** using wildcard CORS (`*`). This means anyone can access your backend API from any IP address or domain without needing to maintain a whitelist.

## Current Configuration

### docker-compose.yml
```yaml
environment:
  - CORS_ORIGINS=*
```

This single setting allows **unlimited public access** to your backend API.

## How It Works

### Backend Implementation

**File**: `apps/backend/app/config.py`

The backend uses a custom CORS parsing system that:

1. **Reads `CORS_ORIGINS` environment variable** from docker-compose.yml
2. **Detects wildcard (`*`)** and sets CORS origins to `["*"]`
3. **FastAPI CORSMiddleware** automatically allows all origins when it sees `["*"]`

Key implementation details:
- Uses `_cors_origins_internal` private field to avoid Pydantic auto-parsing
- Exposes via `cors_origins` property for FastAPI middleware
- Supports multiple formats: wildcard, JSON array, or comma-separated list

### CORS Headers Returned

When wildcard is enabled, the backend returns:
```
access-control-allow-origin: *
access-control-allow-credentials: true
access-control-allow-methods: *
access-control-allow-headers: *
```

This tells browsers: "Allow requests from any origin"

## Verification

### Test 1: Arbitrary Domain
```bash
curl -H "Origin: http://example.com:3000" http://localhost:8000/api/v1/status
# Returns: access-control-allow-origin: *
```

### Test 2: Any IP Address
```bash
curl -H "Origin: http://192.168.1.100:3000" http://localhost:8000/api/v1/status
# Returns: access-control-allow-origin: *
```

### Test 3: Your MacBook or Server
```bash
curl -H "Origin: http://100.98.248.8:3000" http://localhost:8000/api/v1/status
# Returns: access-control-allow-origin: *
```

**Result**: ✅ All origins are accepted, no IP whitelisting needed!

## Benefits of Wildcard CORS

✅ **No Maintenance** - Don't need to update docker-compose.yml for new IPs  
✅ **Truly Public** - Anyone can access your application  
✅ **Mobile Friendly** - Works from any device without configuration  
✅ **Dynamic IPs** - Users with changing IPs don't get blocked  
✅ **Simple Deployment** - One configuration works everywhere  

## Security Considerations

⚠️ **Important**: Using wildcard CORS (`*`) means:

1. **Any website can make requests** to your backend
2. **No origin-based protection** - all origins are trusted
3. **Suitable for public APIs** where data is not sensitive
4. **Not suitable for** applications handling private user data

### When to Use Wildcard CORS

✅ **Use wildcard (`*`) when**:
- Application is intended for public access
- No sensitive user data in the API
- You want maximum accessibility
- Multiple unknown clients will connect

❌ **Don't use wildcard when**:
- Handling sensitive user information
- Authentication/authorization is critical
- You need to restrict access to specific domains
- Compliance requires origin whitelisting

## Alternative: Restricted Access

If you need to restrict access to specific origins later, update docker-compose.yml:

### Example 1: Specific IPs Only
```yaml
environment:
  - CORS_ORIGINS='["http://100.121.195.5:3000","http://100.98.248.8:3000"]'
```

### Example 2: Comma-Separated List
```yaml
environment:
  - CORS_ORIGINS='http://localhost:3000,http://your-domain.com:3000'
```

### Example 3: JSON Array with Domains
```yaml
environment:
  - CORS_ORIGINS='["http://localhost:3000","https://app.example.com","http://192.168.1.0:3000"]'
```

Then rebuild:
```bash
docker compose down
docker compose build
docker compose up -d
```

## Current Status

✅ **Wildcard CORS Active**  
✅ **All Origins Allowed**  
✅ **No Whitelist Maintenance Required**  
✅ **Production Ready**  

## How to Switch Back to Restricted CORS

1. Edit `docker-compose.yml`:
   ```yaml
   # Change from:
   - CORS_ORIGINS=*
   
   # To specific origins:
   - CORS_ORIGINS='["http://localhost:3000","http://100.121.195.5:3000"]'
   ```

2. Rebuild and restart:
   ```bash
   docker compose down
   docker compose build
   docker compose up -d
   ```

3. Verify specific origins work:
   ```bash
   # This should work (whitelisted):
   curl -H "Origin: http://100.121.195.5:3000" http://localhost:8000/api/v1/status
   
   # This should be blocked (not whitelisted):
   curl -H "Origin: http://random-domain.com:3000" http://localhost:8000/api/v1/status
   ```

## Technical Implementation Details

### Why the Custom Implementation?

Pydantic Settings automatically tries to parse environment variables, which caused issues with:
- Wildcard `*` (not valid JSON)
- Single values without quotes
- Special characters in JSON arrays

**Solution**: 
- Renamed internal field to `_cors_origins_internal`
- Exposed via `cors_origins` property
- Manually parse `CORS_ORIGINS` env var in `__init__`
- Support wildcard, JSON, and comma-separated formats

### Code Flow

1. Docker compose sets `CORS_ORIGINS=*`
2. Pydantic Settings initializes with default values
3. `Settings.__init__()` reads `CORS_ORIGINS` from environment
4. Detects wildcard and sets `_cors_origins_internal = ["*"]`
5. FastAPI reads `settings.cors_origins` property
6. CORSMiddleware configured with `allow_origins=["*"]`
7. All requests get `access-control-allow-origin: *` header

## Files Modified

### 1. apps/backend/app/config.py
- Added `_cors_origins_internal` private field
- Added `cors_origins` property for public access
- Implemented custom parsing in `__init__()` method
- Supports wildcard, JSON array, and comma-separated formats

### 2. docker-compose.yml
- Updated `CORS_ORIGINS` to use `*` for wildcard
- Added comprehensive documentation comments
- Included security warnings and examples

## Testing

### Verify Wildcard is Active
```bash
# Check CORS header in response
curl -v -H "Origin: http://test.com:3000" http://localhost:8000/api/v1/status 2>&1 | grep "access-control-allow-origin"

# Expected output:
# < access-control-allow-origin: *
```

### Verify Any Origin Works
```bash
# Test with multiple different origins
for origin in "http://example.com:3000" "http://192.168.1.1:3000" "https://random.org:3000"
do
  echo "Testing $origin:"
  curl -s -H "Origin: $origin" http://localhost:8000/api/v1/status | head -1
done
```

All should return valid JSON responses!

## Troubleshooting

### Issue: CORS Still Blocking Some Origins

**Check**: Verify wildcard is actually set
```bash
docker compose exec resume-matcher-backend python3 -c "from app.config import settings; print(settings.cors_origins)"
# Should print: ['*']
```

### Issue: Container Won't Start

**Check**: Backend logs for errors
```bash
docker compose logs resume-matcher-backend --tail 50
```

**Common issue**: JSON parsing error
**Solution**: Ensure `CORS_ORIGINS=*` (no quotes, no brackets)

### Issue: Need to Switch Back to Whitelist

**Solution**: See "How to Switch Back to Restricted CORS" section above

## Summary

✅ **Configuration**: `CORS_ORIGINS=*` in docker-compose.yml  
✅ **Effect**: All origins allowed, no maintenance needed  
✅ **Security**: Suitable for public APIs and applications  
✅ **Flexibility**: Easy to switch back to whitelist if needed  

**Your Resume Matcher is now accessible from any IP address without configuration!** 🎉

---

**Last Updated**: January 14, 2026  
**Status**: ✅ Wildcard CORS Active and Verified

