# Docker Deployment Guide

This guide explains how to run Resume Matcher using Docker.

## Quick Start

### Using Docker Compose (Recommended)

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Using Docker Directly

```bash
# Build the image
docker build -t resume-matcher .

# Run the container
docker run -d \
  --name resume-matcher \
  -p 3000:3000 \
  -p 8000:8000 \
  -v resume-data:/app/backend/data \
  resume-matcher
```

## Accessing the Application

Once running, access the application at:

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

## Initial Setup

### Configuring Your LLM Provider

Unlike local development, Docker deployments don't use `.env` files. Instead, configure your AI provider through the UI:

1. Open http://localhost:3000/settings
2. In the **LLM Configuration** section:
   - Select your provider (OpenAI, Anthropic, etc.)
   - Enter the model name (or use the default)
   - Enter your API key
3. Click **Save**
4. Click **Test Connection** to verify

Your configuration is stored in `config.json` inside the persistent volume.

### Using Ollama (Local Models)

Running Ollama with Docker requires special networking configuration. See the **[Docker + Ollama Guide](docker-ollama.md)** for detailed setup instructions.

**Quick summary**: Use `http://host.docker.internal:11434` (Mac/Windows) or `http://172.17.0.1:11434` (Linux) as the Ollama Server URL instead of `localhost`.

## Data Persistence

All application data is stored in a Docker volume at `/app/backend/data/`:

| File | Purpose |
|------|---------|
| `database.json` | TinyDB database (resumes, jobs, improvements) |
| `config.json` | API keys and application settings |
| `uploads/` | Uploaded resume files |

### Backup Data

```bash
# Copy data from container
docker cp resume-matcher:/app/backend/data ./backup

# Or with docker-compose
docker-compose cp resume-matcher:/app/backend/data ./backup
```

### Restore Data

```bash
# Copy data to container
docker cp ./backup/. resume-matcher:/app/backend/data/

# Restart to pick up changes
docker-compose restart
```

## Environment Variables

While API keys should be set via UI, you can override some settings:

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend URL for frontend |
| `NODE_ENV` | `production` | Node environment |

Example with environment override:

```bash
docker run -d \
  --name resume-matcher \
  -p 3000:3000 \
  -p 8000:8000 \
  -e NEXT_PUBLIC_API_URL=http://your-backend:8000 \
  -v resume-data:/app/backend/data \
  resume-matcher
```

## Troubleshooting

### Container Won't Start

Check logs for errors:

```bash
docker-compose logs resume-matcher
# or
docker logs resume-matcher
```

### Playwright/PDF Issues

Playwright and Chromium are pre-installed. If you see PDF generation errors:

```bash
# Enter container
docker exec -it resume-matcher bash

# Reinstall Playwright browsers
cd /app/backend && python -m playwright install chromium
```

### Permission Denied

The container runs as non-root user `appuser`. If you have permission issues with mounted volumes:

```bash
# Fix permissions on host
sudo chown -R 1000:1000 ./data
```

### Health Check Failing

Check if both services are running:

```bash
# Backend health
curl http://localhost:8000/api/v1/health

# Frontend (should return HTML)
curl http://localhost:3000
```

## Building Custom Image

Modify the Dockerfile as needed, then rebuild:

```bash
# Rebuild without cache
docker-compose build --no-cache

# Rebuild specific service
docker-compose build resume-matcher
```

## Resource Requirements

Minimum recommended resources:

- **CPU**: 2 cores
- **RAM**: 2 GB
- **Disk**: 5 GB (mostly for Chromium)

## Security Notes

1. **API Keys**: Stored in `config.json` inside the container volume. Not accessible without volume access.
2. **Non-root User**: Container runs as unprivileged user `appuser` (UID 1000).
3. **Network**: Only ports 3000 and 8000 are exposed.
4. **No Secrets in Image**: All sensitive configuration is done at runtime via UI.

## Updating

```bash
# Pull latest code
git pull

# Rebuild and restart
docker-compose down
docker-compose build
docker-compose up -d
```

## Uninstalling

```bash
# Stop and remove container
docker-compose down

# Remove volume (WARNING: deletes all data)
docker volume rm resume-matcher_resume-data

# Remove image
docker rmi resume-matcher
```
