#!/usr/bin/env bash
# One-time setup (Mac/Linux). Run from the Flux repo root: ./setup.sh
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v python3 >/dev/null; then
  echo "Install Python 3.11+ from https://www.python.org/downloads/ then rerun."
  exit 1
fi
python3 -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate
python -m pip install --upgrade pip
# Prefer prebuilt wheels (avoids compiling cryptography + Rust on Mac when disk is tight)
if ! pip install -r requirements.txt; then
  echo ""
  echo "If you saw 'No space left on device' or a cryptography/Rust error:"
  echo "  1. Free several GB (Trash, Downloads, Xcode simulators, old Docker images)."
  echo "  2. rm -rf .venv ~/Library/Caches/puccinialin"
  echo "  3. python3 -m pip cache purge"
  echo "  4. Run ./setup.sh again"
  exit 1
fi
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env — add your GEMINI_API_KEY before using /chat with Gemini."
fi
echo ""
echo "Setup done. Each new terminal:"
echo "  cd $(pwd)"
echo "  source .venv/bin/activate"
echo "  uvicorn app.main:app --reload --port 8000"
