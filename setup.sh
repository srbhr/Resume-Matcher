#!/bin/bash

# Resume Matcher Setup Script

set -e  # Exit on any error

echo "🚀 Setting up Resume Matcher..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js v18 or higher."
    exit 1
fi

# Check if uv is installed
if ! command -v uv &> /dev/null; then
    echo "❌ uv is not installed. Please install uv for faster Python package management."
    echo "Install via: curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi

echo "✅ Prerequisites check passed"

# Install root dependencies
echo "📦 Installing root dependencies..."
npm install

# Setup backend
echo "🐍 Setting up backend..."
cd apps/backend

# Sync dependencies with uv (creates venv and installs dependencies)
echo "Syncing Python dependencies with uv..."
uv sync

# Go back to root
cd ../..

# Setup frontend
echo "⚛️  Setting up frontend..."
cd apps/frontend
npm install

# Go back to root
cd ../..

echo "✅ Setup complete!"
echo ""
echo "To start development:"
echo "  npm run dev"
echo ""
echo "To build for production:"
echo "  npm run build"
echo ""
echo "For more information, see SETUP.md"
