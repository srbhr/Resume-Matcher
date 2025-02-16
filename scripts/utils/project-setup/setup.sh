#!/bin/bash

echo "🚀 Starting Resume Matcher setup..."

# Detect OS
OS_TYPE=$(uname -s)

PYTHON_CMD=$(command -v python3 || command -v python)
PYTHON_VERSION=$($PYTHON_CMD -V 2>&1 | awk '{print $2}')
REQUIRED_PYTHON="3.11"

# Fix for Python 3.13 issues
if [[ "$PYTHON_VERSION" == "3.13"* ]]; then
    echo "⚠️ Python 3.13 detected. Downgrading to Python 3.11..."
    
    if ! command -v pyenv &> /dev/null; then
        echo "🔧 Installing pyenv..."
        curl https://pyenv.run | bash
        export PATH="$HOME/.pyenv/bin:$PATH"
        eval "$(pyenv init --path)"
        eval "$(pyenv virtualenv-init -)"
    fi
    
    # Install Python 3.11 and use it
    pyenv install -v 3.11.0
    pyenv local 3.11.0
    PYTHON_CMD=python3.11
fi

echo "🔍 Detected OS: $OS_TYPE"
echo "🐍 Using Python: $($PYTHON_CMD --version)"

# macOS-specific dependencies
if [[ "$OS_TYPE" == "Darwin" ]]; then
    echo "🍏 Ensuring macOS dependencies are installed..."
    
    if ! xcode-select -p &>/dev/null; then
        echo "🔧 Installing Xcode Command Line Tools..."
        sudo rm -rf /Library/Developer/CommandLineTools
        xcode-select --install
        echo "✅ Xcode Command Line Tools installed."
    fi
    
    if ! command -v brew &>/dev/null; then
        echo "🍺 Installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        echo "✅ Homebrew installed."
    fi

    brew install gcc || echo "⚠️ GCC already installed."
fi

# Virtual environment setup
VENV_NAME="env"

if [[ -d "$VENV_NAME" ]]; then
    echo "⚠️ Existing virtual environment detected. Removing and recreating..."
    rm -rf "$VENV_NAME"
fi

echo "🐧 Setting up virtual environment..."
$PYTHON_CMD -m venv "$VENV_NAME"

# Activate virtual environment
if [[ "$OS_TYPE" == "Linux" || "$OS_TYPE" == "Darwin" ]]; then
    source "$VENV_NAME/bin/activate"
elif [[ "$OS_TYPE" == "CYGWIN" || "$OS_TYPE" == "MINGW" || "$OS_TYPE" == "MSYS" ]]; then
    source "$VENV_NAME/Scripts/activate"
else
    echo "❌ Unsupported OS detected: $OS_TYPE"
    exit 1
fi

# Upgrade pip and install dependencies
echo "📦 Installing core dependencies..."
pip install --upgrade pip setuptools wheel

# Fix cytoolz separately
echo "🔧 Handling cytoolz installation separately..."
pip install --no-cache-dir cytoolz || echo "⚠️ cytoolz installation failed, skipping..."

# Install requirements with retries
RETRY_COUNT=3
for (( i=1; i<=$RETRY_COUNT; i++ )); do
    echo "🔄 Attempt $i to install dependencies..."
    pip install -r requirements.txt && break
    echo "⚠️ Installation failed. Retrying ($i/$RETRY_COUNT)..."
    sleep 3
done

# Ensure required modules are installed
REQUIRED_MODULES=("spacy" "pypdf" "streamlit")
for MODULE in "${REQUIRED_MODULES[@]}"; do
    if ! python -c "import $MODULE" &>/dev/null; then
        echo "⚠️ $MODULE module missing. Installing..."
        pip install "$MODULE"
    fi
done

# Prepare directories
echo "📂 Ensuring data directories exist..."
mkdir -p Data/Resumes Data/JobDescription

# Run initial script
echo "🚀 Running initial setup script..."
if python run_first.py; then
    echo "✅ Initial setup script executed successfully!"
else
    echo "⚠️ Initial setup encountered an issue, but continuing..."
fi

# Final check before running Streamlit
if python -c "import streamlit" &>/dev/null; then
    echo "✅ All dependencies installed successfully!"
else
    echo "❌ Streamlit is missing. Installing now..."
    pip install streamlit
fi

# Final message
echo "✅ Setup complete!"
echo "📌 Starting Streamlit..."
streamlit run streamlit_app.py

exit 0