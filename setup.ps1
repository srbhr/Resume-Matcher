# setup.ps1 - PowerShell setup script for Resume Matcher

[CmdletBinding()]
param(
    [switch]$Help,
    [switch]$StartDev
)

$ErrorActionPreference = "Stop"

if ($Help) {
    Write-Host @"
Usage: .\setup.ps1 [-Help] [-StartDev]

Options:
  -Help       Show this help message and exit
  -StartDev   After setup completes, start the dev server

This Windows-only PowerShell script will:
  - Verify required tools: node, npm, python3, pip3, uv (CORE DEPENDENCIES)
    - Configure backend and frontend env files
  - Install root dependencies via npm
  - Bootstrap both root and backend .env files
  - Bootstrap backend venv and install Python deps via uv
  - Install frontend dependencies via npm

CORE DEPENDENCIES (script will fail if missing):
  - Node.js v18+
  - npm
  - Python 3
  - pip
  - uv (will attempt auto-install)

Windows Requirements:
  - PowerShell 5.1 or later
    - winget

For Linux/macOS systems:
  - Use ./setup.sh instead of this script
"@
    exit 0
}

function Write-Info { 
    param([string]$Message)
    Write-Host "ℹ  $Message" -ForegroundColor Cyan
}

function Write-Success { 
    param([string]$Message)
    Write-Host " $Message" -ForegroundColor Green
}

function Write-CustomError { 
    param([string]$Message)
    Write-Host " $Message" -ForegroundColor Red
    exit 1
}

Write-Info "Starting Resume Matcher setup..."

# Detect OS
$OS_TYPE = if ($IsWindows -or ($PSVersionTable.PSVersion.Major -le 5)) {
    "Windows"
} elseif ($IsLinux) {
    "Linux"
} elseif ($IsMacOS) {
    "macOS"
} else {
    "Unknown"
}

Write-Info "Detected operating system: $OS_TYPE"

# Only run on Windows
if ($OS_TYPE -ne "Windows") {
    Write-Host ""
    Write-Host "❌ This PowerShell setup script is designed for Windows only." -ForegroundColor Red
    Write-Host ""
    Write-Host "For Linux/macOS systems, please use the bash setup script instead:" -ForegroundColor Yellow
    Write-Host "  ./setup.sh" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Or install dependencies manually:" -ForegroundColor Yellow
    Write-Host "  1. Install Node.js v18+" -ForegroundColor Cyan
    Write-Host "  2. Install Python 3" -ForegroundColor Cyan
    Write-Host "  3. Install uv from https://astral.sh/uv/" -ForegroundColor Cyan
    Write-Host "  4. Run: npm install && npm run dev" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

# Check prerequisites
Write-Info "Checking core prerequisites..."

# Check Node.js - CORE DEPENDENCY
if (-not (Get-Command "node" -ErrorAction SilentlyContinue)) {
    Write-CustomError "CORE DEPENDENCY MISSING: node is not installed. Please install Node.js and retry."
}

# Check npm - CORE DEPENDENCY
if (-not (Get-Command "npm" -ErrorAction SilentlyContinue)) {
    Write-CustomError "CORE DEPENDENCY MISSING: npm is not installed. Please install npm and retry."
}

# Check Node version - CORE DEPENDENCY
try {
    $Version = node --version
    $Major = [int]($Version -replace "^v(\d+).*", '$1')
    if ($Major -lt 18) {
        Write-CustomError "CORE DEPENDENCY VERSION ERROR: Node.js v18+ is required (found $Version)."
    }
    Write-Success "Node.js $Version is installed"
} catch {
    Write-CustomError "CORE DEPENDENCY ERROR: Failed to check Node.js version."
}

# Check Python - CORE DEPENDENCY
$PythonCmd = $null
if (Get-Command "python3" -ErrorAction SilentlyContinue) {
    $PythonCmd = "python3"
} elseif (Get-Command "python" -ErrorAction SilentlyContinue) {
    $PythonVersion = python --version 2>&1
    if ($PythonVersion -match "Python 3\.") {
        $PythonCmd = "python"
    }
}

if (-not $PythonCmd) {
    Write-CustomError "CORE DEPENDENCY MISSING: Python 3 is not installed. Please install Python 3 and retry."
}

Write-Success "Python is available as $PythonCmd"

# Check pip - CORE DEPENDENCY
$PipCmd = $null
if (Get-Command "pip3" -ErrorAction SilentlyContinue) {
    $PipCmd = "pip3"
} elseif (Get-Command "pip" -ErrorAction SilentlyContinue) {
    $PipCmd = "pip"
} else {
    Write-CustomError "CORE DEPENDENCY MISSING: pip is not available. Please install pip and retry."
}

Write-Success "pip is available as $PipCmd"

# Check uv - CORE DEPENDENCY (try to install if missing)
if (-not (Get-Command "uv" -ErrorAction SilentlyContinue)) {
    Write-Info "CORE DEPENDENCY MISSING: uv not found; attempting to install via Astral.sh..."
    try {
        # Install uv for Windows using the recommended command
        Write-Info "Running: powershell -ExecutionPolicy ByPass -c `"irm https://astral.sh/uv/install.ps1 | iex`""
        Invoke-Expression "powershell -ExecutionPolicy ByPass -c `"irm https://astral.sh/uv/install.ps1 | iex`""
        # Add to PATH for current session
        $env:PATH = "$env:USERPROFILE\.local\bin;" + $env:PATH
        Write-Success "uv installed successfully"
    } catch {
        Write-CustomError "CORE DEPENDENCY MISSING: Failed to install uv. Please install uv manually from https://docs.astral.sh/uv/"
    }
} else {
    Write-Success "uv is already installed"
}

# Final check for uv
if (-not (Get-Command "uv" -ErrorAction SilentlyContinue)) {
    Write-CustomError "CORE DEPENDENCY MISSING: uv is not available. Please restart your terminal or install uv manually from https://docs.astral.sh/uv/"
}

Write-Success "All core prerequisites satisfied."

# Note: This project defaults to OpenAI for LLM/embeddings. Ensure you have an API key set in apps/backend/.env.

# Bootstrap root .env
if ((Test-Path ".env.example") -and (-not (Test-Path ".env"))) {
    Write-Info "Bootstrapping root .env from .env.example"
    Copy-Item ".env.example" ".env"
    Write-Success "Root .env created"
} elseif (Test-Path ".env") {
    Write-Info "Root .env already exists—skipping"
} else {
    Write-Info "No .env.example at root—skipping"
}

# Install root dependencies
Write-Info "Installing root dependencies..."
try {
    # Install root dependencies (including concurrently)
    Write-Info "Installing root dependencies (including concurrently)..."
    npm install
    Write-Success "Root dependencies installed successfully."
} catch {
    Write-Info "Warning: Failed to install root dependencies. You may need to run as Administrator or try manual installation."
    Write-Info "Error: $($_.Exception.Message)"
}

# Setup backend
Write-Info "Setting up backend (apps/backend)..."
if (Test-Path "apps/backend") {
    try {
        Push-Location "apps/backend"
        
        if ((Test-Path ".env.sample") -and (-not (Test-Path ".env"))) {
            Write-Info "Bootstrapping backend .env from .env.sample"
            Copy-Item ".env.sample" ".env"
            Write-Success "Backend .env created"
        } else {
            Write-Info "Backend .env exists or .env.sample missing—skipping"
        }

        # Create virtual environment and install dependencies using uv
        Write-Info "Setting up Python virtual environment and dependencies..."
        try {
            # Create virtual environment if it doesn't exist
            if (-not (Test-Path ".venv")) {
                Write-Info "Creating Python virtual environment..."
                uv venv
                Write-Success "Virtual environment created"
            } else {
                Write-Info "Virtual environment already exists"
            }
            
            # Install dependencies using uv sync (which handles venv activation automatically)
            Write-Info "Syncing Python deps via uv..."
            uv sync
            Write-Success "Backend dependencies ready."
        } catch {
            Write-Info "uv sync failed, trying alternative installation..."
            try {
                # Fallback: install dependencies directly
                uv pip install -e .
                Write-Success "Backend dependencies installed via uv pip install."
            } catch {
                Write-Info "Warning: Failed to install backend dependencies. Error: $($_.Exception.Message)"
            }
        }
    } catch {
        Write-Info "Warning: Backend setup encountered issues. Error: $($_.Exception.Message)"
    } finally {
        Pop-Location
    }
} else {
    Write-Info "Backend directory not found—skipping"
}

# Setup frontend
Write-Info "Setting up frontend (apps/frontend)..."
if (Test-Path "apps/frontend") {
    try {
        Push-Location "apps/frontend"
        
        if ((Test-Path ".env.sample") -and (-not (Test-Path ".env"))) {
            Write-Info "Bootstrapping frontend .env from .env.sample"
            Copy-Item ".env.sample" ".env"
            Write-Success "Frontend .env created"
        } else {
            Write-Info "Frontend .env exists or .env.sample missing—skipping"
        }

        Write-Info "Installing frontend deps with npm ci..."
        try {
            # First try npm ci
            npm ci 2>$null
            Write-Success "Frontend dependencies ready."
        } catch {
            Write-Info "npm ci failed, trying npm install instead..."
            try {
                npm install
                Write-Success "Frontend dependencies installed via npm install."
            } catch {
                Write-Info "Warning: Failed to install frontend dependencies. You may need to run as Administrator."
                Write-Info "Error: $($_.Exception.Message)"
            }
        }
    } catch {
        Write-CustomError "Failed to setup frontend: $($_.Exception.Message)"
    } finally {
        Pop-Location
    }
} else {
    Write-Info "Frontend directory not found—skipping"
}

# Finish or start dev
if ($StartDev) {
    Write-Info "Starting development server..."
    try {
        npm run dev
    } catch {
        Write-Info "Development server stopped."
    }
} else {
    Write-Success @"
 Setup complete!

Next steps:
   Run 'npm run dev' to start in development mode.
   Run 'npm run build' for production.
   See SETUP.md for more details.

Note: Configure OpenAI in apps/backend/.env (LLM_PROVIDER, LL_MODEL, EMBEDDING_PROVIDER, EMBEDDING_MODEL, and API keys).
"@
}
