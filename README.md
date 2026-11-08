# Flux

Voice-first AI money coach for Gen Z (HackUTD). FastAPI + Gemini; all financial math is deterministic Python.
Synthetic data only. Not financial advice.

### First time (Mac)

```bash
cd Flux
chmod +x setup.sh
./setup.sh
# edit .env and paste GEMINI_API_KEY
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Or by hand:

```bash
python3 -m venv .venv
source .venv/bin/activate          # must exist; if this fails, you skipped the line above
pip install -r requirements.txt    # installs fastapi, etc. into .venv
cp .env.example .env               # add GEMINI_API_KEY
uvicorn app.main:app --reload --port 8000
python -m pytest -q
```

Use the `uvicorn` from the activated venv (`which uvicorn` should show `.../Flux/.venv/bin/uvicorn`). If you see `ModuleNotFoundError: No module named 'fastapi'`, the venv is not active or you never ran `pip install -r requirements.txt`.

### UI (Next.js) — Windows PowerShell

The frontend lives in `ui/` (from the teammate's Flux_UI repo), already wired to this backend.

```powershell
# terminal 1 — backend
cd $HOME\Flux
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --port 8000

# terminal 2 — UI (needs Node 22+ and pnpm: npm install -g pnpm)
cd $HOME\Flux\ui
pnpm install
pnpm dev
```

Open http://localhost:3000 → **Explore with demo data** → finish onboarding → **Flux AI** chat.
Demo mode does **not** need Figma/Payload. Chat and voice call this backend.

More detail: [ui/README.md](ui/README.md).

See [BUILD_LOG.md](BUILD_LOG.md) for endpoints, design notes, and known limitations.
`wellness/` is adapted from [PNC's workshop repo](https://github.com/devfulcrum/pnc-utd-hackathon-2026) (Apache-2.0).
