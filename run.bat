@echo off
title DuckBridge Desktop
cd /d "%~dp0"

REM Prioritize user Python installations over embedded tools like Inkscape
if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
    set "PATH=%LOCALAPPDATA%\Programs\Python\Python311;%LOCALAPPDATA%\Programs\Python\Python311\Scripts;%PATH%"
) else if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" (
    set "PATH=%LOCALAPPDATA%\Programs\Python\Python313;%LOCALAPPDATA%\Programs\Python\Python313\Scripts;%PATH%"
)

echo ===================================================
echo              DuckBridge Desktop Runner
echo ===================================================
echo.

echo [1/3] Checking Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is not found in PATH.
    echo Please install Node.js 18 or newer.
    pause
    exit /b 1
)

echo [2/3] Checking dependencies...
if not exist "node_modules" call npm install
if not exist "server\node_modules" (
    cd server
    call npm install
    cd ..
)

echo [3/3] Starting DuckBridge Desktop...
echo Close the app window or press Ctrl+C to stop.
echo.

call npm run tauri dev

if %errorlevel% neq 0 (
    echo.
    echo Error: App exited with code %errorlevel%.
)

pause
