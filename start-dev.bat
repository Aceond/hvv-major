@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install from https://nodejs.org and run again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo [1/2] Installing dependencies...
  call npm install
)

echo [2/2] Starting dev server: http://localhost:5173
call npm run dev

pause
