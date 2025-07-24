# 🚀 Resume Matcher - Quick Install Guide

**Having trouble with setup? This guide fixes the most common issues!**

## 🎯 One-Command Setup

```bash
# Clone and setup in one go
git clone https://github.com/srbhr/Resume-Matcher.git
cd Resume-Matcher
python quick-setup.py
```

## ⚠️ Common Issues & Instant Fixes

### Issue 1: Python 3.12+ Errors (cytoolz failures)
**Error**: `cytoolz compilation error`, `Cython build failed`

**Quick Fix**: Use Python 3.11
```bash
# If you have pyenv
pyenv install 3.11.7
pyenv local 3.11.7

# Or use conda
conda create -n resume-matcher python=3.11
conda activate resume-matcher
```

### Issue 2: NLTK WordNet Not Found
**Error**: `LookupError: Resource wordnet not found`

**Quick Fix**: Already handled by `quick-setup.py` automatically!

### Issue 3: pip install failures
**Quick Fix**: Update pip first
```bash
pip install --upgrade pip setuptools wheel
```

## 🖥️ Platform-Specific Quick Commands

### Windows
```powershell
# Option 1: PowerShell script
.\setup.ps1

# Option 2: Quick setup (recommended)
python quick-setup.py
```

### Linux/macOS
```bash
# Option 1: Bash script
chmod +x setup.sh && ./setup.sh

# Option 2: Quick setup (recommended)  
python quick-setup.py
```

## 🔧 If Nothing Works

Try the manual approach:
```bash
# 1. Create virtual environment
python3.11 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 2. Update pip
pip install --upgrade pip setuptools wheel

# 3. Install backend dependencies
cd apps/backend
pip install -e .

# 4. Install frontend dependencies
cd ../frontend
npm install

# 5. Download NLTK data
python -c "import nltk; nltk.download('wordnet'); nltk.download('punkt')"
```

## 🤝 Need Help?

1. **Try the quick setup first**: `python quick-setup.py`
2. **Check GitHub Issues**: https://github.com/srbhr/Resume-Matcher/issues/312
3. **Join Discord**: https://dsc.gg/resume-matcher

**The quick-setup.py script is designed to automatically handle all known issues!**
