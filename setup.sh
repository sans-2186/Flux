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
pip install -r requirements.txt
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env — add your GEMINI_API_KEY before using /chat with Gemini."
fi
echo ""
echo "Setup done. Each new terminal:"
echo "  cd $(pwd)"
echo "  source .venv/bin/activate"
echo "  uvicorn app.main:app --reload --port 8000"
