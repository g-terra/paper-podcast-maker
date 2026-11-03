@echo off
rem Double-click to open Paper Podcast Maker (installs, builds and starts it if needed).
cd /d "%~dp0"
where node >nul 2>nul || (
  echo Install Node.js 22+ from https://nodejs.org first.
  start "" https://nodejs.org
  pause
  exit /b 1
)
node bin\ppm.mjs open || pause
