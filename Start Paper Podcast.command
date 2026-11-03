#!/bin/bash
# Double-click to open Paper Podcast Maker (installs, builds and starts it if needed).
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Install Node.js 22+ from https://nodejs.org first."; open "https://nodejs.org"; read -r -p "Press Enter to close…"; exit 1; }
node bin/ppm.mjs open || read -r -p "Press Enter to close…"
