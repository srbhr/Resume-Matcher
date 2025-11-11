# Local Setup Guide for Resume-Matcher

![installing_resume_matcher](assets/how_to_install_resumematcher.png)

This document provides cross-platform instructions to get the project up and running locally.

---

## 🚀 Quickstart

### For Windows (PowerShell)

```powershell
# 1. Run the PowerShell setup script
.\setup.ps1

# 2. (Optional) Start the development server
.\setup.ps1 -StartDev
```

### For Linux/macOS (Bash)

```bash
# 1. Make the scripts executable
chmod +x setup.sh

# 2. Configure your environment and install dependencies
./setup.sh

# 3. (Optional) Start the development server
./setup.sh --start-dev
# or via Makefile
make setup
make run-dev
```

---

## 🛠️ Prerequisites

### Windows
- **PowerShell** 5.1 or later
- **Node.js** ≥ v18 (includes `npm`)
- **Python** ≥ 3.8 (`python3`, `pip3`)
- **winget** (recommended for Ollama installation)
- **uv** (will be auto-installed by setup.ps1 if missing)

### Linux/macOS
- **Bash** 4.4 or higher
- **Node.js** ≥ v18 (includes `npm`)
- **Python** ≥ 3.8 (`python3`, `pip3`)
- **curl** (for installing uv & Ollama)
- **make** (for Makefile integration)

### Installing Prerequisites

**On Windows:**
You can install missing tools via Windows Package Manager (winget) or manual downloads:

```powershell
# Install Node.js via winget
winget install OpenJS.NodeJS

# Install Python via winget
winget install Python.Python.3.12
```

**Or download manually from official sites:**
- **Node.js**: Download from [https://nodejs.org/](https://nodejs.org/) (LTS version recommended)
- **Python**: Download from [https://www.python.org/downloads/](https://www.python.org/downloads/) (v3.8+ required)
- **Ollama**: Only required if you switch the backend providers to `ollama`. Otherwise you can skip installing it. If you do need it, download from [https://ollama.com/download/windows](https://ollama.com/download/windows)

**On macOS**, you can install missing tools via Homebrew:

```bash
brew update
brew install node python3 curl make
```

**On Linux** (Debian/Ubuntu):

```bash
sudo apt update && sudo apt install -y bash nodejs npm python3 python3-pip curl make
```

---

## 🔧 Environment Configuration

The project uses `.env` files at two levels:

1. **Root `.env`** — copied from `./.env.example` if missing
2. **Backend `.env`** — copied from `apps/backend/.env.sample` if missing

You can customize any variables in these files before or after bootstrapping.

### Common Variables

| Name                      | Description                     | Default                        |
| ------------------------- | ------------------------------- | ------------------------------ |
| `SYNC_DATABASE_URL`       | Backend database connection URI | `sqlite:///db.sqlite3`         |
| `SESSION_SECRET_KEY`      | fastAPI session secret key      | `a-secret-key`                 |
| `PYTHONDONTWRITEBYTECODE` | Disable Python bytecode files   | `1`                            |
| `ASYNC_DATABASE_URL`      | Backend async db connection URI | `sqlite+aiosqlite:///./app.db` |
| `NEXT_PUBLIC_API_URL`     | Frontend proxy to backend URI   | `http://localhost:8000`        |

> **Note:** `PYTHONDONTWRITEBYTECODE=1` is exported by `setup.sh` to prevent `.pyc` files.

---

## 📦 Installation Steps

 Note: Before You Run `setup.sh`

 If you leave the default OpenAI configuration in place, no local model server is required.
 When switching `LLM_PROVIDER` or `EMBEDDING_PROVIDER` to `ollama`, ensure that [Ollama](https://ollama.com/) is installed and running. Start it manually via:

 ```bash
 ollama serve
 ```

 Without the Ollama daemon running the setup script cannot pull local models.
 
### Windows Installation

1. **Clone the repository**

   ```powershell
   git clone https://github.com/srbhr/Resume-Matcher.git
   cd Resume-Matcher
   ```

2. **Run PowerShell setup**

   ```powershell
   .\setup.ps1
   ```

   This will:

   - Verify/install prerequisites (`node`, `npm`, `python3`, `pip3`, `uv`)
   - Install Ollama via winget (if not present)
   - Pull the `gemma3:4b` model via Ollama
   - Bootstrap root & backend `.env` files
   - Install Node.js deps (`npm ci`) at root and frontend
   - Sync Python deps in `apps/backend` via `uv sync`

3. **(Optional) Start development**

   ```powershell
   .\setup.ps1 -StartDev
   ```

   Press `Ctrl+C` to gracefully shut down.

4. **Build for production**
   ```powershell
   npm run build
   ```

### Linux/macOS Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/srbhr/Resume-Matcher.git
   cd Resume-Matcher
   ```

2. **Make setup executable**

   ```bash
   chmod +x setup.sh
   ```

3. **Run setup**

   ```bash
   ./setup.sh
   ```

   This will:

   - Verify/install prerequisites (`node`, `npm`, `python3`, `pip3`, `uv`, `ollama`)
   - Pull the `gemma3:4b` model via Ollama
   - Bootstrap root & backend `.env` files
   - Install Node.js deps (`npm ci`) at root and frontend
   - Sync Python deps in `apps/backend` via `uv sync`

4. **(Optional) Start development**

   ```bash
   ./setup.sh --start-dev
   # or
   make setup
   make run-dev
   ```

   Press `Ctrl+C` to gracefully shut down.

5. **Build for production**
   ```bash
   npm run build
   # or
   make run-prod
   ```

---

## 🔨 Available Commands

### PowerShell Commands (Windows)

- **`.\setup.ps1`** — Run complete setup process
- **`.\setup.ps1 -StartDev`** — Setup and start development server
- **`.\setup.ps1 -Help`** — Show PowerShell script help
- **`npm run dev`** — Start development server
- **`npm run build`** — Build for production

### Makefile Targets (Linux/macOS)

- **`make help`** — Show available targets
- **`make setup`** — Run `setup.sh`
- **`make run-dev`** — Start dev server (SIGINT-safe)
- **`make run-prod`** — Build for production
- **`make clean`** — Remove build artifacts (customize as needed)

---

## 🐞 Troubleshooting

### Windows-specific Issues

- **`Execution of scripts is disabled on this system`**:

  - Run `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` in PowerShell as Administrator.

- **`winget: command not found`**:

  - Install App Installer from Microsoft Store or update Windows 10/11.

- **`Ollama installation failed`**:

  - Download and install manually from [https://ollama.com/download/windows](https://ollama.com/download/windows).

- **`uv: command not found`** after installation:

  - Restart your PowerShell terminal and try again.

### Cross-platform Issues

- **`permission denied`** on `setup.sh`:

  - Run `chmod +x setup.sh`.

- **`uv: command not found`** despite install:

  - Ensure `~/.local/bin` is in your `$PATH`.

- **`ollama: command not found`** on Linux:

  - Verify the installer script ran, or install manually via package manager.

- **`npm ci` errors**:
  - Check your `package-lock.json` is in sync with `package.json`.

- **Port `3000` or `8000` already in use**:
  - Kill the process: `lsof -ti:3000 | xargs kill -9` (macOS/Linux) or `netstat -ano | findstr :3000` (Windows)
  - Or change the port in `.env.local` or start the server with a different port

- **`DOCX file processing fails`**:
  - Install missing dependencies: `pip install markitdown[all]==0.1.2`
  - Run: `python apps/backend/test_docx_dependencies.py` to verify

- **Database errors on fresh install**:
  - Delete `app.db` and `db.sqlite3` files, then restart the backend
  - Ensure `ASYNC_DATABASE_URL` and `SYNC_DATABASE_URL` are correctly set in `.env`

---

## ❓ Frequently Asked Questions (FAQ)

### General Questions

**Q: Do I need Ollama installed to use Resume Matcher?**

A: No, it's optional. By default, the project uses OpenAI APIs (configured in `.env`). Ollama is only required if you change `LLM_PROVIDER` and `EMBEDDING_PROVIDER` to `"ollama"` for running models locally.

**Q: Can I use Resume Matcher offline?**

A: Yes, if you set up Ollama as your provider. Ensure Ollama is running (`ollama serve`) before starting Resume Matcher.

**Q: What are the minimum system requirements?**

A: 
- **CPU**: 2+ cores (4+ cores recommended for Ollama)
- **RAM**: 4GB minimum (8GB+ recommended for local models)
- **Storage**: 10GB for local LLM models (if using Ollama)
- **Python**: 3.12+
- **Node.js**: 18+

**Q: How do I switch from OpenAI to Ollama?**

A: Update your `apps/backend/.env`:
```env
LLM_PROVIDER="ollama"
LLM_BASE_URL="http://localhost:11434"
LL_MODEL="llama2"  # or another available model

EMBEDDING_PROVIDER="ollama"
EMBEDDING_BASE_URL="http://localhost:11434"
EMBEDDING_MODEL="nomic-embed-text"
```

Then restart the backend and ensure Ollama is running.

### Installation & Setup

**Q: Setup failed with `npm ERR! code ERESOLVE`**

A: Try clearing npm cache and reinstalling:
```bash
npm cache clean --force
npm ci
```

**Q: Python virtual environment not created**

A: Ensure `uv` is installed properly. On Linux/macOS:
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

**Q: How do I use Python from a specific version?**

A: Set PYTHON environment variable before running setup:
```bash
# On Windows
$env:PYTHON = "C:\Python312\python.exe"
.\setup.ps1

# On macOS/Linux
export PYTHON=/usr/bin/python3.12
./setup.sh
```

**Q: Can I use a different database instead of SQLite?**

A: Yes, update `SYNC_DATABASE_URL` and `ASYNC_DATABASE_URL` in `.env`. Examples:
```env
# PostgreSQL
ASYNC_DATABASE_URL="postgresql+asyncpg://user:password@localhost/resume_matcher"
SYNC_DATABASE_URL="postgresql://user:password@localhost/resume_matcher"

# MySQL
ASYNC_DATABASE_URL="mysql+aiomysql://user:password@localhost/resume_matcher"
SYNC_DATABASE_URL="mysql://user:password@localhost/resume_matcher"
```

### Development

**Q: How do I run only the frontend or backend?**

A: Use individual commands:
```bash
npm run dev:frontend  # Frontend only (port 3000)
npm run dev:backend   # Backend only (port 8000)
```

**Q: How do I debug the backend?**

A: The backend runs with `--reload` by default in development mode. Add breakpoints in your IDE or use print statements. For detailed logging, set in `.env`:
```env
LOG_LEVEL="DEBUG"
```

**Q: Frontend changes not reflecting in the browser?**

A: 
- Check if dev server is running: `npm run dev:frontend`
- Clear browser cache (Ctrl+Shift+Delete)
- Restart the dev server if changes don't appear after 5 seconds

**Q: How do I test API endpoints manually?**

A: Use `curl`, Postman, or VS Code REST Client:
```bash
# Upload resume
curl -X POST http://localhost:8000/api/v1/resumes/upload \
  -F "file=@/path/to/resume.pdf"

# Validate resume content
curl -X POST http://localhost:8000/api/v1/validation/validate \
  -H "Content-Type: application/json" \
  -d '{"content":"Your resume text here"}'
```

### Production

**Q: How do I build for production?**

A: Run:
```bash
npm run build
```

This creates optimized builds for both frontend and backend.

**Q: Should I set `DEBUG=True` in production?**

A: **No**, always set `DEBUG=False` in production for security reasons.

**Q: How do I deploy Resume Matcher?**

A: 
1. Build the project: `npm run build`
2. Set appropriate environment variables for production
3. Use a production ASGI server for the backend (e.g., Gunicorn, Uvicorn)
4. Use a production Node.js server for the frontend (e.g., PM2, Docker)
5. (Optional) Containerize with Docker and deploy to your platform

Example Docker deployment is available in the repository root.

### File Upload

**Q: What file formats are supported?**

A: Currently supported:
- **PDF** (`.pdf`)
- **DOCX** (`.docx`)

Maximum file size: **2 MB**

**Q: I get "DOCX file processing may fail" error**

A: Install the required dependencies:
```bash
pip install markitdown[all]==0.1.2
```

Then restart the backend.

**Q: Why is my file upload failing?**

A: Check these common issues:
- File size exceeds 2MB
- File format is not PDF or DOCX
- Backend server is not running
- Check browser console for detailed error messages

### Performance

**Q: Resume analysis is slow**

A: 
- If using Ollama, ensure the LLM model is fully loaded: `ollama list`
- Check system RAM usage; increase if consistently above 90%
- For production, consider using cloud APIs (OpenAI, Claude) for faster responses
- Check network latency to API provider

**Q: How can I optimize the frontend?**

A: 
- Run `npm run build` to create production build
- Enable browser caching and compression
- Use a CDN for static assets
- Monitor performance with browser DevTools

### API & Integration

**Q: How do I get my OpenAI API key?**

A: 
1. Visit [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create a new secret key
3. Add it to `.env`: `LLM_API_KEY="sk-..."`

**Q: Can I use other LLM providers?**

A: Currently supported:
- OpenAI (default)
- Ollama (local)

To add more providers, extend `apps/backend/app/agent/providers/`.

**Q: How do I integrate Resume Matcher into my application?**

A: Use the REST API endpoints. See API documentation at `/api/docs` when running the backend.

---

## 🖋️ Frontend

- Please make sure to have the format on save option enabled in your editor or run `npm run format` to format all staged changes.

---

## 📚 Additional Resources

- **Documentation**: [docs/CONFIGURING.md](docs/CONFIGURING.md)
- **Repository Guidelines**: [AGENTS.md](AGENTS.md)
- **Contributing**: See CONTRIBUTING.md (coming soon)
- **Discord Community**: [https://dsc.gg/resume-matcher](https://dsc.gg/resume-matcher)

---

_Last updated: November 11, 2025_

