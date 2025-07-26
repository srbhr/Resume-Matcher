# Local Setup Guide for Resume-Matcher

![installing_resume_matcher](assets/how_to_install_resumematcher.png)

This document provides cross-platform instructions to get the project up and running locally.

---

## 🚀 Quickstart

### ⭐ New Quick Setup Script (Recommended)

For the best setup experience with automatic troubleshooting:

```bash
python quick-setup.py
```

This script addresses common issues from [#312](https://github.com/srbhr/Resume-Matcher/issues/312) and [#315](https://github.com/srbhr/Resume-Matcher/issues/315).

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
- **Ollama**: Script will try to automatically install Ollama if it failed, Download from [https://ollama.com/download/windows](https://ollama.com/download/windows)

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
 
 Make sure that [Ollama](https://ollama.com/) is not only installed but also running.
 You can start the Ollama server manually by running:

 ```bash
 ollama serve
 ```

 If Ollama is not running, the script may fail to pull the required model (`gemma3:4b`).
 
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
- **`make run-dev`** — start dev server (SIGINT-safe)
- **`make run-prod`** — Build for production
- **`make clean`** — Remove build artifacts (customize as needed)

---

## 🐞 Troubleshooting

### Common Setup Issues

#### 🔴 Issue #312: pip install not working (Python 3.12+ compatibility)

**Problem**: cytoolz compilation errors, Cython build failures
```
Error compiling Cython file:
cytoolz/functoolz.pxd:18:23: '__module__' redeclared
```

**Solutions**:
1. **Use Python 3.11 instead of 3.12+** (Recommended)
   ```bash
   # Install Python 3.11 and create new environment
   pyenv install 3.11.7
   pyenv local 3.11.7
   python -m venv venv
   ```

2. **Install build dependencies**:
   - Linux: `sudo apt-get install python3-dev build-essential`
   - macOS: `xcode-select --install`
   - Windows: Install Visual Studio Build Tools

3. **Use conda instead of pip**:
   ```bash
   conda create -n resume-matcher python=3.11
   conda activate resume-matcher
   conda install -c conda-forge cytoolz
   pip install -r requirements.txt
   ```

4. **Install pre-compiled wheels**:
   ```bash
   pip install --only-binary=all cytoolz
   ```

#### 🔴 Issue #315: NLTK WordNet error

**Problem**: 
```
LookupError: Resource wordnet not found.
```

**Solutions**:
1. **Use the quick-setup script** (automatically downloads NLTK data)
2. **Manual download**:
   ```python
   import nltk
   nltk.download('wordnet')
   nltk.download('punkt')
   nltk.download('stopwords')
   ```

3. **Set NLTK data path**:
   ```bash
   export NLTK_DATA=$HOME/nltk_data
   ```

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

### Python Version Compatibility Matrix

| Python Version | Status | Notes |
|----------------|--------|-------|
| 3.8 | ✅ Supported | Minimum required version |
| 3.9 | ✅ Supported | Recommended |
| 3.10 | ✅ Supported | Recommended |
| 3.11 | ✅ Supported | **Best choice** |
| 3.12+ | ⚠️ Issues | cytoolz compilation problems |

### Alternative Installation Methods

#### Method 1: Docker (Coming Soon)
```bash
# Will be available soon
docker-compose up
```

#### Method 2: Conda Environment
```bash
# Create conda environment
conda create -n resume-matcher python=3.11
conda activate resume-matcher

# Install problematic packages via conda
conda install -c conda-forge cytoolz numpy pandas

# Install remaining packages via pip
pip install -r requirements.txt
```

#### Method 3: Virtual Environment with UV
```bash
# Install uv (fastest Python package installer)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Create and setup environment
uv venv --python 3.11
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
uv sync
```

### Getting Help

If you're still having issues:

1. **Check the GitHub Issues**: [Resume-Matcher Issues](https://github.com/srbhr/Resume-Matcher/issues)
2. **Join our Discord**: [Discord Community](https://dsc.gg/resume-matcher)
3. **Run the quick-setup script**: `python quick-setup.py` (includes diagnostics)
4. **Create a new issue** with:
   - Your operating system and version
   - Python version (`python --version`)
   - Error message (full traceback)
   - Steps you've tried

---

## 🖋️ Frontend

- Please make sure to have format on save option enabled on your editor (or) run `npm run format` to format all the staged changes.

_Last updated: May 25, 2025_
