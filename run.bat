@echo off
title DuckBridge Desktop
cd /d "%~dp0"

REM Prioritize portable Python and user Python 3.x installations over Inkscape
if exist "python\python.exe" (
    set "PATH=%CD%\python;%CD%\python\Scripts;%PATH%"
) else (
    for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python3*") do (
        if exist "%%D\python.exe" set "PATH=%%D;%%D\Scripts;%PATH%"
    )
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
