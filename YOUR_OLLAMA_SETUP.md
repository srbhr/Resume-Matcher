# Ollama Configuration Guide - Your Setup

## Current Configuration ✅

Your Resume Matcher is now properly configured and working with Ollama!

### System Status
- **Backend**: `http://localhost:8000` - ✅ Healthy
- **Ollama**: Running in Docker container named `ollama` - ✅ Running
- **Model**: `llama3.2:3b` (2.0 GB) - ✅ Available
- **API Base**: `http://100.121.195.5:11434` - ✅ Connected

### What Was Fixed

1. **Updated LLM Code** - Added Ollama-specific improvements:
   - `num_ctx=8192` (increased context window from 4096)
   - Explicit English language enforcement
   - Stronger JSON-only instructions

2. **Fixed Configuration** - Updated model name:
   - Changed from: `deepseek-r1` (not available)
   - Changed to: `llama3.2:3b` (available in your Ollama)

## Quick Reference Commands

### Check System Health
```bash
# Backend health
curl http://localhost:8000/api/v1/health | jq

# Ollama models
docker exec ollama ollama list

# Backend logs
docker logs resume-matcher-backend --tail 50

# Ollama logs
docker logs ollama --tail 50
```

### Restart Services
```bash
# Restart backend only
docker restart resume-matcher-backend

# Restart everything
docker compose restart

# Rebuild and restart (after code changes)
docker compose down && docker compose build && docker compose up -d
```

### Update Configuration
```bash
# Via UI (Recommended)
# Open http://localhost:3000/settings
# Change model name and save

# Via command line (for reference)
docker exec resume-matcher-backend bash -c 'cat > /tmp/update_config.py << EOF
import json
config_path = "/app/backend/data/config.json"
with open(config_path, "r") as f:
    config = json.load(f)
config["model"] = "llama3.2:3b"
with open(config_path, "w") as f:
    json.dump(config, f, indent=2)
EOF
python /tmp/update_config.py'
docker restart resume-matcher-backend
```

## Testing the Fix

### 1. Upload a Test Resume

1. Open http://localhost:3000
2. Go to "Resume Builder"
3. Click "Upload Resume"
4. Select a PDF or DOCX file
5. Watch it parse successfully in English JSON format

### 2. Monitor Logs

```bash
# Watch backend logs in real-time
docker logs -f resume-matcher-backend

# Watch Ollama logs in real-time
docker logs -f ollama
```

**What to look for:**
- ✅ NO `msg="truncating input prompt"` warnings
- ✅ NO `Il semble que...` (French text) errors
- ✅ Successful JSON parsing on first attempt
- ✅ Fast response times (5-15 seconds for resume parsing)

## Adding More Models

If you want to try different models:

```bash
# Pull a new model
docker exec ollama ollama pull mistral

# List available models
docker exec ollama ollama list

# Update Resume Matcher to use it
# Go to http://localhost:3000/settings
# Change model to: mistral
# Save and Test Connection
```

### Recommended Models

| Model | Size | Speed | Quality | Best For |
|-------|------|-------|---------|----------|
| `llama3.2:3b` ⭐ | 2.0 GB | ⚡⚡⚡ | ⭐⭐⭐ | Currently installed - good balance |
| `llama3.2:1b` | 1.3 GB | ⚡⚡⚡ | ⭐⭐ | Fastest, lower quality |
| `mistral` | 4.1 GB | ⚡⚡ | ⭐⭐⭐⭐ | Better quality, still fast |
| `llama3.1:8b` | 4.7 GB | ⚡⚡ | ⭐⭐⭐⭐ | Best quality for 8GB models |

## Network Configuration

Your Docker setup:
- **Resume Matcher Backend**: `172.19.0.2` on `resume-matcher_resume-matcher-network`
- **Ollama Container**: `172.17.0.2` on `bridge` network
- **Communication**: Via host IP `100.121.195.5:11434`

This setup is working correctly. The containers communicate through the host IP address.

### Alternative: Put Ollama on Same Network

If you want to simplify the setup, you can put Ollama on the same network:

```bash
# Stop containers
docker compose down
docker stop ollama

# Add Ollama to Resume Matcher's network
docker network connect resume-matcher_resume-matcher-network ollama
docker start ollama

# Update config to use container name
docker exec resume-matcher-backend bash -c 'cat > /tmp/update_config.py << EOF
import json
config_path = "/app/backend/data/config.json"
with open(config_path, "r") as f:
    config = json.load(f)
config["api_base"] = "http://ollama:11434"
with open(config_path, "w") as f:
    json.dump(config, f, indent=2)
EOF
python /tmp/update_config.py'

# Restart
docker compose up -d
```

Then you can use `http://ollama:11434` instead of the IP address.

## Troubleshooting

### If Resume Parsing Fails

1. **Check Ollama is running:**
   ```bash
   docker ps | grep ollama
   curl http://100.121.195.5:11434/api/tags
   ```

2. **Check model is available:**
   ```bash
   docker exec ollama ollama list
   ```

3. **Check backend can reach Ollama:**
   ```bash
   docker exec resume-matcher-backend curl http://100.121.195.5:11434/api/tags
   ```

4. **Check logs for errors:**
   ```bash
   docker logs resume-matcher-backend --tail 100 | grep -i error
   docker logs ollama --tail 100 | grep -i error
   ```

### If Still Getting French Responses

This should be fixed now, but if it happens:

1. **Verify you're using the updated code:**
   ```bash
   docker exec resume-matcher-backend grep -n "num_ctx" /app/backend/app/llm.py
   ```
   Should show line with `kwargs["num_ctx"] = 8192`

2. **Try a different model:**
   ```bash
   docker exec ollama ollama pull mistral
   # Update via UI to use: mistral
   ```

3. **Check system locale:**
   ```bash
   docker exec ollama env | grep LANG
   docker exec resume-matcher-backend env | grep LANG
   ```

### If Getting Truncation Warnings

This should be fixed now, but if you still see them:

1. **Verify the fix is applied:**
   ```bash
   docker exec resume-matcher-backend python -c "
   import sys
   sys.path.insert(0, '/app/backend')
   from app.llm import complete_json
   import inspect
   print(inspect.getsource(complete_json))
   " | grep num_ctx
   ```
   Should show `kwargs["num_ctx"] = 8192`

2. **Increase context further if needed:**
   Edit `apps/backend/app/llm.py` and change to `16384`, then rebuild.

## Performance Tips

### Current Setup (llama3.2:3b)
- **Context window**: 8192 tokens (automatic)
- **Typical resume parsing**: 5-15 seconds
- **Memory usage**: ~2-3 GB RAM
- **Concurrent requests**: Handles 1 at a time (no queuing)

### Optimization Options

1. **Use smaller model for speed:**
   ```bash
   docker exec ollama ollama pull llama3.2:1b
   ```
   50% faster, slightly lower quality

2. **Use larger model for quality:**
   ```bash
   docker exec ollama ollama pull llama3.1:8b
   ```
   Better quality, 2x slower

3. **Add GPU support:**
   If you have an NVIDIA GPU, modify Ollama container to use it:
   ```yaml
   # In docker-compose.yml or Ollama container config
   deploy:
     resources:
       reservations:
         devices:
           - driver: nvidia
             count: all
             capabilities: [gpu]
   ```

## Additional Resources

- **Full Fix Documentation**: See `OLLAMA_FIX_SUMMARY.md`
- **Troubleshooting Guide**: See `OLLAMA_TROUBLESHOOTING.md`
- **Ollama Documentation**: https://github.com/ollama/ollama
- **Model Library**: https://ollama.com/library

## Summary

Your system is now fully configured and the Ollama fixes have been applied:
- ✅ Backend code updated with `num_ctx=8192` and English enforcement
- ✅ Model configuration corrected to `llama3.2:3b`
- ✅ Health check passing
- ✅ Ready to process resumes without French responses or truncation

You can now upload resumes via http://localhost:3000 and they should parse correctly in English!

