# Resume Matcher Setup Guide

[**English**](SETUP.md) | [Español](SETUP.es.md) | [简体中文](SETUP.zh-CN.md) | [日本語](SETUP.ja.md)

Welcome! This guide will walk you through setting up Resume Matcher on your local machine. Whether you're a developer looking to contribute or someone who wants to run the application locally, this guide has you covered.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Step-by-Step Setup](#step-by-step-setup)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Backend Setup](#2-backend-setup)
  - [3. Frontend Setup](#3-frontend-setup)
- [Configuring Your AI Provider](#configuring-your-ai-provider)
  - [Option A: Cloud Providers](#option-a-cloud-providers)
  - [Option B: Local AI with Ollama](#option-b-local-ai-with-ollama-free)
- [Docker Deployment](#docker-deployment)
- [Accessing the Application](#accessing-the-application)
- [Common Commands Reference](#common-commands-reference)
- [Troubleshooting](#troubleshooting)
- [Project Structure Overview](#project-structure-overview)
- [Getting Help](#getting-help)

---

## Prerequisites

Before you begin, make sure you have the following installed on your system:

| Tool | Minimum Version | How to Check | Installation |
|------|-----------------|--------------|--------------|
| **Python** | 3.13+ | `python --version` | [python.org](https://python.org) |
| **Node.js** | 22+ | `node --version` | [nodejs.org](https://nodejs.org) |
| **npm** | 10+ | `npm --version` | Comes with Node.js |
| **uv** | Latest | `uv --version` | [astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/) |
| **Git** | Any | `git --version` | [git-scm.com](https://git-scm.com) |

### Installing uv (Python Package Manager)

Resume Matcher uses `uv` for fast, reliable Python dependency management. Install it with:

```bash
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows (PowerShell)
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"

# Or via pip
pip install uv
```

---

## Quick Start

If you're familiar with development tools and want to get running quickly:

```bash
# 1. Clone the repository
git clone https://github.com/srbhr/Resume-Matcher.git
cd Resume-Matcher

# 2. Start the backend (Terminal 1)
cd apps/backend
cp .env.example .env        # Create config from template
uv sync                      # Install Python dependencies
uv run uvicorn app.main:app --reload --port 8000

# 3. Start the frontend (Terminal 2)
cd apps/frontend
npm install                  # Install Node.js dependencies
npm run dev                  # Start the dev server
```

Open your browser to **<http://localhost:3000>** and you're ready to go!

> **Note:** You'll need to configure an AI provider before using the app. See [Configuring Your AI Provider](#configuring-your-ai-provider) below.

---

## Step-by-Step Setup

### 1. Clone the Repository

First, get the code on your machine:

```bash
git clone https://github.com/srbhr/Resume-Matcher.git
cd Resume-Matcher
```

### 2. Backend Setup

The backend is a Python FastAPI application that handles AI processing, resume parsing, and data storage.

#### Navigate to the backend directory

```bash
cd apps/backend
```

#### Create your environment file

```bash
cp .env.example .env
```

#### Edit the `.env` file with your preferred text editor

```bash
# macOS/Linux
nano .env

# Or use any editor you prefer
code .env   # VS Code
```

The most important setting is your AI provider. Here's a minimal configuration for OpenAI:

```env
LLM_PROVIDER=openai
LLM_MODEL=gpt-5-nano-2025-08-07
LLM_API_KEY=sk-your-api-key-here

# Keep these as default for local development
HOST=0.0.0.0
PORT=8000
FRONTEND_BASE_URL=http://localhost:3000
CORS_ORIGINS=["http://localhost:3000", "http://127.0.0.1:3000"]
```

#### Install Python dependencies

```bash
uv sync
```

This creates a virtual environment and installs all required packages.

#### Start the backend server

```bash
uv run uvicorn app.main:app --reload --port 8000
```

You should see output like:

```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
```

**Keep this terminal running** and open a new terminal for the frontend.

### 3. Frontend Setup

The frontend is a Next.js application that provides the user interface.

#### Navigate to the frontend directory

```bash
cd apps/frontend
```

#### (Optional) Create a frontend environment file

This is only needed if your backend runs on a different port:

```bash
cp .env.sample .env.local
```

#### Install Node.js dependencies

```bash
npm install
```

#### Start the development server

```bash
npm run dev
```

You should see:

```
▲ Next.js 16.x.x (Turbopack)
- Local:        http://localhost:3000
```

Open **<http://localhost:3000>** in your browser. You should see the Resume Matcher dashboard!

---

## Configuring Your AI Provider

Resume Matcher supports multiple AI providers. You can configure your provider through the Settings page in the app, or by editing the backend `.env` file.

### Option A: Cloud Providers

| Provider | Configuration | Get API Key |
|----------|--------------|-------------|
| **OpenAI** | `LLM_PROVIDER=openai`<br>`LLM_MODEL=gpt-5-nano-2025-08-07` | [platform.openai.com](https://platform.openai.com/api-keys) |
| **Anthropic** | `LLM_PROVIDER=anthropic`<br>`LLM_MODEL=claude-haiku-4-5-20251001` | [console.anthropic.com](https://console.anthropic.com/) |
| **Google Gemini** | `LLM_PROVIDER=gemini`<br>`LLM_MODEL=gemini-3-flash-preview` | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| **OpenRouter** | `LLM_PROVIDER=openrouter`<br>`LLM_MODEL=deepseek/deepseek-v3.2` | [openrouter.ai](https://openrouter.ai/keys) |
| **DeepSeek** | `LLM_PROVIDER=deepseek`<br>`LLM_MODEL=deepseek-v3.2` | [platform.deepseek.com](https://platform.deepseek.com/) |

Example `.env` for Anthropic:

```env
LLM_PROVIDER=anthropic
LLM_MODEL=claude-haiku-4-5-20251001
LLM_API_KEY=sk-ant-your-key-here
```

### Option B: Local AI with Ollama (Free)

Want to run AI models locally without API costs? Use Ollama!

#### Step 1: Install Ollama

Download and install from [ollama.com](https://ollama.com)

#### Step 2: Pull a model

```bash
ollama pull gemma3:4b
```

Other good options: `llama3.2`, `mistral`, `codellama`, `neural-chat`

#### Step 3: Configure your `.env`

```env
LLM_PROVIDER=ollama
LLM_MODEL=gemma3:4b
LLM_API_BASE=http://localhost:11434
# LLM_API_KEY is not needed for Ollama
```

#### Step 4: Make sure Ollama is running

```bash
ollama serve
```

Ollama typically starts automatically after installation.

---

## Docker Deployment

Prefer containerized deployment? Resume Matcher includes Docker support.

### Quick Start with Docker Compose

```bash
# Build and start the containers
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the containers
docker-compose down
```

### Customizing Ports

By default, Resume Matcher runs on ports 3000 (frontend) and 8000 (backend). To use different ports:

**Option 1: Environment Variables**

```bash
# Run on ports 4000 and 9000
FRONTEND_PORT=4000 BACKEND_PORT=9000 docker-compose up -d
```

**Option 2: Create a `.env` file**

```bash
# Copy the example file
cp .env.example .env

# Edit with your preferred ports
nano .env
```

Example `.env` file:

```env
FRONTEND_PORT=4000
BACKEND_PORT=9000
LLM_PROVIDER=openai
LLM_API_KEY=sk-your-key-here
```

### Configuration Options

| Variable | Default | Description |
|----------|---------|-------------|
| `FRONTEND_PORT` | `3000` | Host port for the web interface |
| `BACKEND_PORT` | `8000` | Host port for the API |
| `LLM_PROVIDER` | `openai` | AI provider (openai, anthropic, gemini, etc.) |
| `LLM_MODEL` | — | Model to use (configured via Settings UI) |
| `LLM_API_KEY` | — | API key (recommended: configure via Settings UI) |
| `LLM_API_BASE` | — | Custom API endpoint (for Ollama or proxies) |

### Using Ollama with Docker

To use Ollama running on your host machine:

```bash
LLM_API_BASE=http://host.docker.internal:11434 docker-compose up -d
```

Then configure Ollama as your provider in the Settings UI.

### Important Notes

- **API keys are best configured through the UI** at `http://localhost:3000/settings`
- Data is persisted in a Docker volume (`resume-data`)
- The Settings UI configuration is stored in the volume and persists across restarts



## Accessing the Application

Once both servers are running, open your browser:

| URL | Description |
|-----|-------------|
| **<http://localhost:3000>** | Main application (Dashboard) |
| **<http://localhost:3000/settings>** | Configure AI provider |
| **<http://localhost:8000>** | Backend API root |
| **<http://localhost:8000/docs>** | Interactive API documentation |
| **<http://localhost:8000/health>** | Backend health check |

### First-Time Setup Checklist

1. Open <http://localhost:3000/settings>
2. Select your AI provider
3. Enter your API key (or configure Ollama)
4. Click "Save Configuration"
5. Click "Test Connection" to verify it works
6. Return to Dashboard and upload your first resume!

---

## Common Commands Reference

### Backend Commands

```bash
cd apps/backend

# Start development server (with auto-reload)
uv run uvicorn app.main:app --reload --port 8000

# Start production server
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000

# Install dependencies
uv sync

# Install with dev dependencies (for testing)
uv sync --group dev

# Run tests
uv run pytest

# Check if database needs reset (stored as JSON files)
ls -la data/
```

### Frontend Commands

```bash
cd apps/frontend

# Start development server (with Turbopack for fast refresh)
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Run linter
npm run lint

# Format code with Prettier
npm run format

# Run on a different port
npm run dev -- -p 3001
```

### Database Management

Resume Matcher uses TinyDB (JSON file storage). All data is in `apps/backend/data/`:

```bash
# View database files
ls apps/backend/data/

# Backup your data
cp -r apps/backend/data apps/backend/data-backup

# Reset everything (start fresh)
rm -rf apps/backend/data
```

---

## Troubleshooting

### Backend won't start

**Error:** `ModuleNotFoundError`

Make sure you're running with `uv`:

```bash
uv run uvicorn app.main:app --reload
```

**Error:** `LLM_API_KEY not configured`

Check your `.env` file has a valid API key for your chosen provider.

### Frontend won't start

**Error:** `ECONNREFUSED` when loading pages

The backend isn't running. Start it first:

```bash
cd apps/backend && uv run uvicorn app.main:app --reload
```

**Error:** Build or TypeScript errors

Clear the Next.js cache:

```bash
rm -rf apps/frontend/.next
npm run dev
```

### PDF Download fails

**Error:** `Cannot connect to frontend for PDF generation`

Your backend can't reach the frontend. Check:

1. Frontend is running
2. `FRONTEND_BASE_URL` in `.env` matches your frontend URL
3. `CORS_ORIGINS` includes your frontend URL

If frontend runs on port 3001:

```env
FRONTEND_BASE_URL=http://localhost:3001
CORS_ORIGINS=["http://localhost:3001", "http://127.0.0.1:3001"]
```

### Ollama connection fails

**Error:** `Connection refused to localhost:11434`

1. Check Ollama is running: `ollama list`
2. Start Ollama if needed: `ollama serve`
3. Make sure the model is downloaded: `ollama pull gemma3:4b`

---

## Project Structure Overview

```
Resume-Matcher/
├── apps/
│   ├── backend/                 # Python FastAPI backend
│   │   ├── app/
│   │   │   ├── main.py          # Application entry point
│   │   │   ├── config.py        # Environment configuration
│   │   │   ├── database.py      # TinyDB wrapper
│   │   │   ├── llm.py           # AI provider integration
│   │   │   ├── routers/         # API endpoints
│   │   │   ├── services/        # Business logic
│   │   │   ├── schemas/         # Data models
│   │   │   └── prompts/         # LLM prompt templates
│   │   ├── data/                # Database storage (auto-created)
│   │   ├── .env.example         # Environment template
│   │   └── pyproject.toml       # Python dependencies
│   │
│   └── frontend/                # Next.js React frontend
│       ├── app/                 # Pages (dashboard, builder, etc.)
│       ├── components/          # Reusable React components
│       ├── lib/                 # Utilities and API client
│       ├── .env.sample          # Environment template
│       └── package.json         # Node.js dependencies
│
├── docs/                        # Additional documentation
├── docker-compose.yml           # Docker configuration
├── Dockerfile                   # Container build instructions
└── README.md                    # Project overview
```

---

## Getting Help

Stuck? Here are your options:

- **Discord Community:** [dsc.gg/resume-matcher](https://dsc.gg/resume-matcher) - Active community for questions and discussions
- **GitHub Issues:** [Open an issue](https://github.com/srbhr/Resume-Matcher/issues) for bugs or feature requests
- **Documentation:** Check the [docs/agent/](docs/agent/) folder for detailed guides

### Useful Documentation

| Document | Description |
|----------|-------------|
| [backend-guide.md](docs/agent/architecture/backend-guide.md) | Backend architecture and API details |
| [frontend-workflow.md](docs/agent/architecture/frontend-workflow.md) | User flow and component architecture |
| [style-guide.md](docs/agent/design/style-guide.md) | UI design system (Swiss International Style) |

---

Happy resume building! If you find Resume Matcher helpful, consider [starring the repo](https://github.com/srbhr/Resume-Matcher) and [joining our Discord](https://dsc.gg/resume-matcher).
