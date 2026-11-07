# Flux - Build Log

Voice-first AI money coach for Gen Z (HackUTD: PNC 360° Financial Health Navigator, Toyota "What's Your Next Move?", Gemini API).

Status: **Step 1 done** - project set up from PNC's workshop repo, FastAPI skeleton, `POST /chat` Phase 1 (education) wired to Gemini.

## Saved checkpoints

Each finished phase gets a git tag pushed to GitHub, so you can always get back to it.
The code lives on the branch `cursor/nudge-backend-setup-a1cb` (branch name is from the old working title) until PR #1 is merged into `main`; `main` only has the initial README until then.

| Tag | Contents |
|---|---|
| `phase-1` | Setup + PNC wellness math + `/chat` education |

```bash
# first time on your laptop
git clone https://github.com/sans-2186/Flux.git && cd Flux
git fetch --tags && git checkout cursor/nudge-backend-setup-a1cb
# later, to pull new work
git pull
# to look at an old phase without losing anything
git checkout phase-1        # go back to main work with: git checkout cursor/nudge-backend-setup-a1cb
```

## Expected results (how to know it works)

**Phase 1 (done)**
- `python -m pytest -q` prints `9 passed`.
- `curl http://localhost:8000/` returns `{"status":"ok","gemini_configured":true,...}`. If it says `false`, your `.env` is not loaded.
- `POST /chat {"message":"what is an IRA?"}` returns `"source":"gemini"`, `"mode":"education"`, a casual 3-5 sentence answer with no markdown, ending in `Not financial advice - just education to help you decide.` Wording varies run to run; the structure should not.
- Without a key: same shape but `"source":"mock"` and a placeholder reply.
- Empty message returns HTTP 422. Bad key returns HTTP 502 with `API key not valid`.

**Phase 2 (planned)**
- `/onboard` returns a `user_id` and a budget whose categories add up to the monthly income you sent.
- `/health/{user_id}` returns 4+ indicators, each with `value`, `status` (`good`/`ok`/`risk`) and a one-line explanation. Example: income 3000, expenses 2400 gives savings rate 0.20 = `good`.
- Tools are exact and repeatable: same input always gives the same numbers (checked by pytest). Example: car value 15000, loan 11000 gives trade-in equity +4000.
- `/chat` with `user_id` and "can I buy a $300 bag?" answers yes/no using the tool's numbers, never numbers Gemini made up.

**Phase 3 (planned)**
- Adding a transaction 5x bigger than usual, from a new merchant, or at 3 AM shows up in `/alerts/{user_id}` with a plain-language reason. A normal-sized grocery purchase does not.
- `/handoff` returns a short who / what / why summary.

**Voice (planned)**
- `/speak` returns playable audio, or the frontend falls back to browser speech if TTS is flaky.

---

## 1. Dependencies

Python 3.12 (3.11+ works). All pinned in `requirements.txt`.

| Package | Version | Why |
|---|---|---|
| fastapi | 0.162.2 | HTTP API framework |
| uvicorn[standard] | 0.54.0 | ASGI server to run FastAPI |
| pydantic | 2.14.3 | Request/response validation (FastAPI models) |
| google-genai | 3.0.0 | Official Gemini SDK (chat, function calling, TTS later) |
| python-dotenv | 1.2.4 | Loads `GEMINI_API_KEY` from `.env` |
| pytest | 9.2.0 | Tests |
| httpx | 0.28.1 | Required by FastAPI's `TestClient` in tests |

System package (only needed on fresh Ubuntu VMs): `python3.12-venv` so `python3 -m venv` works.

The vendored `wellness/` code uses only the standard library. We did **not** install PNC's `langgraph`/`streamlit`/OpenAI deps.

## 2. Files

| File | What it does |
|---|---|
| `app/__init__.py` | Makes `app` a package |
| `app/main.py` | FastAPI app: `GET /`, `POST /chat`; CORS open for the frontend |
| `app/llm.py` | Gemini client wrapper, education system prompt, disclaimer helper, mock fallback when no key |
| `wellness/__init__.py` | Copied from PNC repo, unchanged |
| `wellness/data_gen.py` | Copied from PNC: seeded synthetic customer generator (accounts + 6 months of transactions) |
| `wellness/profile.py` | Copied from PNC: rolls accounts/transactions into one profile (income, spending, debt payments, liquid cash) |
| `wellness/metrics.py` | Copied from PNC: deterministic health indicators (savings rate, DTI, emergency fund months, credit utilization, ...) |
| `wellness/forecast.py` | Copied from PNC: linear month-by-month cash projection |
| `wellness/scenarios.py` | Copied from PNC: car purchase what-if (amortized loan payment) |
| `wellness/validation.py` | Copied from PNC: sanity checks on tool outputs (NaN, negative loan, missing metrics) |
| `wellness/LICENSE-PNC` | PNC repo's Apache-2.0 license (required when redistributing their code) |
| `tests/test_wellness.py` | Tests for the vendored PNC math (subset of PNC's tests + a forecast test) |
| `tests/test_api.py` | API tests for `/` and `/chat` (Gemini monkeypatched, no key needed) |
| `setup.sh` | Mac/Linux one-shot: creates `.venv`, installs deps, copies `.env.example` if needed |
| `requirements.txt` | Pinned dependencies |
| `.env.example` | Template for `GEMINI_API_KEY`, `GEMINI_MODEL` |
| `.gitignore` | Ignores `.venv`, `.env`, caches, `data/*.json` |
| `BUILD_LOG.md` | This file |

Not copied from PNC (not needed / would add deps): `wellness/llm.py` (OpenAI/Ollama adapters), `graph.py` (LangGraph), `levels.py`, `cli.py`, `tools.py` (we will write Gemini function-calling tools instead), `Lab_Package/`.

## 3. Endpoints

### `GET /` - health check of the server
Returns whether a Gemini key is configured and which model is used.
```bash
curl http://localhost:8000/
# {"status":"ok","gemini_configured":true,"model":"gemini-2.5-flash"}
```

### `POST /chat` - Phase 1 education
Body: `{"message": str, "user_id": str | null}`. Sends the message to Gemini with a Gen Z coach system prompt (3-5 sentences, no markdown since it is read aloud). The disclaimer is appended **in Python**, not by the LLM, so it is always present.
`user_id` is accepted but **ignored for now** (Phase 2 will route to the personalized agent).
```bash
curl -X POST http://localhost:8000/chat -H 'Content-Type: application/json' \
  -d '{"message":"what is an IRA?"}'
# {"reply":"... \n\nNot financial advice - just education to help you decide.","mode":"education","source":"gemini"}
```
`source` is `"gemini"` for real answers or `"mock"` when no API key is set. Gemini errors return HTTP 502 with the error message.

## 4. Deterministic tools vs LLM calls

| Function | Kind |
|---|---|
| `wellness.metrics.compute_metrics` | Deterministic Python |
| `wellness.forecast.forecast_cash` | Deterministic Python |
| `wellness.scenarios.car_purchase` | Deterministic Python |
| `wellness.profile.build_profile` | Deterministic Python |
| `wellness.data_gen.generate_customer` | Deterministic (seeded random) synthetic data |
| `app.llm.with_disclaimer` | Deterministic Python |
| `app.llm.explain` | **LLM call** (Gemini `generate_content`, explanation only, no user numbers) |

## 5. Known limitations / shortcuts / mocks

- **Mock mode:** if `GEMINI_API_KEY` is missing, `/chat` returns a placeholder reply with `"source":"mock"` instead of failing, so the frontend can be built without a key.
- Phase 1 does not classify "general vs personal" questions yet; every message goes to the education prompt. The prompt tells Gemini not to compute personal numbers.
- No conversation memory yet (each `/chat` call is stateless).
- PNC's metrics use status labels `good/watch/risk`; the spec asks for `good/ok/risk`. Will map `watch -> ok` when building `/health`.
- PNC's generator always creates a mortgage, CD, IRA, etc. (an older, wealthier profile). For Gen Z onboarding we will build the profile from the user's form input instead and only reuse the math.
- Verified the Gemini call reaches Google's API (a fake key returns `API_KEY_INVALID`); a real-key answer has not been tested in this environment because no key is available here.

## 6. How to run

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then paste your Gemini key into .env
uvicorn app.main:app --reload --port 8000
# interactive docs: http://localhost:8000/docs
python -m pytest -q           # tests (no API key needed)
```

### Common errors

| Error | Fix |
|---|---|
| `source: no such file or directory: .venv/bin/activate` | Run `python3 -m venv .venv` first (or `./setup.sh`) |
| `ModuleNotFoundError: No module named 'fastapi'` | Activate venv (`source .venv/bin/activate`), run `pip install -r requirements.txt`; don't use global `/Library/.../bin/uvicorn` |
| `ensurepip is not available` when creating venv | `sudo apt install python3.12-venv` (Ubuntu/Debian) |
| `"source":"mock"` in replies | `.env` missing or `GEMINI_API_KEY` empty; restart uvicorn after editing `.env` |
| HTTP 502 `API key not valid` | Wrong key; create one at https://aistudio.google.com/apikey |
| HTTP 502 `404 ... model not found` | Set `GEMINI_MODEL` in `.env` to a model your key can use (e.g. `gemini-2.5-flash`) |
| HTTP 502 `429 RESOURCE_EXHAUSTED` | Free-tier rate limit; wait a minute or switch to `gemini-2.5-flash-lite` |
| `ModuleNotFoundError: app` | Run commands from the repo root, not inside `app/` |
| Browser CORS error | CORS is open (`*`) in `app/main.py`; make sure you hit the right port |
