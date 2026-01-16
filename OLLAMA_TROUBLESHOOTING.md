# Ollama Setup and Troubleshooting Guide

This guide covers setup, configuration, and troubleshooting for using Ollama with Resume Matcher.

## Quick Start

### 1. Install Ollama

Download and install from [ollama.com](https://ollama.com)

### 2. Pull a Model

```bash
# Recommended models for resume processing
ollama pull llama3.2         # Good balance of speed and quality
ollama pull mistral          # Fast and efficient
ollama pull llama3.1:8b      # Larger model, better quality
```

### 3. Configure Resume Matcher

**Via UI (Recommended):**
1. Open http://localhost:3000/settings
2. Select **Ollama** as provider
3. Enter model name (e.g., `llama3.2`)
4. Set Ollama Server URL:
   - Local: `http://localhost:11434`
   - Docker: See [Docker Configuration](#docker-configuration)
5. Click **Save** and **Test Connection**

**Via Environment Variables:**
```env
LLM_PROVIDER=ollama
LLM_MODEL=llama3.2
LLM_API_BASE=http://localhost:11434
# LLM_API_KEY is not required for Ollama
```

## Docker Configuration

When running Resume Matcher in Docker with Ollama on the host:

### Platform-Specific URLs

| Platform | Ollama Server URL |
|----------|------------------|
| **Mac** | `http://host.docker.internal:11434` |
| **Windows** | `http://host.docker.internal:11434` |
| **Linux** | `http://172.17.0.1:11434` (Docker bridge IP) |

### Linux: Finding Your Docker Bridge IP

```bash
# Get the docker bridge IP (usually 172.17.0.1)
ip addr show docker0 | grep -oP '(?<=inet\s)\d+(\.\d+){3}'
```

### Ensure Ollama is Accessible

Ollama binds to `127.0.0.1` by default. For Docker to reach it:

```bash
# Set environment variable before starting Ollama
export OLLAMA_HOST=0.0.0.0:11434
ollama serve
```

Add to your shell profile (`~/.bashrc`, `~/.zshrc`) to make permanent.

## Troubleshooting

### Issue 1: Model Responds in Wrong Language (French, etc.)

**Symptoms:**
```
WARNING:root:LLM call failed (attempt 1): No JSON found in response: Il semble que...
```

**Cause:** Some Ollama models default to non-English responses based on system locale or training data.

**Fix:** This is now handled automatically. The system:
- Adds explicit English language requirements to all prompts
- Uses stronger JSON-only instructions
- Retries with increasingly strict temperature settings

**If it still happens:**
1. Try a different model: `llama3.2` and `mistral` are more reliable for English
2. Check your system locale: `echo $LANG` (should be `en_US.UTF-8` or similar)
3. Update to the latest version of Ollama and Resume Matcher

### Issue 2: Prompt Truncation

**Symptoms:**
```
time=2026-01-15T11:48:53.965Z level=WARN source=runner.go:153 msg="truncating input prompt" 
limit=4096 prompt=6537 keep=5 new=4096
```

**Cause:** Ollama's default context window is 4096 tokens, which can be too small for long resumes.

**Fix:** This is now handled automatically. The system:
- Automatically sets `num_ctx=8192` for all Ollama JSON completions
- Provides 8192 token context window (double the default)

**If you need more context:**
You can modify `apps/backend/app/llm.py`:

```python
# In the complete_json function, change:
if config.provider == "ollama":
    kwargs["num_ctx"] = 16384  # Increase to 16K tokens
```

**Note:** Larger context windows use more memory and are slower. Most resumes work fine with 8192.

### Issue 3: Connection Refused

**Symptoms:**
```
Health check failed (connection refused)
```

**Solutions:**

1. **Ollama not running:**
   ```bash
   ollama serve
   ```

2. **Wrong URL in Docker:**
   - Mac/Windows: Use `http://host.docker.internal:11434`
   - Linux: Use `http://172.17.0.1:11434`

3. **Firewall blocking port 11434:**
   ```bash
   # Linux
   sudo ufw allow 11434
   
   # Check if Ollama is listening
   sudo netstat -tlnp | grep 11434
   ```

4. **Ollama binding to localhost only:**
   ```bash
   export OLLAMA_HOST=0.0.0.0:11434
   ollama serve
   ```

### Issue 4: Slow Response Times

**Symptoms:**
- Requests taking 5-10+ seconds
- High CPU usage

**Solutions:**

1. **Use a smaller model:**
   ```bash
   ollama pull llama3.2    # Smaller, faster
   # Instead of llama3.1:70b
   ```

2. **Enable GPU acceleration:**
   - Ollama automatically uses GPU if available
   - Check GPU usage: `nvidia-smi` (NVIDIA) or `rocm-smi` (AMD)

3. **Increase system resources:**
   - Close other applications
   - Allocate more RAM to Docker (if using Docker)

### Issue 5: Empty or Malformed JSON Responses

**Symptoms:**
```
WARNING:root:JSON parse failed: Expecting value: line 1 column 1 (char 0)
```

**Solutions:**

1. **Model not suitable for JSON:**
   - Use instruction-tuned models: `llama3.2`, `mistral`, `openchat`
   - Avoid base models without instruction tuning

2. **Try different temperature:**
   The system automatically retries with lower temperature (0.1 → 0.0)

3. **Update Ollama:**
   ```bash
   # On Mac/Linux
   curl -fsSL https://ollama.com/install.sh | sh
   
   # Or download from ollama.com
   ```

### Issue 6: Docker Cannot Reach Ollama

**Symptoms:**
```
Health check failed (connection refused)
Error: connect ECONNREFUSED
```

**Solutions:**

1. **Verify Ollama is running:**
   ```bash
   curl http://localhost:11434/api/tags
   ```

2. **Test Docker connectivity:**
   ```bash
   # Mac/Windows
   docker run --rm curlimages/curl http://host.docker.internal:11434/api/tags
   
   # Linux
   docker run --rm curlimages/curl http://172.17.0.1:11434/api/tags
   ```

3. **Check Ollama logs:**
   ```bash
   # If running as service
   journalctl -u ollama -f
   
   # If running manually
   # Check terminal where you ran 'ollama serve'
   ```

## Performance Tips

### Model Selection

| Model | Size | Speed | Quality | Best For |
|-------|------|-------|---------|----------|
| `llama3.2` | ~2GB | ⚡⚡⚡ | ⭐⭐⭐ | General use, fast parsing |
| `mistral` | ~4GB | ⚡⚡ | ⭐⭐⭐ | Balanced speed/quality |
| `llama3.1:8b` | ~5GB | ⚡⚡ | ⭐⭐⭐⭐ | Better quality, still fast |
| `llama3.1:70b` | ~40GB | ⚡ | ⭐⭐⭐⭐⭐ | Best quality, needs GPU |

### Context Window Settings

The application automatically sets optimal context windows:
- **Health checks:** 16 tokens (minimal)
- **Regular completions:** 4096 tokens
- **JSON completions (Ollama):** 8192 tokens

### Memory Usage

Approximate memory requirements:
- 7B models: 8GB RAM minimum
- 13B models: 16GB RAM minimum
- 70B models: 64GB RAM minimum (or GPU with sufficient VRAM)

## Advanced Configuration

### Custom Ollama Options

You can pass additional Ollama-specific options by modifying the backend code:

```python
# apps/backend/app/llm.py, in complete_json()
if config.provider == "ollama":
    kwargs["num_ctx"] = 8192        # Context window
    kwargs["num_predict"] = 4096    # Max tokens to generate
    kwargs["temperature"] = 0.1      # Creativity (0.0-2.0)
    kwargs["top_p"] = 0.9           # Nucleus sampling
    kwargs["top_k"] = 40            # Top-k sampling
```

See [Ollama API documentation](https://github.com/ollama/ollama/blob/main/docs/api.md) for all options.

### Running Ollama in Docker

You can run Ollama as a Docker container alongside Resume Matcher:

```yaml
# docker-compose.yml
services:
  resume-matcher:
    # ... existing config ...
    environment:
      - LLM_PROVIDER=ollama
      - LLM_MODEL=llama3.2
      - LLM_API_BASE=http://ollama:11434
    depends_on:
      - ollama

  ollama:
    image: ollama/ollama:latest
    container_name: ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama
    # For GPU support
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

volumes:
  ollama-data:
```

Then pull models:
```bash
docker exec -it ollama ollama pull llama3.2
```

## Getting Help

If you're still experiencing issues:

1. **Check Ollama logs:**
   ```bash
   # If using systemd
   journalctl -u ollama -f
   
   # If running manually
   # Check terminal output
   ```

2. **Enable debug logging:**
   Add to `apps/backend/app/main.py`:
   ```python
   import logging
   logging.basicConfig(level=logging.DEBUG)
   ```

3. **Test Ollama directly:**
   ```bash
   curl http://localhost:11434/api/generate -d '{
     "model": "llama3.2",
     "prompt": "Say hello in JSON format",
     "stream": false
   }'
   ```

4. **Report issues:**
   - Include Ollama version: `ollama --version`
   - Include model name and size
   - Include relevant log snippets
   - Open an issue on GitHub

## Additional Resources

- [Ollama Official Documentation](https://github.com/ollama/ollama)
- [Ollama Model Library](https://ollama.com/library)
- [Resume Matcher Docker Guide](docs/agent/60-docker/docker-ollama.md)
- [LiteLLM Ollama Provider Docs](https://docs.litellm.ai/docs/providers/ollama)

