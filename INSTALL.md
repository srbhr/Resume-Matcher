# Installation Guide

This guide covers setting up Resume Matcher for local development.

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Python | 3.11+ | Required for backend |
| Node.js | 18+ | Required for frontend |
| npm | 9+ | Included with Node.js |
| uv | Latest | Python package manager ([install](https://docs.astral.sh/uv/getting-started/installation/)) |

## Quick Start

```bash
# Clone the repository
git clone https://github.com/srbhr/Resume-Matcher.git
cd Resume-Matcher

# Backend setup
cd apps/backend
cp .env.sample .env
uv sync
uv run uvicorn app.main:app --reload --port 8000

# Frontend setup (new terminal)
cd apps/frontend
npm install
npm run dev
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

---

## Detailed Setup

### 1. Backend Setup

Navigate to the backend directory:

```bash
cd apps/backend
```

Create environment file from sample:

```bash
cp .env.sample .env
```

Edit `.env` and configure your LLM provider (see [Configuration](#configuration) below).

Install dependencies using uv:

```bash
uv sync
```

Start the development server:

```bash
uv run uvicorn app.main:app --reload --port 8000
```

### 2. Frontend Setup

Navigate to the frontend directory:

```bash
cd apps/frontend
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

---

## Configuration

### Backend Environment Variables

Create `apps/backend/.env` with the following variables:

```env
# LLM Provider Configuration
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini
LLM_API_KEY=your-api-key-here
LLM_API_BASE=                    # Optional: for custom endpoints

# Server Configuration (optional)
HOST=0.0.0.0
PORT=8000

# CORS Origins (optional, comma-separated for multiple)
CORS_ORIGINS=["http://localhost:3000"]
```

### Supported LLM Providers

| Provider | LLM_PROVIDER | Example Model | Notes |
|----------|--------------|---------------|-------|
| OpenAI | `openai` | `gpt-4o-mini` | Set `LLM_API_KEY` to your OpenAI key |
| Anthropic | `anthropic` | `claude-3-5-sonnet-20241022` | Set `LLM_API_KEY` to your Anthropic key |
| Google Gemini | `gemini` | `gemini-1.5-flash` | Set `LLM_API_KEY` to your Gemini key |
| OpenRouter | `openrouter` | `anthropic/claude-3.5-sonnet` | Set `LLM_API_KEY` to your OpenRouter key |
| DeepSeek | `deepseek` | `deepseek-chat` | Set `LLM_API_KEY` to your DeepSeek key |
| Ollama | `ollama` | `llama3.2` | Set `LLM_API_BASE` to Ollama URL (default: http://localhost:11434) |

### Using Ollama (Local Models)

1. Install Ollama from [ollama.com](https://ollama.com)

2. Pull a model:
   ```bash
   ollama pull llama3.2
   ```

3. Configure `.env`:
   ```env
   LLM_PROVIDER=ollama
   LLM_MODEL=llama3.2
   LLM_API_BASE=http://localhost:11434
   ```

### Frontend Environment Variables

Create `apps/frontend/.env.local` (optional):

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

This is only needed if your backend runs on a different URL.

---

## Project Structure

```
Resume-Matcher/
├── apps/
│   ├── backend/           # FastAPI backend
│   │   ├── app/
│   │   │   ├── routers/   # API endpoints
│   │   │   ├── services/  # Business logic
│   │   │   ├── schemas/   # Pydantic models
│   │   │   └── prompts/   # LLM prompt templates
│   │   ├── data/          # TinyDB database (auto-created)
│   │   └── pyproject.toml
│   └── frontend/          # Next.js frontend
│       ├── app/           # Next.js app router
│       ├── components/    # React components
│       ├── lib/           # Utilities and API client
│       └── package.json
```

---

## Development Commands

### Backend

```bash
cd apps/backend

# Start development server
uv run uvicorn app.main:app --reload --port 8000

# Run with specific host
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Install dev dependencies
uv sync --group dev

# Run tests
uv run pytest
```

### Frontend

```bash
cd apps/frontend

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Run linter
npm run lint

# Format code
npm run format
```

---

## Troubleshooting

### Backend Issues

**"ModuleNotFoundError" when starting backend**

Ensure you're using uv to run the application:
```bash
uv run uvicorn app.main:app --reload
```

**"API key not configured" error**

Verify your `.env` file has the correct `LLM_API_KEY` set for your provider.

**Database errors**

The database is stored in `apps/backend/data/database.json`. To reset:
```bash
rm -rf apps/backend/data
```

### Frontend Issues

**"ECONNREFUSED" errors**

Ensure the backend is running on port 8000 before starting the frontend.

**Build errors with TypeScript**

Clear the Next.js cache:
```bash
rm -rf apps/frontend/.next
npm run dev
```

### Ollama Issues

**Connection refused to Ollama**

Ensure Ollama is running:
```bash
ollama serve
```

**Model not found**

Pull the model first:
```bash
ollama pull llama3.2
```

---

## Production Deployment

### Backend

```bash
cd apps/backend
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

For production, consider using:
- Gunicorn with uvicorn workers
- Docker container
- Reverse proxy (nginx/caddy)

### Frontend

```bash
cd apps/frontend
npm run build
npm run start
```

Set `NEXT_PUBLIC_API_URL` to your production backend URL.

### CORS Configuration

Update `CORS_ORIGINS` in backend `.env` to include your production domain:

```env
CORS_ORIGINS=["https://your-domain.com", "http://localhost:3000"]
```

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | FastAPI, Python 3.11+ |
| Frontend | Next.js 15, React 19, TypeScript |
| Database | TinyDB (JSON file storage) |
| LLM Integration | LiteLLM (multi-provider support) |
| Styling | Tailwind CSS 4 |
| Package Management | uv (backend), npm (frontend) |
