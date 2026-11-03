@echo off
rem ppm launcher for Windows.
where node >nul 2>nul || (echo Install Node.js 22+ from https://nodejs.org first. & exit /b 1)
node "%~dp0ppm.mjs" %*
