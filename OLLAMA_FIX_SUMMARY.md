# Ollama Resume Processing Fix - Summary

## Problem

When using Ollama with Resume Matcher, users experienced two critical issues:

1. **Non-English Responses**: The model responded in French (or other languages) instead of producing JSON
   ```
   WARNING:root:LLM call failed (attempt 1): No JSON found in response: Il semble que...
   ```

2. **Prompt Truncation**: Ollama was truncating long prompts at 4096 tokens
   ```
   time=2026-01-15T11:48:53.965Z level=WARN source=runner.go:153 msg="truncating input prompt" 
   limit=4096 prompt=6537 keep=5 new=4096
   ```

## Root Causes

### Language Issue
- Some Ollama models (especially multilingual ones) default to non-English responses based on system locale or training data
- The prompts didn't explicitly enforce English language output
- JSON-only instructions weren't strong enough for local models

### Context Window Issue
- Ollama's default context window is 4096 tokens
- Long resumes (3-4 pages) + prompt template + schema example exceeded this limit
- Truncated prompts resulted in incomplete context and poor outputs

## Solutions Implemented

### 1. Backend Changes (`apps/backend/app/llm.py`)

#### a. Increased Context Window for Ollama
```python
# In complete_json() function
if config.provider == "ollama":
    kwargs["num_ctx"] = 8192  # Double the default 4096
```
- Automatically sets `num_ctx=8192` for all Ollama JSON completions
- Provides sufficient context for long resumes without manual configuration
- No user action required

#### b. Explicit English Language Enforcement
```python
# In complete_json() function
if config.provider == "ollama":
    json_instructions += "\n\nIMPORTANT: Respond in English. Output ONLY a JSON object starting with { and ending with }. Do not include any other text."
```
- Adds explicit English language requirement to system prompts
- Only applies to Ollama (other providers don't have this issue)
- Stronger JSON-only enforcement

### 2. Prompt Template Changes (`apps/backend/app/prompts/templates.py`)

#### Updated Resume Parsing Prompt
```python
PARSE_RESUME_PROMPT = """Parse this resume into JSON. Output ONLY the JSON object, no other text.

IMPORTANT: Respond in English. Output ONLY valid JSON starting with { and ending with }.
# ... rest of prompt
"""
```

#### Updated Keyword Extraction Prompt
```python
EXTRACT_KEYWORDS_PROMPT = """Extract job requirements as JSON. Output ONLY the JSON object, no other text.

IMPORTANT: Respond in English. Output ONLY valid JSON starting with { and ending with }.
# ... rest of prompt
"""
```

### 3. Parser Service Update (`apps/backend/app/services/parser.py`)

```python
result = await complete_json(
    prompt=prompt,
    system_prompt="You are a JSON extraction engine. Respond in English. Output only valid JSON, no explanations.",
)
```
- Added explicit English requirement to system prompt

## Testing & Verification

### Before Fix
```
WARNING:root:LLM call failed (attempt 1): No JSON found in response: Il semble que le document fourni est un curriculum vitae...
WARNING:root:LLM call failed (attempt 2): No JSON found in response: Il semble que vous avez fourni un document...
WARNING:root:LLM call failed (attempt 3): No JSON found in response: Il semble que vous avez fourni un document...
time=2026-01-15T11:48:53.965Z level=WARN source=runner.go:153 msg="truncating input prompt" limit=4096 prompt=6537
```

### Expected After Fix
- No more French responses (English enforced)
- No more truncation warnings (8192 token context)
- Successful JSON parsing on first or second attempt
- Faster resume processing

### Verify It's Working

After applying the fix, you should see:

1. **Healthy backend status:**
   ```bash
   curl http://localhost:8000/api/v1/health | jq
   ```
   Output should show:
   ```json
   {
     "status": "healthy",
     "llm": {
       "healthy": true,
       "provider": "ollama",
       "model": "llama3.2:3b"
     }
   }
   ```

2. **No truncation warnings in Ollama logs:**
   ```bash
   docker logs ollama --tail 20
   ```
   You should NOT see:
   ```
   msg="truncating input prompt" limit=4096
   ```

3. **English JSON responses when parsing resumes:**
   - Upload a resume via the UI
   - Check backend logs: `docker logs resume-matcher-backend --tail 50`
   - Should see successful parsing without French text warnings

## How to Apply the Fix

### For Docker Users

1. Pull the latest code:
   ```bash
   git pull
   ```

2. Rebuild and restart containers:
   ```bash
   docker compose down
   docker compose build
   docker compose up -d
   ```

3. No configuration changes needed - improvements are automatic

### For Local Development Users

1. Pull the latest code:
   ```bash
   git pull
   ```

2. Restart the backend:
   ```bash
   npm run dev
   # or
   npm run dev:backend
   ```

3. No configuration changes needed

## Additional Resources

See `OLLAMA_TROUBLESHOOTING.md` for:
- Detailed setup instructions
- Advanced configuration options
- Performance tuning tips
- Model selection guide
- Docker networking setup
- Common troubleshooting scenarios

## What If Issues Persist?

If you still experience language or truncation issues:

1. **Try a different model:**
   ```bash
   ollama pull llama3.2    # More reliable for English
   ollama pull mistral     # Alternative
   ```

2. **Increase context window further:**
   Edit `apps/backend/app/llm.py`:
   ```python
   if config.provider == "ollama":
       kwargs["num_ctx"] = 16384  # Increase to 16K
   ```
   Then rebuild: `docker compose build`

3. **Check system locale:**
   ```bash
   echo $LANG  # Should show en_US.UTF-8 or similar
   ```

4. **Enable debug logging:**
   Add to `apps/backend/app/main.py`:
   ```python
   import logging
   logging.basicConfig(level=logging.DEBUG)
   ```

5. **Report the issue:**
   - Open a GitHub issue
   - Include: Ollama version, model name, locale, and log snippets

## Technical Details

### Why This Works

1. **Explicit Language Instructions**: LLMs are highly responsive to explicit instructions. By stating "Respond in English" at multiple levels (system prompt, user prompt, retry prompt), we ensure the model prioritizes English output.

2. **Larger Context Window**: Doubling the context window from 4096 to 8192 tokens accommodates:
   - Long resumes (3-4 pages ≈ 2000-3000 tokens)
   - Prompt template (≈ 500 tokens)
   - JSON schema example (≈ 1000 tokens)
   - Safety margin for variations

3. **Provider-Specific Handling**: Only Ollama needs these adjustments. Cloud providers (OpenAI, Anthropic, etc.) have:
   - Larger default context windows (128K+)
   - Built-in JSON mode enforcement
   - Better instruction following

### Performance Impact

- **Memory**: 8192 token context uses ~50% more memory than 4096
  - Still well within typical system resources (8GB+ RAM)
  - Most users won't notice any difference

- **Speed**: Minimal impact on generation speed
  - Context size mainly affects memory, not speed
  - Generation time is dominated by model inference, not context processing

- **Quality**: Improved significantly
  - Models have full context instead of truncated prompts
  - Better understanding leads to better structured outputs

## Files Changed

1. `apps/backend/app/llm.py` - Core LLM wrapper with Ollama-specific handling
2. `apps/backend/app/prompts/templates.py` - Prompt templates with English enforcement
3. `apps/backend/app/services/parser.py` - Parser service system prompt
4. `OLLAMA_TROUBLESHOOTING.md` - New comprehensive troubleshooting guide

## Backward Compatibility

✅ **Fully backward compatible** - No breaking changes:
- Existing configurations work without changes
- Other providers (OpenAI, Anthropic, etc.) unaffected
- API contracts unchanged
- Database schema unchanged

## Future Improvements

Potential enhancements for future releases:

1. **User-configurable context window**: Allow users to adjust `num_ctx` via settings UI
2. **Automatic model detection**: Detect model capabilities and adjust settings automatically
3. **Fallback strategies**: If JSON parsing fails, try simpler extraction methods
4. **Localization support**: Allow non-English prompts for users who prefer local languages
5. **Context window detection**: Query Ollama API for model's actual context window limit

