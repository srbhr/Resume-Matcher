@echo off
title Resume Matcher Launcher
echo ==========================================
echo       Starting Resume Matcher...
echo ==========================================
echo.

:: Check for backend folder
if not exist "apps\backend" (
    echo [ERROR] Backend folder not found at apps\backend
    goto error
)

:: Check for frontend folder
if not exist "apps\frontend" (
    echo [ERROR] Frontend folder not found at apps\frontend
    goto error
)

:: Check for AUTOMATED APPLY folder
if not exist "AUTOMATED APPLY" (
    echo [ERROR] AUTOMATED APPLY folder not found
    goto error
)

:: Start the Backend in a separate command window
echo Starting backend server (FastAPI)...
start "Resume Matcher - Backend" cmd /k "cd apps\backend && uv run app"

:: Start the Frontend in a separate command window
echo Starting frontend server (Next.js)...
start "Resume Matcher - Frontend" cmd /k "cd apps\frontend && npm run dev"

:: Start the Job Applier Scraper in a separate command window
echo Starting Job Applier and Scraper (python main.py)...
start "Resume Matcher - Job Applier" cmd /k "cd "extensions\automated-apply" && venv\Scripts\python.exe -u main.py"

:: Wait 5 seconds using ping (works in redirected environments where timeout fails)
echo Waiting for servers to initialize...
ping -n 5 127.0.0.1 >nul

:: Open the default browser to the web app has been disabled
echo You can open http://localhost:3000 in your browser when ready.

echo.
echo ==========================================
echo   Resume Matcher processes launched!
echo ==========================================
exit /b 0

:error
echo.
echo Failed to start the project. Please ensure this script is placed in the root directory of the Resume-Matcher repository.
echo.
pause
exit /b 1
