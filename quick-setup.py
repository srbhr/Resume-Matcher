#!/usr/bin/env python3
"""
Quick Setup Script for Resume Matcher
=====================================

This script provides a platform-agnostic Python setup for Resume Matcher that:
- Checks Python version compatibility
- Creates a virtual environment
- Installs dependencies with proper error handling
- Downloads required NLTK data
- Provides troubleshooting guidance

Usage:
    python quick-setup.py
    python quick-setup.py --install-ollama
    python quick-setup.py --help
"""

import sys
import os
import subprocess
import platform
import argparse
from pathlib import Path

# Color codes for output
class Colors:
    RED = '\033[91m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    WHITE = '\033[97m'
    BOLD = '\033[1m'
    END = '\033[0m'

def print_colored(text, color):
    """Print colored text"""
    print(f"{color}{text}{Colors.END}")

def print_header():
    """Print script header"""
    print_colored("=" * 60, Colors.CYAN)
    print_colored("Resume Matcher - Quick Setup Script", Colors.BOLD + Colors.WHITE)
    print_colored("=" * 60, Colors.CYAN)
    print()

def check_python_version():
    """Check if Python version is compatible"""
    print_colored("📋 Checking Python version...", Colors.BLUE)
    
    version = sys.version_info
    print(f"   Python {version.major}.{version.minor}.{version.micro} detected")
    
    # Issue #312 shows problems with Python 3.12, recommend 3.11
    if version.major < 3 or (version.major == 3 and version.minor < 8):
        print_colored(f"❌ Python 3.8+ is required. You have {version.major}.{version.minor}", Colors.RED)
        print_colored("   Please install Python 3.8 or later.", Colors.YELLOW)
        return False
    elif version.major == 3 and version.minor >= 12:
        print_colored(f"⚠️  Python 3.12+ detected. Known compatibility issues!", Colors.YELLOW)
        print_colored("   If you encounter errors, please use Python 3.11 instead.", Colors.YELLOW)
        print_colored("   See: https://github.com/srbhr/Resume-Matcher/issues/312", Colors.YELLOW)
        
        # Ask user if they want to continue
        response = input("\n   Continue anyway? (y/N): ").strip().lower()
        if response not in ['y', 'yes']:
            print_colored("   Setup cancelled. Please install Python 3.11 and try again.", Colors.YELLOW)
            return False
    
    print_colored("✅ Python version check passed", Colors.GREEN)
    return True

def run_command(cmd, description, show_output=False, cwd=None):
    """Run a command with error handling"""
    print_colored(f"🔧 {description}...", Colors.BLUE)
    
    try:
        if show_output:
            result = subprocess.run(cmd, shell=True, check=True, cwd=cwd, 
                                  stdout=subprocess.PIPE, stderr=subprocess.STDOUT, 
                                  text=True)
            if result.stdout:
                print(result.stdout)
        else:
            result = subprocess.run(cmd, shell=True, check=True, cwd=cwd,
                                  capture_output=True, text=True)
        
        print_colored(f"✅ {description} completed", Colors.GREEN)
        return True, result.stdout if hasattr(result, 'stdout') else ""
        
    except subprocess.CalledProcessError as e:
        print_colored(f"❌ {description} failed", Colors.RED)
        if hasattr(e, 'stderr') and e.stderr:
            print_colored(f"   Error: {e.stderr}", Colors.RED)
        elif hasattr(e, 'stdout') and e.stdout:
            print_colored(f"   Error: {e.stdout}", Colors.RED)
        return False, str(e)

def create_venv():
    """Create virtual environment"""
    venv_path = Path("venv")
    
    if venv_path.exists():
        print_colored("📁 Virtual environment already exists", Colors.CYAN)
        return True
    
    success, _ = run_command(f"{sys.executable} -m venv venv", "Creating virtual environment")
    return success

def get_venv_python():
    """Get path to virtual environment Python"""
    if platform.system() == "Windows":
        return Path("venv/Scripts/python.exe")
    else:
        return Path("venv/bin/python")

def get_venv_pip():
    """Get path to virtual environment pip"""
    if platform.system() == "Windows":
        return Path("venv/Scripts/pip")
    else:
        return Path("venv/bin/pip")

def install_dependencies():
    """Install Python dependencies with fallback strategies"""
    venv_pip = get_venv_pip()
    backend_dir = Path("apps/backend")
    
    print_colored("📦 Installing Python dependencies...", Colors.BLUE)
    
    # Strategy 1: Try uv sync (fastest)
    if subprocess.run("uv --version", shell=True, capture_output=True).returncode == 0:
        print_colored("   Trying uv sync (recommended)...", Colors.CYAN)
        success, _ = run_command("uv sync", "Installing with uv", cwd=backend_dir)
        if success:
            return True
        print_colored("   uv sync failed, trying fallback methods...", Colors.YELLOW)
    
    # Strategy 2: Try pip install with pyproject.toml
    if (backend_dir / "pyproject.toml").exists():
        print_colored("   Trying pip install with pyproject.toml...", Colors.CYAN)
        success, _ = run_command(f"{venv_pip} install -e .", "Installing with pip (pyproject.toml)", 
                               cwd=backend_dir)
        if success:
            return True
    
    # Strategy 3: Try requirements.txt with compatibility fixes
    if (backend_dir / "requirements.txt").exists():
        print_colored("   Trying pip install with requirements.txt...", Colors.CYAN)
        
        # First upgrade pip and setuptools
        run_command(f"{venv_pip} install --upgrade pip setuptools wheel", 
                   "Upgrading pip and setuptools")
        
        # Try with no-cache-dir to avoid build issues
        success, _ = run_command(f"{venv_pip} install --no-cache-dir -r requirements.txt", 
                               "Installing from requirements.txt", cwd=backend_dir)
        if success:
            return True
    
    print_colored("❌ All dependency installation methods failed", Colors.RED)
    print_troubleshooting_deps()
    return False

def install_nltk_data():
    """Download required NLTK data"""
    venv_python = get_venv_python()
    
    print_colored("📚 Installing NLTK data...", Colors.BLUE)
    
    nltk_downloads = [
        'punkt',
        'stopwords', 
        'wordnet',
        'averaged_perceptron_tagger',
        'omw-1.4'
    ]
    
    for package in nltk_downloads:
        cmd = f"{venv_python} -c \"import nltk; nltk.download('{package}')\""
        success, _ = run_command(cmd, f"Downloading NLTK {package}")
        if not success:
            print_colored(f"⚠️  Failed to download {package}, continuing...", Colors.YELLOW)
    
    print_colored("✅ NLTK data installation completed", Colors.GREEN)
    return True

def check_ollama():
    """Check if Ollama is installed"""
    print_colored("🤖 Checking Ollama installation...", Colors.BLUE)
    
    result = subprocess.run("ollama --version", shell=True, capture_output=True)
    if result.returncode == 0:
        print_colored("✅ Ollama is installed", Colors.GREEN)
        
        # Check for required model
        result = subprocess.run("ollama list", shell=True, capture_output=True, text=True)
        if "gemma3:4b" in result.stdout:
            print_colored("✅ gemma3:4b model is available", Colors.GREEN)
        else:
            print_colored("⚠️  gemma3:4b model not found", Colors.YELLOW)
            print_colored("   Run: ollama pull gemma3:4b", Colors.CYAN)
        return True
    else:
        print_colored("❌ Ollama not found", Colors.RED)
        print_install_ollama_instructions()
        return False

def install_ollama():
    """Install Ollama based on platform"""
    print_colored("🤖 Installing Ollama...", Colors.BLUE)
    
    system = platform.system()
    if system == "Linux":
        success, _ = run_command("curl -fsSL https://ollama.com/install.sh | sh", "Installing Ollama")
    elif system == "Darwin":  # macOS
        print_colored("   Please install Ollama manually from: https://ollama.com/download", Colors.YELLOW)
        return False
    elif system == "Windows":
        print_colored("   Please install Ollama manually from: https://ollama.com/download", Colors.YELLOW)
        return False
    else:
        print_colored(f"   Unsupported platform: {system}", Colors.RED)
        return False
    
    if success:
        # Pull the required model
        run_command("ollama pull gemma3:4b", "Pulling gemma3:4b model")
    
    return success

def print_install_ollama_instructions():
    """Print Ollama installation instructions"""
    system = platform.system()
    print_colored("\n📋 Ollama Installation Instructions:", Colors.BOLD + Colors.YELLOW)
    
    if system == "Linux":
        print("   curl -fsSL https://ollama.com/install.sh | sh")
    elif system == "Darwin":  # macOS
        print("   brew install ollama")
        print("   OR download from: https://ollama.com/download")
    elif system == "Windows":
        print("   Download from: https://ollama.com/download")
    
    print("\n   After installation, run:")
    print("   ollama pull gemma3:4b")

def print_troubleshooting_deps():
    """Print dependency troubleshooting guide"""
    print_colored("\n🔧 Troubleshooting Dependency Issues:", Colors.BOLD + Colors.YELLOW)
    print("   1. Python 3.12+ Issues:")
    print("      - Use Python 3.11 instead (recommended)")
    print("      - Install build tools: pip install setuptools wheel cython")
    print()
    print("   2. cytoolz compilation errors:")
    print("      - Install pre-compiled wheels: pip install --only-binary=all cytoolz")
    print("      - Use conda: conda install -c conda-forge cytoolz")
    print()
    print("   3. General build issues:")
    print("      - Update pip: pip install --upgrade pip setuptools wheel")
    print("      - Clear cache: pip cache purge")
    print("      - Install build dependencies for your platform")
    print()
    print("   4. Platform-specific:")
    print("      Linux: sudo apt-get install python3-dev build-essential")
    print("      macOS: xcode-select --install")
    print("      Windows: Install Visual Studio Build Tools")

def setup_env_files():
    """Setup environment files"""
    print_colored("📝 Setting up environment files...", Colors.BLUE)
    
    # Root .env
    if Path(".env.example").exists() and not Path(".env").exists():
        subprocess.run("cp .env.example .env", shell=True)
        print_colored("   ✅ Root .env created", Colors.GREEN)
    
    # Backend .env  
    backend_env = Path("apps/backend/.env")
    backend_sample = Path("apps/backend/.env.sample")
    if backend_sample.exists() and not backend_env.exists():
        subprocess.run(f"cp {backend_sample} {backend_env}", shell=True)
        print_colored("   ✅ Backend .env created", Colors.GREEN)
        
    # Frontend .env
    frontend_env = Path("apps/frontend/.env")
    frontend_sample = Path("apps/frontend/.env.sample")
    if frontend_sample.exists() and not frontend_env.exists():
        subprocess.run(f"cp {frontend_sample} {frontend_env}", shell=True)
        print_colored("   ✅ Frontend .env created", Colors.GREEN)

def install_frontend_deps():
    """Install frontend dependencies"""
    frontend_dir = Path("apps/frontend")
    if frontend_dir.exists():
        print_colored("🌐 Installing frontend dependencies...", Colors.BLUE)
        success, _ = run_command("npm ci", "Installing frontend dependencies", cwd=frontend_dir)
        if not success:
            success, _ = run_command("npm install", "Installing frontend dependencies (fallback)", 
                                   cwd=frontend_dir)
        return success
    return True

def print_next_steps():
    """Print next steps after setup"""
    print_colored("\n🎉 Setup Complete!", Colors.BOLD + Colors.GREEN)
    print_colored("=" * 40, Colors.GREEN)
    
    print_colored("\n📋 Next Steps:", Colors.BOLD + Colors.CYAN)
    print("   1. Activate the virtual environment:")
    
    if platform.system() == "Windows":
        print("      .\\venv\\Scripts\\activate")
    else:
        print("      source venv/bin/activate")
    
    print("\n   2. Start the development server:")
    print("      npm run dev")
    
    print("\n   3. Open your browser to:")
    print("      http://localhost:3000")
    
    print_colored("\n🔧 Troubleshooting:", Colors.BOLD + Colors.YELLOW)
    print("   - If you see NLTK errors, the setup will auto-download required data")
    print("   - For Python 3.12+ issues, consider using Python 3.11")
    print("   - Check the GitHub issues for more help: https://github.com/srbhr/Resume-Matcher/issues")

def main():
    parser = argparse.ArgumentParser(description="Quick setup for Resume Matcher")
    parser.add_argument("--install-ollama", action="store_true", help="Install Ollama")
    parser.add_argument("--skip-nltk", action="store_true", help="Skip NLTK data download")
    args = parser.parse_args()
    
    print_header()
    
    # Check Python version first
    if not check_python_version():
        sys.exit(1)
    
    # Create virtual environment
    if not create_venv():
        print_colored("❌ Failed to create virtual environment", Colors.RED)
        sys.exit(1)
    
    # Setup environment files
    setup_env_files()
    
    # Install Python dependencies
    if not install_dependencies():
        print_colored("⚠️  Python dependencies failed, but continuing...", Colors.YELLOW)
    
    # Install NLTK data
    if not args.skip_nltk:
        install_nltk_data()
    
    # Install frontend dependencies
    install_frontend_deps()
    
    # Check/Install Ollama
    if args.install_ollama:
        install_ollama()
    else:
        check_ollama()
    
    print_next_steps()

if __name__ == "__main__":
    main()
