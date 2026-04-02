# Quickstart Guide

> Essential commands to build, run, and test Resume Matcher.

## Prerequisites

- Node.js 22+
- Python 3.13+
- [uv](https://docs.astral.sh/uv/) (Python package manager)

## Installation

```bash
# Backend (from repo root)
cd apps/backend
uv sync

# Frontend (from repo root)
cd apps/frontend
npm install
```

## Development

```bash
# Backend (Terminal 1, from repo root)
cd apps/backend
uv run uvicorn app.main:app --reload --port 8000

# Frontend (Terminal 2, from repo root)
cd apps/frontend
npm run dev
```

## Quality Checks

```bash
# From apps/frontend
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
