#!/bin/bash
# Double-click to set up paper-podcast-maker (safe to run again).
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Paper Podcast Maker needs Node.js 22 or newer (free). Opening https://nodejs.org: install the LTS version, then double-click this again."
  open "https://nodejs.org"; read -r -p "Press Enter to close…"; exit 1
fi
node bin/ppm.mjs setup && node bin/ppm.mjs open
echo; read -r -p "Press Enter to close this window…"
