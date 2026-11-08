# Flux UI

Next.js frontend (from [Cindiya/Flux_UI](https://github.com/Cindiya/Flux_UI)), vendored into the Flux backend repo and wired to the FastAPI coach (`/chat`, `/speak`).

## Run locally (Windows PowerShell)

**Terminal 1 — backend** (repo root):
```powershell
cd $HOME\Flux
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --port 8000
```

**Terminal 2 — UI**:
```powershell
cd $HOME\Flux\ui
pnpm install
pnpm dev
```

Open http://localhost:3000 → **Explore with demo data** → finish the short onboarding → bottom nav **Flux AI**.

Needs Node 22+ and [pnpm](https://pnpm.io/installation) (`npm install -g pnpm`). The UI's Payload/Figma database is **not** required for demo mode: profile, snapshot, goals and scenarios stay on the device. Chat and voice call the Python backend.

## Run locally (Mac / Linux)

```bash
# terminal 1
cd /path/to/Flux && source .venv/bin/activate && uvicorn app.main:app --port 8000
# terminal 2
cd /path/to/Flux/ui && pnpm install && pnpm dev
```

## Env

Copy `.env.local.example` to `.env.local` if you need to point at a different backend URL.
