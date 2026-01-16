# Docker + Ollama Setup Guide

This guide explains how to use Resume Matcher with Ollama when running in Docker.

## The Problem

When running Resume Matcher in Docker, you might encounter these errors:

- **Health check**: "API key not configured"
- **Settings page**: "Invalid LLM configuration" when trying to save Ollama settings

This happens because of Docker networking: `localhost` inside a container refers to the container itself, not your host machine where Ollama is running.

## Prerequisites

1. **Ollama installed on your host machine**: [ollama.com](https://ollama.com)
2. **Docker or Docker Compose**: [docker.com](https://docker.com)
3. **A model pulled in Ollama**: `ollama pull llama3.2`

## Quick Fix

The solution is to use the correct URL to reach your host machine from inside Docker:

| Platform | Ollama Server URL |
|----------|------------------|
| **Docker Desktop (Mac/Windows)** | `http://host.docker.internal:11434` |
| **Linux (default bridge network)** | `http://172.17.0.1:11434` |
| **Linux (host network mode)** | `http://localhost:11434` |

## Setup Instructions

### Option 1: Configure via UI (Recommended)

1. Start the container:
   ```bash
   docker-compose up -d
   ```

2. Open http://localhost:3000/settings

3. Configure LLM settings:
   - **Provider**: Select `Ollama`
   - **Model**: Enter your model name (e.g., `llama3.2`, `mistral`, `codellama`)
   - **Ollama Server URL**: Enter the correct URL for your platform (see table above)

4. Click **Save**, then **Test Connection**

### Option 2: Configure via Environment Variables

Add environment variables to `docker-compose.yml`:

```yaml
services:
  resume-matcher:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: resume-matcher
    ports:
      - "3000:3000"
      - "8000:8000"
    restart: unless-stopped
      - NODE_ENV=production
      - NEXT_PUBLIC_API_URL=http://localhost:8000
      # Ollama configuration (Mac/Windows)
For Linux users, replace `host.docker.internal` with your host's IP or use host network mode.
```

Then restart:

```bash
docker compose down
docker compose up -d
```

### Option 3: Linux Host Network Mode

On Linux, you can use host network mode to allow the container to access `localhost` directly:

```yaml
services:
  resume-matcher:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: resume-matcher
    network_mode: host  # Container shares host's network
    volumes:
      - resume-data:/app/backend/data
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_API_URL=http://localhost:8000
      - LLM_PROVIDER=ollama
      - LLM_MODEL=llama3.2
      - LLM_API_BASE=http://localhost:11434
    restart: unless-stopped
```

> **Note**: With `network_mode: host`, you don't need to specify ports - the container uses the host's network directly.

### Option 4: Run Ollama in Docker Too

You can run Ollama as a Docker container alongside Resume Matcher:

```yaml
services:
  resume-matcher:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: resume-matcher
    ports:
      - "3000:3000"
      - "8000:8000"
    volumes:
      - resume-data:/app/backend/data
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_API_URL=http://localhost:8000
      - LLM_PROVIDER=ollama
      - LLM_MODEL=llama3.2
      - LLM_API_BASE=http://ollama:11434
    depends_on:
      - ollama
    restart: unless-stopped

  ollama:
    image: ollama/ollama:latest
    container_name: ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama
    restart: unless-stopped

volumes:
  resume-data:
    driver: local
  ollama-data:
    driver: local
```

After starting, pull a model:

```bash
docker exec -it ollama ollama pull llama3.2
```

## Troubleshooting

### "Invalid LLM configuration" Error

1. **Check Ollama is running**:
   ```bash
   # On your host machine
   curl http://localhost:11434/api/tags
   ```
   Should return a list of installed models.

2. **Check Docker can reach Ollama**:
   ```bash
   # From inside the container
   docker exec -it resume-matcher curl http://host.docker.internal:11434/api/tags
   ```

3. **Check your model exists**:
   ```bash
   ollama list
   ```
   Make sure the model name in settings matches exactly.

### "API key not configured" on Startup

This is expected before configuration. The default provider is OpenAI (which requires an API key). Once you configure Ollama via the Settings page, this error will resolve.

### Connection Refused

If you get "connection refused":

1. **Ollama not running**: Start Ollama with `ollama serve`
2. **Firewall blocking**: Ensure port 11434 is accessible
3. **Wrong URL**: Double-check the Ollama Server URL for your platform

### Linux: Finding Your Host IP

If `host.docker.internal` doesn't work on Linux:

```bash
# Get the docker bridge IP (usually 172.17.0.1)
ip addr show docker0 | grep -oP '(?<=inet\s)\d+(\.\d+){3}'

# Or get your machine's IP
hostname -I | awk '{print $1}'
```

Use this IP in the Ollama Server URL: `http://172.17.0.1:11434`

### Ollama Binding to Localhost Only

By default, Ollama only listens on `127.0.0.1`. For Docker to reach it, you may need to set:

```bash
# On your host, set this environment variable before starting Ollama
export OLLAMA_HOST=0.0.0.0:11434
ollama serve
```

Or add it to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.).

## Recommended Models

| Model | Size | Best For |
|-------|------|----------|
| `llama3.2` | 3B | General use, fast responses |
| `llama3.2:70b` | 70B | High quality, slower (needs 64GB+ RAM) |
| `mistral` | 7B | Good balance of speed and quality |
| `codellama` | 7B | Code-related tasks |
| `gemma2` | 9B | Google's efficient model |

Pull models with:

```bash
ollama pull llama3.2
```

## Performance Tips

1. **GPU Acceleration**: Ollama automatically uses GPU if available (NVIDIA, Apple Silicon)
2. **Memory**: Larger models need more RAM (7B ~= 8GB, 70B ~= 64GB)
3. **First Request**: First request after pulling a model is slower (model loading)
4. **Keep Ollama Running**: Model stays in memory for faster subsequent requests

## See Also

- [Docker Deployment Guide](docker.md) - General Docker setup
- [Backend Guide](backend-guide.md) - LLM configuration details
- [Ollama Documentation](https://github.com/ollama/ollama/blob/main/docs/README.md)
