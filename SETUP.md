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

---

## 🖋️ Frontend

- Please make sure to have the format on save option enabled in your editor or run `npm run format` to format all staged changes.

_Last updated: May 25, 2025_
