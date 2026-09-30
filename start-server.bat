@echo off
setlocal
cd /d "%~dp0"
title BNHS SHS Grading System

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo First run: installing. This needs internet and takes a few minutes...
  call npm install
  if errorlevel 1 ( pause & exit /b 1 )
)

if not exist apps\web\dist\index.html (
  echo Building the app...
  call npm run build
  if errorlevel 1 ( pause & exit /b 1 )
)

set NODE_ENV=production
echo.
echo ================================================================
echo  BNHS SHS Grading System
echo  On this computer:   http://localhost:3000
echo  Other devices:      http://THIS-COMPUTER-IP:3000   (run "ipconfig" to see the IP)
echo  Stop the server:    close this window or press Ctrl+C
echo ================================================================
echo.
call npm start
pause
