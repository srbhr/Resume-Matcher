# Quickstart Guide

> Essential commands to build, run, and test Resume Matcher.

## Prerequisites

- Node.js 18+
- Python 3.11+
- [uv](https://docs.astral.sh/uv/) (Python package manager)

## Installation

```bash
npm run install    # Installs frontend (npm) + backend (uv sync)
```

## Development

```bash
npm run dev           # Start both servers
npm run dev:backend   # FastAPI on :8000
npm run dev:frontend  # Next.js on :3000
```

## Quality Checks

```bash
npm run lint     # Lint frontend
npm run format   # Prettier
```

## Backend Commands

```bash
cd apps/backend
uv run uvicorn app.main:app --reload --port 8000
uv run pytest
```

## Environment Setup

```bash
# Backend
cp apps/backend/.env.example apps/backend/.env

# Frontend
cp apps/frontend/.env.sample apps/frontend/.env.local
```

## First-Time Setup

1. Open http://localhost:3000/settings
2. Select AI provider + enter API key
3. Click "Test Connection"
4. Upload your first resume!
