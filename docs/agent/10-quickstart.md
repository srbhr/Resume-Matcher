# Quickstart Guide

> **Essential commands to build, run, and test Resume Matcher.**

## Prerequisites

- Node.js 18+
- Python 3.11+
- [uv](https://docs.astral.sh/uv/) (Python package manager)

## Installation

```bash
# Install all dependencies (frontend + backend)
npm run install
```

This provisions:

- Frontend: `npm install` in `apps/frontend/`
- Backend: `uv sync` in `apps/backend/`

## Development

```bash
# Start both servers concurrently
npm run dev

# Or run individually:
npm run dev:backend   # FastAPI on :8000
npm run dev:frontend  # Next.js on :3000
```

## Production Builds

```bash
# Build both stacks
npm run build

# Build frontend only
npm run build:frontend
```

## Quality Checks

```bash
# Lint frontend
npm run lint

# Format with Prettier
npm run format
```

## Backend Commands

```bash
cd apps/backend

# Start with auto-reload
uv run uvicorn app.main:app --reload --port 8000

# Run tests (when available)
uv run pytest
```

## Frontend Commands

```bash
cd apps/frontend

# Development with Turbopack
npm run dev

# Production build
npm run build

# Start production server
npm run start
```

## Environment Setup

### Backend

Copy `apps/backend/.env.example` to `apps/backend/.env`:

```bash
cp apps/backend/.env.example apps/backend/.env
```

### Frontend

Copy to `apps/frontend/.env.local`:

```bash
cp apps/frontend/.env.sample apps/frontend/.env.local
```

> **Note**: Only template files (`.example`, `.env.local.example`) belong in Git.

## First-Time Setup Checklist

1. Open <http://localhost:3000/settings>
2. Select your AI provider
3. Enter your API key (or configure Ollama)
4. Click "Save Configuration"
5. Click "Test Connection" to verify it works
6. Return to Dashboard and upload your first resume!

## Related Docs

- [Docker setup](60-docker/docker.md)
- [Docker + Ollama](60-docker/docker-ollama.md)
