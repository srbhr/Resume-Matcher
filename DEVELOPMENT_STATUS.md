# Resume Matcher EXE Packaging Status

## Goal
The goal is to package the Resume Matcher application into a single standalone EXE file (Windows) that works with a local Ollama instance, requiring no other dependencies (like Python or Node.js) on the user's machine.

## Current Status
- **Branch:** `fix/exe-packaging`
- **Build System:** PyInstaller (onedir mode for debugging, aim for onefile eventually).
- **Frontend:** Next.js static export integrated into FastAPI backend (`/static_ui`).
- **Backend:** FastAPI with dynamic path resolution for frozen environments.

### Known Issues
**Critical:** `NetworkError` on Resume Upload.
- **Symptom:** When uploading a resume on the frontend, the request fails immediately.
- **Backend Log:** `MagikaError: model dir not found`.
- **Cause:** The `magika` library (used for file type detection) attempts to load its machine learning models from a specific directory. In the frozen EXE environment, these models are either not being extracted correctly to `sys._MEIPASS` or the library is looking in the wrong place (e.g., a temp directory that doesn't match the extraction path).

## Key Modifications

### 1. PyInstaller Spec (`apps/backend/ResumeMatcher.spec`)
- Added `hiddenimports` for `uvicorn`, `fastapi`, `app`, etc.
- Added `datas` to include:
  - `static_ui` (Frontend assets)
  - `magika` models (Attempted inclusion via `venv_light/Lib/site-packages/magika`)
- **Action Item:** Verify the destination path of `magika` models in the `datas` tuple matches what the library expects at runtime.

### 2. Configuration (`apps/backend/app/core/config.py`)
- Modified to detect `sys.frozen`.
- `get_frontend_path()`: Returns `sys._MEIPASS/static_ui` when frozen.
- `Settings`: Loads `.env` from the executable directory in frozen mode.

### 3. Dynamic Modules (`apps/backend/app/prompt/base.py`, `schemas/json/base.py`)
- Replaced `pkgutil` dynamic scanning with explicit registration for `resume_analysis`, `structured_job`, etc.
- This fixes `ModuleNotFoundError` for prompts in the EXE.

### 4. Build Scripts
- `apps/backend/run.py`: Entry point for the EXE. Launches browser and uvicorn server.
- `apps/backend/debug_hooks.py`: Script to test `magika` resource collection.

## How to Build & Debug

### Prerequisites
1. Python 3.10+
2. Virtual Environment (Recommended: `venv_light` to avoid global package pollution)

### Build Command
Run from `apps/backend`:
```powershell
# Activate venv
.\venv_light\Scripts\activate

# Clean previous builds
pyinstaller --noconfirm --clean ResumeMatcher.spec
```

### Run the EXE
The output is in `dist/ResumeMatcher/ResumeMatcher.exe`.
Ensure `ollama` is running locally.

### Debugging
- Check `apps/backend/build_log.txt` (if you run the build via a wrapper, otherwise check terminal output).
- The EXE is currently built with `console=True`, so you can see runtime errors in the terminal window that opens.

## Next Steps for Fixer
1. **Fix Magika Path:** Investigate where `magika` looks for models. You may need to monkey-patch `magika` or adjust the `datas` target path in `ResumeMatcher.spec`.
2. **Verify File Upload:** Once Magika is fixed, verify the resume upload flow works end-to-end.
3. **Packaging:** Once stable, try building with `onefile` mode if desired, though `onedir` is easier for debugging.
