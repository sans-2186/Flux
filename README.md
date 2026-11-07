# Nudge

Voice-first AI money coach for Gen Z (HackUTD). FastAPI + Gemini; all financial math is deterministic Python.
Synthetic data only. Not financial advice.

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add GEMINI_API_KEY
uvicorn app.main:app --reload --port 8000
python -m pytest -q
```

See [BUILD_LOG.md](BUILD_LOG.md) for endpoints, design notes, and known limitations.
`wellness/` is adapted from [PNC's workshop repo](https://github.com/devfulcrum/pnc-utd-hackathon-2026) (Apache-2.0).
