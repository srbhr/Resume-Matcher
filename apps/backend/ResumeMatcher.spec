# -*- mode: python ; coding: utf-8 -*-


# from PyInstaller.utils.hooks import collect_all

datas = [('static_ui', 'static_ui'), ('venv_light/Lib/site-packages/magika', 'magika')]
binaries = []
hiddenimports = [
    'uvicorn', 'uvicorn.logging', 'uvicorn.loops', 'uvicorn.loops.auto', 
    'uvicorn.protocols', 'uvicorn.protocols.http', 'uvicorn.protocols.http.auto', 
    'uvicorn.lifespan', 'uvicorn.lifespan.on', 
    'fastapi', 'starlette', 'pydantic', 'app', 'app.main', 'aiosqlite', 'sqlite3', 
    'onnxruntime', 'tqdm',
    # Prompt modules loaded dynamically via pkgutil
    'app.prompt.resume_analysis',
    'app.prompt.resume_improvement',
    'app.prompt.structured_job',
    'app.prompt.structured_resume',
    # Schema modules loaded dynamically via pkgutil
    'app.schemas.json.resume_analysis',
    'app.schemas.json.resume_preview',
    'app.schemas.json.structured_job',
    'app.schemas.json.structured_resume'
]

a = Analysis(
    ['run.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['magika'],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='ResumeMatcher',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
