# Resume Matcher Setup Guide

[**English**](SETUP.md) | [Español](SETUP.es.md) | [简体中文](SETUP.zh-CN.md) | [日本語](SETUP.ja.md)

Welcome! This guide will walk you through setting up Resume Matcher on your local machine. Whether you're a developer looking to contribute or someone who wants to run the application locally, this guide has you covered.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Windows 11 Setup](#windows-11-setup)
- [Step-by-Step Setup](#step-by-step-setup)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Backend Setup](#2-backend-setup)
  - [3. Frontend Setup](#3-frontend-setup)
- [Configuring Your AI Provider](#configuring-your-ai-provider)
  - [Option A: Cloud Providers](#option-a-cloud-providers)
  - [Option B: Local AI with Ollama](#option-b-local-ai-with-ollama-free)
  - [Option C: Your ChatGPT plan (Sign in with ChatGPT)](#option-c-your-chatgpt-plan-sign-in-with-chatgpt)
- [Docker Deployment](#docker-deployment)
- [Accessing the Application](#accessing-the-application)
- [Use Resume Matcher from Claude Code or Claude Desktop (MCP)](#use-resume-matcher-from-claude-code-or-claude-desktop-mcp)
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
| **Node.js** | 24+ | `node --version` | [nodejs.org](https://nodejs.org) |
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
uv run app

# 3. Start the frontend (Terminal 2)
cd apps/frontend
npm install                  # Install Node.js dependencies
npm run dev                  # Start the dev server
```

Open your browser to **<http://localhost:3000>** and you're ready to go!

> **Note:** You'll need to configure an AI provider before using the app. See [Configuring Your AI Provider](#configuring-your-ai-provider) below.

---

## Windows 11 Setup

The commands above and in the rest of this guide use macOS/Linux shell syntax. On Windows 11, use the **PowerShell** (or Windows Terminal) commands in this section instead.

### 1. Install the prerequisites

Install the tools from [Prerequisites](#prerequisites) with `winget` (built into Windows 11), then **close and reopen PowerShell** so they are on your `PATH`:

```powershell
winget install --id Git.Git -e
winget install --id Python.Python.3.13 -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id astral-sh.uv -e
```

You can also use the installers from the links in the [Prerequisites](#prerequisites) table.

### 2. Download the code

Either clone with Git:

```powershell
git clone https://github.com/srbhr/Resume-Matcher.git
cd Resume-Matcher
```

Or, without Git, open the [repository page](https://github.com/srbhr/Resume-Matcher), click **Code → Download ZIP**, extract the ZIP, and `cd` into the extracted folder in PowerShell.

### 3. Start the backend (PowerShell window 1)

```powershell
cd apps\backend
Copy-Item .env.example .env   # Create config from template
notepad .env                  # Edit the config (see below)
uv sync                       # Install Python dependencies
uv run app
```

Keep `HOST=127.0.0.1` in `.env` so the backend is only reachable from your own machine: the API has no authentication. Optionally set your AI provider here, and set `RELOAD=true` to auto-reload on code changes.

### 4. Start the frontend (PowerShell window 2)

A new PowerShell window opens in your home folder, so first change to the folder where you cloned or extracted Resume Matcher (replace the path with your own):

```powershell
cd C:\path\to\Resume-Matcher
cd apps\frontend
npm install
npm run dev
```

Open **<http://localhost:3000>** in your browser.

> **PDF export:** Resume Matcher renders PDFs with headless Chromium. If Playwright's browser is not installed, the backend falls back to an installed Microsoft Edge or Google Chrome (Edge ships with Windows 11). You can also install Playwright's Chromium from `apps\backend` with `uv run playwright install chromium`.

> **Prefer Docker?** Install [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/) and follow [Docker Deployment](#docker-deployment). To set variables like `PORT` in PowerShell, use `$env:PORT="4000"; docker compose up -d`. For the [optional PostgreSQL setup](#optional-postgresql), run `$env:POSTGRES_PASSWORD=[guid]::NewGuid().ToString('N'); docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d`; outside Docker, set `DATABASE_URL` in `apps\backend\.env`.

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
HOST=127.0.0.1
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
RELOAD=true uv run app
```

You should see output like:

```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
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
| **Azure AI Foundry** | `LLM_PROVIDER=azure_foundry`<br>`LLM_MODEL=mistral-large-latest`<br>`LLM_API_BASE=https://<resource>.services.ai.azure.com/models`<br>For Foundry-hosted Azure OpenAI GPT deployments, use the service root or the full `/openai/v1/responses` endpoint from Foundry. | Azure AI Foundry endpoint/key |
| **Anthropic** | `LLM_PROVIDER=anthropic`<br>`LLM_MODEL=claude-haiku-4-5-20251001` | [console.anthropic.com](https://console.anthropic.com/) |
| **Google Gemini** | `LLM_PROVIDER=gemini`<br>`LLM_MODEL=gemini/gemini-3-flash-preview` | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| **OpenRouter** | `LLM_PROVIDER=openrouter`<br>`LLM_MODEL=deepseek/deepseek-chat` | [openrouter.ai](https://openrouter.ai/keys) |
| **Cheaper Inference** | `LLM_PROVIDER=cheaperinference`<br>`LLM_MODEL=gpt-5.4-mini` | [cheaperinference.com](https://cheaperinference.com/signup) |
| **DeepSeek** | `LLM_PROVIDER=deepseek`<br>`LLM_MODEL=deepseek-chat` | [platform.deepseek.com](https://platform.deepseek.com/) |
| **OpenAI-Compatible** | `LLM_PROVIDER=openai_compatible`<br>`LLM_MODEL=llama-3.1-8b`<br>`LLM_API_BASE=http://localhost:8080/v1` | — (local) |

**OpenAI-Compatible** targets any local server that exposes the OpenAI Chat Completions API — llama.cpp, vLLM, LM Studio, etc. API key is optional.

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

### Option C: Your ChatGPT plan (Sign in with ChatGPT)

A community-built provider that uses OpenAI's official [Sign in with ChatGPT for open-source apps](https://developers.openai.com/siwc/token-sharing-open-source) (a preview, so it may change). It works with ChatGPT Plus and Pro, needs no API key, and sends requests from your machine straight to OpenAI's Responses API. Usage counts toward your ChatGPT plan's limits: on Plus, the five-hour limit is shared with your other apps that use your plan; Pro has no five-hour limit. For guaranteed access, use an OpenAI API key instead.

1. Start the backend and frontend, then open **Settings** in a browser **on the same machine as the backend**.
2. Choose **ChatGPT plan** and click **Continue with ChatGPT**.
3. Sign in at OpenAI and allow Resume Matcher to use your ChatGPT plan. The first time, OpenAI registers the app for your account; later sign-ins reuse that registration.
4. You return to Settings. Pick one of your account's models and click **Save**.

OpenAI sends the browser back to `http://127.0.0.1:<port>/auth/callback`, where `<port>` is the port you opened Resume Matcher on (`3000` by default). The frontend forwards that path to the backend, and the backend accepts the callback only from the machine it runs on. So the browser must run on the machine that runs Resume Matcher, and you must open it as `http://localhost:<port>` or `http://127.0.0.1:<port>`. Tokens are stored encrypted in the backend data directory (`chatgpt_credentials.enc`). **Disconnect** revokes the session at OpenAI and deletes the tokens; **Manage usage** opens your ChatGPT usage settings.

**Docker:** sign-in works with the default setup, which publishes only port 3000: open Resume Matcher at `http://localhost:3000` (or the `PORT` you published) on the machine that runs the container. OpenAI returns the browser to that same port, and the frontend forwards `/auth/callback` to the backend inside the container. It does not work from another computer or through a reverse-proxy domain, because OpenAI only allows `http://127.0.0.1` redirects.

The equivalent `.env` (you still sign in from Settings):

```env
LLM_PROVIDER=chatgpt
LLM_MODEL=gpt-6.1-sol  # replace with a model from your account's list in Settings
```

---

## Docker Deployment

Prefer containerized deployment? Resume Matcher includes Docker support.

### Quick Start with Docker Compose

```bash
# Start the container from a published image
docker compose up -d

# View logs
docker compose logs -f

# Stop the container
docker compose down
```

### Customizing Ports

```bash
# Change host port only (container stays on 3000)
PORT=4000 docker compose up -d
```

### Configuration Options

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Host port mapped to container port `3000` |
| `BIND_ADDRESS` | `127.0.0.1` | Host address the port is published on. `127.0.0.1` = this machine only; `0.0.0.0` = every network interface (see below) |
| `ALLOWED_HOSTS` | — | Extra hostnames the app answers for, comma-separated (e.g. `192.168.1.20`); `*` allows any |
| `FRONTEND_BASE_URL` | `http://localhost:3000` | The URL you open the app at; its hostname is allowed automatically |
| `LOG_LEVEL` | `INFO` | Application-wide Python/Uvicorn log level (`ERROR`, `WARNING`, `INFO`, `DEBUG`) |
| `LOG_LLM` | `WARNING` | LiteLLM log level (`ERROR`, `WARNING`, `INFO`, `DEBUG`) |
| `LLM_PROVIDER` | `openai` | AI provider (openai, anthropic, gemini, etc.) |
| `LLM_MODEL` | — | Model to use (configured via Settings UI) |
| `LLM_API_KEY` | — | API key (recommended: configure via Settings UI) |
| `LLM_API_BASE` | — | Custom API endpoint (for Ollama or proxies) |

> **Note:** Changes to `LOG_LEVEL` and `LOG_LLM` require a container restart to take effect.

### Opening it from another device

The container is published on `127.0.0.1` only, so it opens on the machine running Docker and nowhere else. Resume Matcher has no login: anyone who can reach it can read your resumes and change your AI settings. To use it from a phone or another computer on a network you trust, publish it on all interfaces and allow the address you will type:

```bash
BIND_ADDRESS=0.0.0.0 ALLOWED_HOSTS=192.168.1.20 docker compose up -d
```

Requests for any other hostname get `400 Invalid host header`. Behind a reverse proxy with its own domain, set `FRONTEND_BASE_URL` to that URL instead; its hostname is allowed automatically.

### Using Ollama with Docker

Inside the container, `localhost` is the container itself, not your computer, so the default Ollama URL `http://localhost:11434` cannot work there. Use `host.docker.internal`, which the Compose file points at your computer (on Linux too, through `extra_hosts`):

1. In **Settings**, choose **Ollama** and set **Base URL** to `http://host.docker.internal:11434`, then click **Test Connection**. Or set it at startup:

   ```bash
   LLM_PROVIDER=ollama LLM_MODEL=gemma3:4b LLM_API_BASE=http://host.docker.internal:11434 docker compose up -d
   ```

2. **Linux only:** Ollama listens on `127.0.0.1` by default, and traffic from a container does not arrive there. Make it listen on the Docker bridge as well, then restart it:

   ```bash
   sudo systemctl edit ollama   # add the two lines below
   # [Service]
   # Environment="OLLAMA_HOST=0.0.0.0"
   sudo systemctl restart ollama
   ```

   `0.0.0.0` also exposes Ollama to your network; block port `11434` in your firewall if that matters to you. Docker Desktop on macOS and Windows needs no change.

If **Test Connection** says *localhost is the container itself*, the Base URL still points at `localhost` or `127.0.0.1`. The same applies to LM Studio, llama.cpp and other servers on your computer: use `host.docker.internal` with their port.

### Using Docker Secrets

The container supports `*_FILE` from
[docker secrets](https://docs.docker.com/compose/how-tos/use-secrets/#use-secrets).
For sensitive values, you can mount a secret file and point to it:

```bash
LLM_API_KEY_FILE=/run/secrets/llm_api_key docker compose up -d
```

Supported `*_FILE` variables:

| Variable | `*_FILE` variant |
|----------|-----------------|
| `LOG_LEVEL` | `LOG_LEVEL_FILE` |
| `LOG_LLM` | `LOG_LLM_FILE` |
| `LLM_PROVIDER` | `LLM_PROVIDER_FILE` |
| `LLM_MODEL` | `LLM_MODEL_FILE` |
| `LLM_API_KEY` | `LLM_API_KEY_FILE` |
| `LLM_API_BASE` | `LLM_API_BASE_FILE` |

Rules:

- Use either the variable or its `*_FILE` variant, not both.
- If both are set, the container exits with an explicit error.

### Logging Level Configuration

You can tune logs globally and for LiteLLM separately:

```bash
LOG_LEVEL=INFO LOG_LLM=DEBUG docker compose up -d
```

> **Security warning:** `LOG_LLM=DEBUG` causes LiteLLM to log API keys in
> plaintext. Do not use `DEBUG` level in production or shared environments.
> The default `WARNING` is safe.

> **Note:** LiteLLM also reads the `LITELLM_LOG` environment variable internally
> to control handler-level filtering. `LOG_LLM` sets the *logger* level. Both must
> allow a message for it to appear. If you set `LITELLM_LOG` from LiteLLM docs,
> make sure `LOG_LLM` is set to an equal or lower level.

### Optional: PostgreSQL

SQLite is the default and needs no setup. For backups, or to keep the database on a separate server you control, you can use PostgreSQL instead.

> **Security:** Resume Matcher has no user accounts or authentication, and PostgreSQL doesn't add any. Run it only for yourself or on a trusted private network, never exposed publicly. For anything beyond local use, connect with a least-privilege database role (the Compose file's `resume` user is a superuser).

To start it with Docker Compose:

```bash
export POSTGRES_PASSWORD="$(openssl rand -hex 32)"
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d
```

`POSTGRES_PASSWORD` is copied into `DATABASE_URL` as-is, so use a URL-safe password (letters, digits, `-._~`); `openssl rand -hex 32` generates one. Don't use a guessable value. Keep the password: PostgreSQL stores it in the `postgres-data` volume on first start, and every later `docker compose` command needs the same value (export it again, or put `POSTGRES_PASSWORD=...` in a `.env` file next to `docker-compose.yml`).

Outside Docker, set `DATABASE_URL=postgresql://user:password@host:5432/dbname` (and optionally `DATABASE_SCHEMA`) in `apps/backend/.env`, percent-encoding any special characters in the password. For a remote database add `?sslmode=require` to the URL. Tables are created on startup.

To move existing data from a local install, run `uv run python -m app.scripts.copy_sqlite_to_postgres` from `apps/backend` with `DATABASE_URL` set. Its default `--source` is `apps/backend/data/resume_matcher.db`, which only exists for local installs; pass `--source <file>` for another SQLite file. It refuses to write into a non-empty database. Stop the app first: writes made after the copy starts are not copied.

A Docker install keeps its SQLite database in the `resume-data` volume, not on the host. Stop the app, then run the script inside the container, where that volume is the default source (with the same `POSTGRES_PASSWORD` set as above):

```bash
docker compose stop
docker compose -f docker-compose.yml -f docker-compose.postgres.yml run --rm -w /app/backend resume-matcher python -m app.scripts.copy_sqlite_to_postgres
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d
```

Alternatively copy the file out of the stopped container (`docker cp resume-matcher:/app/backend/data/resume_matcher.db .`) and pass it with `--source ./resume_matcher.db` from a host that can reach the database. Keep `data/.secret_key` (it stays in the volume): it decrypts your stored API keys.

### Testing the Docker image

To check that the image builds and works (backend and frontend start, pages load, PDF export renders), run the smoke test from the repo root:

```bash
./scripts/docker-smoke.sh
```

It builds the image with the build cache, starts it on port `3100` (set `SMOKE_PORT` to change it) with a throwaway data volume, runs the checks, prints `PASS` or `FAIL` with the image size, and removes the container and volume. It never touches your real data and makes no LLM calls. Flags: `--no-build` (test an existing image), `--tag <name>`, `--keep` (leave it running to poke at), `--clean` (also remove the image).

For quick iteration, use Compose watch (Docker Compose 2.22 or newer):

```bash
docker compose watch
```

Edits under `apps/backend/app` are synced into the running container, which restarts without an image rebuild. Changes to `apps/frontend`, `apps/backend/pyproject.toml`, the `Dockerfile` or `docker/` rebuild the image. Python dependencies and Chromium are cached in their own layers, so a rebuild after a code change does not download them again.

If a build step downloads slowly, point it at a mirror. All four build args are empty by default (no change):

- `DEBIAN_MIRROR`: if `apt-get` is slow, build with `DEBIAN_MIRROR=https://mirrors.edge.kernel.org/debian` (or your local mirror; give its `/debian` URL). Security updates stay on `deb.debian.org` unless you also set `DEBIAN_SECURITY_MIRROR` (a `/debian-security` URL; most mirrors don't carry it).
- `PIP_INDEX_URL`: if Python package downloads are slow, set it to a PyPI mirror's `/simple` URL (for example `https://pypi.mirrors.ustc.edu.cn/simple`).
- `PLAYWRIGHT_DOWNLOAD_HOST`: if the Chromium download is slow (Playwright's default CDN can be throttled in some regions), set it to your mirror's URL.

```bash
docker build \
  --build-arg DEBIAN_MIRROR=https://mirrors.edge.kernel.org/debian \
  --build-arg PIP_INDEX_URL=https://pypi.mirrors.ustc.edu.cn/simple \
  --build-arg PLAYWRIGHT_DOWNLOAD_HOST=https://your-mirror.example.com \
  -t resume-matcher .
```

`docker compose build` and `scripts/docker-smoke.sh` pick all four up from environment variables of the same names, e.g. `DEBIAN_MIRROR=https://mirrors.edge.kernel.org/debian ./scripts/docker-smoke.sh`.

### Important Notes

- **API keys are best configured through the UI** at `http://localhost:3000/settings`
- Data is persisted in a Docker volume (`resume-data`)
- The Settings UI configuration is stored in the volume and persists across restarts
- App and API share the same origin: frontend on `/`, API on `/api`



## Accessing the Application

Once the container is running, open your browser:

| URL | Description |
|-----|-------------|
| **<http://localhost:3000>** | Main application (Dashboard) |
| **<http://localhost:3000/settings>** | Configure AI provider |
| **<http://localhost:3000/api/v1/health>** | Backend health check |
| **<http://localhost:3000/docs>** | Interactive API documentation |

### First-Time Setup Checklist

1. Open <http://localhost:3000/settings>
2. Select your AI provider
3. Enter your API key (or configure Ollama)
4. Click "Save Configuration"
5. Click "Test Connection" to verify it works
6. Return to Dashboard and upload your first resume!

---

## Use Resume Matcher from Claude Code or Claude Desktop (MCP)

Resume Matcher ships an [MCP](https://modelcontextprotocol.io) server that lets Claude Code, Claude Desktop, Cursor or Codex drive it directly. It runs over stdio and needs **no LLM API key**: Claude writes the content, and Resume Matcher stores, validates, scores and renders it. It shares the web app's database, so whatever Claude saves shows up in the UI.

**Prerequisite:** a local (non-Docker) install. Clone the repo and run `cd apps/backend && uv sync` (see [Backend Setup](#2-backend-setup)).

### Claude Code

```bash
claude mcp add resume-matcher -- uv run --directory /abs/path/to/Resume-Matcher/apps/backend resume-matcher-mcp
```

### Claude Desktop

Add this to `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows: `%APPDATA%\Claude\claude_desktop_config.json`), then restart Claude Desktop:

```json
{
  "mcpServers": {
    "resume-matcher": {
      "command": "/absolute/path/to/uv",
      "args": ["run", "--directory", "/abs/path/to/Resume-Matcher/apps/backend", "resume-matcher-mcp"]
    }
  }
}
```

Use the **absolute path** of `uv` for `command` (find it with `which uv` on macOS/Linux or `where.exe uv` on Windows). Claude Desktop does not inherit your shell `PATH`, so a bare `uv` is not found. On Windows, double the backslashes in JSON paths.

### Other MCP clients

Cursor, Codex and other clients use the same command (`uv`) and args (`run --directory <path>/apps/backend resume-matcher-mcp`).

### Notes

- **Same checkout, same data.** Run the web app from the same checkout so both use the same database. `DATA_DIR` moves the SQLite file; `DATABASE_URL` selects [PostgreSQL](#optional-postgresql) instead.
- **Frontend for PDF and verify.** PDF export, `verify_resume`, `tailor_and_verify` and `parse_check_resume` need the frontend running (default <http://localhost:3000>, set with `FRONTEND_BASE_URL`). The other tools work without it.
- **Docker is not supported yet.** The app's database lives inside the Docker volume, so a server started on the host would see an empty database.

The server exposes tools to list and read resumes and jobs, create a master resume, add a job, tailor and verify a resume (`tailor_and_verify`), parse-check and score it for ATS, export a PDF (`export_resume_pdf`) and track job applications. Your client lists them once connected, and the server's built-in instructions walk Claude through the workflow.

---

## Common Commands Reference

### Backend Commands

```bash
cd apps/backend

# Start development server (with auto-reload)
RELOAD=true uv run app

# Start production server
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000

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

# Format code with Oxfmt
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

### Chinese / Japanese / Korean text renders as boxes (□□□) in the PDF

The PDF is rendered by headless Chromium, which falls back to **system** fonts
for any glyph the bundled webfonts don't cover. A headless Linux host usually
ships none for CJK, so the text becomes tofu boxes.

**Docker users:** nothing to do — the image installs `fonts-noto-cjk`.

**Running without Docker:** install system CJK fonts on the machine running the
backend.

```bash
# Debian / Ubuntu
sudo apt-get install -y fonts-noto-cjk

# Fedora / RHEL
sudo dnf install -y google-noto-sans-cjk-fonts

# Arch
sudo pacman -S noto-fonts-cjk

# macOS — CJK fonts ship with the OS, no action needed
```

Restart the backend afterwards so Chromium picks up the new font cache.

### Ollama connection fails

**Error:** `Connection refused to localhost:11434`

1. Check Ollama is running: `ollama list`
2. Start Ollama if needed: `ollama serve`
3. Make sure the model is downloaded: `ollama pull gemma3:4b`
4. Running Resume Matcher in Docker? See [Using Ollama with Docker](#using-ollama-with-docker): the Base URL must be `http://host.docker.internal:11434`, and on Linux Ollama must listen beyond `127.0.0.1`.

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
├── docker-compose.yml           # Docker configuration
├── Dockerfile                   # Container build instructions
└── README.md                    # Project overview
```

---

## Getting Help

Stuck? Here are your options:

- **Discord Community:** [dsc.gg/resume-matcher](https://dsc.gg/resume-matcher) - Active community for questions and discussions
- **GitHub Issues:** [Open an issue](https://github.com/srbhr/Resume-Matcher/issues) for bugs or feature requests
- **Documentation:** Browse the [online docs](https://resumematcher.fyi/docs/) for detailed guides

---

Happy resume building! If you find Resume Matcher helpful, consider [starring the repo](https://github.com/srbhr/Resume-Matcher) and [joining our Discord](https://dsc.gg/resume-matcher).
