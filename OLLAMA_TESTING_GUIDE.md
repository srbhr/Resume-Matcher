# Testing Guide - Ollama Resume Processing Fix

## Overview

This guide helps you test that all the Ollama fixes are working correctly.

## Prerequisites

- Backend and Ollama containers running
- Health check passing: `curl http://localhost:8000/api/v1/health | jq`
- Model configured: `llama3.2:3b`

## Test Scenarios

### Test 1: Health Check ✅

**Expected**: Backend should be healthy

```bash
curl http://localhost:8000/api/v1/health | jq
```

**Expected Output:**
```json
{
  "status": "healthy",
  "llm": {
    "healthy": true,
    "provider": "ollama",
    "model": "llama3.2:3b",
    "response_model": "ollama/llama3.2:3b"
  }
}
```

**✅ Pass Criteria**: `"healthy": true`

---

### Test 2: Resume Upload & Parsing

**Steps:**
1. Open http://localhost:3000
2. Navigate to "Resume Builder" or "Dashboard"
3. Click "Upload Resume"
4. Select a PDF or DOCX file (any language, any length up to 4 pages)
5. Wait for parsing to complete

**Monitor Logs:**
```bash
# Terminal 1: Watch backend logs
docker logs -f resume-matcher-backend

# Terminal 2: Watch Ollama logs
docker logs -f ollama
```

**Expected Behavior:**
- ✅ Resume parses successfully (no 500 error)
- ✅ Resume data appears in the UI
- ✅ Personal info, work experience, education populated
- ✅ NO French text in responses
- ✅ NO truncation warnings in Ollama logs

**Backend logs should show:**
```
INFO: POST /api/v1/resumes/upload HTTP/1.1 200 OK
```

**Backend logs should NOT show:**
```
WARNING:root:LLM call failed
Il semble que...
Resume parsing to JSON failed
```

**Ollama logs should NOT show:**
```
msg="truncating input prompt" limit=4096
```

**✅ Pass Criteria**: Resume appears in dashboard with correct data

---

### Test 3: Resume Improvement / Tailoring

**Steps:**
1. Open http://localhost:3000
2. Navigate to "Tailor Resume" page
3. Select an existing resume
4. Upload or paste a job description
5. Click "Tailor Resume"
6. Wait for processing to complete

**Monitor Logs:**
```bash
docker logs -f resume-matcher-backend
```

**Expected Behavior:**
- ✅ Resume improvement completes successfully
- ✅ Tailored resume shows in preview
- ✅ Improvements list appears
- ✅ NO 500 errors
- ✅ NO "Resume improvement failed" messages

**Backend logs should show:**
```
INFO: POST /api/v1/jobs/upload HTTP/1.1 200 OK
INFO: POST /api/v1/resumes/improve HTTP/1.1 200 OK
```

**Backend logs should NOT show:**
```
Resume improvement failed: ' and ending with '
500 Internal Server Error
```

**✅ Pass Criteria**: Tailored resume displays with improvements

---

### Test 4: Long Resume (Context Window Test)

**Purpose**: Verify that long resumes don't get truncated

**Steps:**
1. Find or create a 3-4 page resume (approximately 2000-3000 words)
2. Upload via the UI
3. Monitor Ollama logs specifically

**Monitor:**
```bash
docker logs -f ollama
```

**Expected Behavior:**
- ✅ Resume parses successfully
- ✅ All sections captured (not just first few)
- ✅ NO truncation warnings

**Ollama logs should NOT show:**
```
level=WARN source=runner.go:153 msg="truncating input prompt" limit=4096 prompt=6537
```

**If you see truncation:**
- Context window is already set to 8192
- If still truncating, resume is > 8192 tokens (very rare)
- See troubleshooting guide for increasing to 16384

**✅ Pass Criteria**: Full resume parsed without truncation warnings

---

### Test 5: Non-English Resume (Language Test)

**Purpose**: Verify that the system still responds in English even for non-English input

**Steps:**
1. Upload a resume in French, Spanish, Chinese, or another language
2. Check that parsing still works
3. Verify the system doesn't respond in that language

**Expected Behavior:**
- ✅ Resume parses successfully
- ✅ Content preserved in original language
- ✅ System messages and structure in English
- ✅ NO errors about language

**✅ Pass Criteria**: Non-English resume parses without French response errors

---

## Common Issues & Quick Fixes

### Issue: 500 Error on Upload
**Check:**
```bash
docker logs resume-matcher-backend --tail 50
```
**Look for:**
- "No JSON found in response" - Model might need more specific instructions
- "connection refused" - Ollama might not be reachable
- "model not found" - Model name mismatch

**Fix:**
```bash
# Verify Ollama connectivity
docker exec resume-matcher-backend curl http://100.121.195.5:11434/api/tags

# Verify model availability
docker exec ollama ollama list

# Restart backend
docker restart resume-matcher-backend
```

### Issue: Empty Resume Data
**Check:** Backend logs for parsing errors

**Possible causes:**
- Resume format not supported (try PDF instead of DOC)
- Resume too short or malformed
- Model timeout

**Fix:**
```bash
# Try a different model
docker exec ollama ollama pull mistral
# Update via UI: http://localhost:3000/settings
```

### Issue: Slow Performance
**Check:** Response times

**Expected times:**
- Resume parsing: 10-30 seconds
- Resume improvement: 15-45 seconds

**If slower:**
- Check CPU usage: `docker stats`
- Check Ollama is using GPU (if available): `nvidia-smi`
- Try smaller model: `llama3.2:1b`

---

## Success Checklist

After running all tests, you should have:

- [ ] Health check passing
- [ ] At least one resume uploaded and parsed successfully
- [ ] Resume data visible in dashboard
- [ ] Resume improvement/tailoring working
- [ ] No French text errors in logs
- [ ] No truncation warnings in Ollama logs
- [ ] No 500 errors during normal operations

## If Tests Fail

### 1. Check Logs
```bash
# Backend errors
docker logs resume-matcher-backend 2>&1 | grep -i error | tail -20

# Ollama errors
docker logs ollama 2>&1 | grep -i error | tail -20
```

### 2. Verify Configuration
```bash
# Check config
docker exec resume-matcher-backend cat /app/backend/data/config.json | jq

# Expected:
# - provider: "ollama"
# - model: "llama3.2:3b" (or another installed model)
# - api_base: "http://100.121.195.5:11434"
```

### 3. Test Ollama Directly
```bash
# Test Ollama is responding
curl http://100.121.195.5:11434/api/generate -d '{
  "model": "llama3.2:3b",
  "prompt": "Output this in JSON format: {\"name\": \"Test\"}",
  "stream": false
}' | jq '.response'
```

### 4. Enable Debug Logging
Add to `apps/backend/app/main.py`:
```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

Then rebuild and restart:
```bash
docker compose build resume-matcher-backend
docker restart resume-matcher-backend
```

### 5. Try Different Model
```bash
# Pull alternative model
docker exec ollama ollama pull mistral

# Update config via UI
# Go to http://localhost:3000/settings
# Change model to: mistral
# Save and test
```

### 6. Report Issue
If none of the above works, gather this information:

```bash
# System info
docker --version
docker exec ollama ollama --version

# Current config
docker exec resume-matcher-backend cat /app/backend/data/config.json | jq

# Available models
docker exec ollama ollama list

# Recent errors
docker logs resume-matcher-backend 2>&1 | grep -E "(ERROR|WARNING)" | tail -20
docker logs ollama 2>&1 | grep -E "(ERROR|WARN)" | tail -20
```

Then open a GitHub issue with this information.

---

## Performance Benchmarks

For reference, here are typical performance metrics:

### llama3.2:3b (Current)
- **Context window**: 8192 tokens
- **Resume parsing**: 10-20 seconds
- **Resume improvement**: 20-40 seconds
- **Memory usage**: 3-4 GB RAM
- **Model size**: 2.0 GB

### Comparison with Other Models

| Model | Parse Time | Improve Time | Memory | Quality |
|-------|-----------|--------------|--------|---------|
| llama3.2:1b | 5-10s | 10-20s | 2 GB | ⭐⭐ |
| llama3.2:3b ⭐ | 10-20s | 20-40s | 3-4 GB | ⭐⭐⭐ |
| mistral | 15-25s | 30-50s | 5-6 GB | ⭐⭐⭐⭐ |
| llama3.1:8b | 20-35s | 40-70s | 7-8 GB | ⭐⭐⭐⭐ |

---

## Next Steps After Successful Tests

1. **Add more models** (optional):
   ```bash
   docker exec ollama ollama pull mistral
   docker exec ollama ollama pull llama3.1:8b
   ```

2. **Configure backup provider** (recommended):
   - Add an API key for OpenAI or Anthropic
   - Use as fallback if Ollama has issues

3. **Monitor performance**:
   - Keep an eye on response times
   - Watch for memory usage spikes
   - Check disk space for Ollama models

4. **Regular updates**:
   ```bash
   # Update Ollama
   docker pull ollama/ollama:latest
   docker restart ollama
   
   # Update models
   docker exec ollama ollama pull llama3.2:3b
   ```

---

**Testing completed successfully?** You're all set! 🎉

See `OLLAMA_FIX_COMPLETE.md` for more details on what was fixed.

