# Flux - Build Log

Voice-first AI money coach for Gen Z (HackUTD: PNC 360° Financial Health Navigator, Toyota "What's Your Next Move?", Gemini API).

Status: **Phase 1 done** (education `/chat`). **Phase 2 done** (`/onboard`, `/health`, 5 Gemini tools, personalized `/chat`). Next: Voice `/speak`, then Phase 3 (fraud alert).

## Saved checkpoints

Everything lives on `main` at https://github.com/sans-2186/Flux. Each finished phase also gets a git tag.

| Tag | Contents |
|---|---|
| `phase-1` | Setup + PNC wellness math + `/chat` education |
| `phase-2` | `/onboard`, `/health`, deterministic tools, Gemini function calling in `/chat` |

```bash
git clone https://github.com/sans-2186/Flux.git && cd Flux   # latest work
git pull                                                      # later, to get new work
git fetch --tags && git checkout phase-1                      # look at an old phase; `git checkout main` to return
```

## Expected results (how to know it works)

**Phase 1 (done)**
- `curl http://localhost:8000/` returns `"gemini_configured": true`. If `false`, your `.env` is not loaded.
- `POST /chat {"message":"what is an IRA?"}` returns `"source":"gemini"`, `"mode":"education"`, a casual 3-5 sentence answer, ending in `Not financial advice - just education to help you decide.`
- Without a key: `"source":"mock"` (or `"fallback_canned"` for topics we have canned answers for). Empty message: HTTP 422.

**Phase 2 (done)** - verified end to end with the sample user in section 3
- `POST /onboard` returns a `user_id` like `u_dad27303`, a budget whose categories add up to exactly the monthly income, and 4 health indicators.
- `GET /health/{user_id}` returns 4 indicators, each with `value`, `status` (`good`/`ok`/`risk`) and a one-line `explanation`. Example: income 3000, expenses 2400, no debt gives savings rate 0.2 = `good`. Sample user below: savings rate 0.1859 `ok`, debt-to-income 0.1578 `good`, emergency fund 1.3436 months `risk`, credit utilization 0.3 `ok`.
- Tools are exact and repeatable: same input, same numbers (pytest). Example: car worth 15000 with 11000 loan gives equity +4000.
- `POST /chat` with a `user_id` returns `"mode":"coach"`, `"source":"gemini"`, and `"tools_used":["can_afford"]` for "can I buy a $300 bag?". The answer's numbers come from the tool. If `tools_used` is empty on a personal question, Gemini answered without checking the numbers; ask again.
- Unknown `user_id` returns HTTP 404 `Unknown user_id. Call POST /onboard first.`

**Phase 3 (planned)**
- A transaction 5x bigger than usual, from a new merchant, or at 3 AM shows up in `/alerts/{user_id}` with a plain-language reason. A normal grocery purchase does not.
- `/handoff` returns a short who / what / why summary.

**Voice (planned)**
- `/speak` returns playable audio from Gemini TTS, or the frontend falls back to browser speech if TTS is flaky.

---

## 1. Dependencies

Python 3.12 (3.11+ works). All pinned in `requirements.txt`. **No new packages were added in Phase 2.**

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
| `app/main.py` | FastAPI app and endpoints: `GET /`, `POST /onboard`, `GET /health/{id}`, `POST /chat`; CORS open |
| `app/finance.py` | **All deterministic math**: budget, health indicators, can_afford, retirement_check, forecast_balances, what_if, trade_in_equity/trade_in_check |
| `app/agent.py` | Wraps the finance functions as Gemini tools (plain Python functions, SDK does function calling); coach system prompt; health-snapshot fallback |
| `app/llm.py` | Gemini client, model fallback chain (`run_chain`), education prompt, disclaimer helper, mock/canned fallbacks |
| `app/store.py` | Users in memory, mirrored to `data/users.json` (path override: `FLUX_DATA_FILE`) |
| `app/demo_fallbacks.py` | Canned education answers (IRA, interest rates, credit score, emergency fund, budget) for when Gemini is down |
| `app/__init__.py` | Makes `app` a package |
| `wellness/data_gen.py` | Copied from PNC: seeded synthetic customer generator (not used by the API yet; Phase 3 may use it for transaction history) |
| `wellness/profile.py` | Copied from PNC: rolls accounts/transactions into one profile (not used directly; `finance.build_profile` builds the same shape from the onboarding form) |
| `wellness/metrics.py` | Copied from PNC: used by `/health` (`compute_metrics`) |
| `wellness/forecast.py` | Copied from PNC: used by `forecast_balances` (`forecast_cash`) |
| `wellness/scenarios.py` | Copied from PNC: car purchase what-if (not wired yet) |
| `wellness/validation.py` | Copied from PNC: sanity checks on tool outputs (not wired yet) |
| `wellness/__init__.py`, `wellness/LICENSE-PNC` | Package marker; PNC's Apache-2.0 license |
| `tests/test_finance.py` | 23 tests for the math: affordability, retirement, trade-in equity, health, budget, forecast, what-if |
| `tests/test_api.py` | API tests: onboard, health, 404s, persistence, chat fallbacks, and a full Gemini function-calling loop against a fake local Gemini server |
| `tests/test_wellness.py`, `tests/test_fallbacks.py` | Vendored PNC math tests; canned-answer fallback tests |
| `setup.sh` | Mac/Linux one-shot: creates `.venv`, installs deps, copies `.env.example` |
| `requirements.txt`, `.env.example`, `.gitignore` | Pinned deps; env template; ignores `.venv`, `.env`, `data/*.json` |
| `BUILD_LOG.md` | This file |

## 3. Endpoints (with curl)

Sample user used below (saved as shell variable `UID_` after onboarding):

```bash
curl -s -X POST http://localhost:8000/onboard -H 'Content-Type: application/json' -d '{
  "name":"Sam","age":22,"monthly_income":3200,"monthly_expenses":2100,"savings":3500,
  "debts":[{"name":"student loan","balance":14000,"monthly_payment":180}],
  "credit_card_balance":900,"credit_limit":3000,"goals":["buy a car","retire early"],
  "vehicle":{"make":"Toyota","model":"Corolla","year":2019,"value":15000,"loan_balance":11000,"monthly_payment":300}}'
# {"user_id":"u_dad27303","name":"Sam","budget":{...,"total":3200.0},"health":[4 indicators]}
```

### `GET /`
Whether a key is configured, the primary model and the fallback chain.
```bash
curl http://localhost:8000/
# {"status":"ok","gemini_configured":true,"model":"gemini-3.8-flash","model_fallbacks":["gemini-3.8-flash","gemini-3.5-flash-lite","gemini-3.1-flash-lite"]}
```

### `POST /onboard`
Body: `name, age, monthly_income, monthly_expenses, savings, debts[{name,balance,monthly_payment}], credit_card_balance, credit_limit, goals[], vehicle?{make,model,year,value,loan_balance,monthly_payment}`. Saves the user and returns a generated budget plus the 4 health indicators. Budget rule: debt payments as-is, 20% of income to savings, the rest split 40% housing / 20% food / 10% transport / 8% utilities / 15% fun / 7% subscriptions; the total always equals income (`over_budget: true` if debt payments alone exceed income). Validation errors return HTTP 422.

### `GET /health/{user_id}`
```bash
curl http://localhost:8000/health/u_dad27303
# {"user_id":"u_dad27303","name":"Sam","indicators":[{"id":"savings_rate","label":"Savings rate","value":0.1859,"status":"ok","explanation":"You keep 19% of income after expenses and debt payments; aim for 20% or more."}, ...]}
```
Thresholds are PNC's: savings rate good >= 20%, ok >= 10%; debt-to-income good <= 20%, ok <= 36%; emergency fund good >= 6 months, ok >= 3; credit utilization good <= 10%, ok <= 30%. PNC's `watch` label is shown as `ok`.

### `POST /chat`
Body `{"message": str, "user_id": str | null}`.
- **Without `user_id`** (Phase 1): general education via Gemini, 3-5 sentences. `"mode":"education"`.
- **With `user_id`** (Phase 2): Gemini gets the six tools below and must call them for any personal number. `"mode":"coach"`, `tools_used` lists which tools ran.
```bash
curl -X POST http://localhost:8000/chat -H 'Content-Type: application/json' \
  -d '{"message":"can I buy a $300 bag?","user_id":"u_dad27303"}'
# {"reply":"... \n\nNot financial advice - just education to help you decide.","mode":"coach","source":"gemini","tools_used":["can_afford"]}
curl -X POST http://localhost:8000/chat -H 'Content-Type: application/json' \
  -d '{"message":"can I retire at 50 on 90k?","user_id":"u_dad27303"}'
# tools_used: ["retirement_check"]
curl -X POST http://localhost:8000/chat -H 'Content-Type: application/json' \
  -d '{"message":"should I trade in my car?","user_id":"u_dad27303"}'
# tools_used: ["trade_in_check"]
```
`source`: `gemini` (primary model), `gemini:<model>` (fallback model answered), `fallback_health` (Gemini unreachable: deterministic health snapshot), `fallback_canned` / `fallback_generic` / `mock` (education mode). The disclaimer is appended in Python. Unknown `user_id` returns 404.

### The tools Gemini can call (`app/agent.py` -> `app/finance.py`)
| Tool | Inputs | Returns |
|---|---|---|
| `can_afford` | `price` | `affordable` yes/no, `reason`, monthly surplus, months of surplus needed, emergency fund months before/after paying from savings |
| `retirement_check` | `target_age`, optional `annual_income`, `current_savings` (default to profile) | `on_track`, `projected_balance`, `needed_balance`, `shortfall`, monthly contribution assumed vs needed, `assumptions[]` |
| `forecast_balances` | `months` (1-60) | starting/ending balance, monthly income, obligations, net cash flow, lowest balance, `goes_negative`, month-by-month projection |
| `what_if` | dollar deltas: `monthly_income_change`, `monthly_expenses_change`, `savings_change`, `debt_payment_change`, `credit_card_balance_change` | before/after value and status per indicator, surplus before/after |
| `trade_in_check` | none (uses the user's vehicle) | `estimated_equity` = value - loan balance, `makes_sense_now`, `reason`, ONE `next_step` of type `self_service` / `follow_up` / `eligible_offer` |
| `health_check` | none | the 4 indicators (extra helper so "how am I doing?" works) |

`what_if(change)` from the spec is implemented as numeric dollar deltas rather than free text, so Gemini only has to map words to numbers ("cut $200 of dining" -> `monthly_expenses_change=-200`) and Python does the rest.

## 4. Deterministic tools vs LLM calls

| Function | Kind |
|---|---|
| `finance.can_afford`, `retirement_check`, `forecast_balances`, `what_if`, `trade_in_equity`, `trade_in_check`, `generate_budget`, `health_indicators`, `monthly_debt_payments` | Deterministic Python (no randomness, no LLM) |
| `wellness.metrics.compute_metrics`, `wellness.forecast.forecast_cash` | Deterministic Python (PNC) |
| `llm.with_disclaimer`, `store.*`, `demo_fallbacks.lookup` | Deterministic Python |
| `llm.explain` | **LLM call**: education answer, no user numbers |
| `agent.coach_reply` -> `llm.run_chain` | **LLM call with function calling**: Gemini chooses a tool and explains its result; the tool does the math |

## 5. Known limitations / shortcuts / mocks

- **Function calling is not verified against the real Gemini service.** No Gemini key exists in the build environment. It IS verified through the real `google-genai` SDK against a fake local server that speaks Gemini's REST format (`tests/test_api.py::test_chat_coach_runs_real_function_calling_loop`): tools are declared, the SDK calls our Python function, and the result goes back. Please run the three coach curls above once with your key. Check the uvicorn terminal for `flux.llm` warnings if you see `fallback_health`.
- The SDK prints "Direct use of automatic function calling in Models.generate_content is not recommended". It is a warning only; it works.
- **Mocked / stubbed:** `eligible_offer` in `trade_in_check` is a label only. No real Toyota offer or valuation lookup. Vehicle value is whatever the user typed.
- **Assumptions (also returned by the tools):**
  - `monthly_expenses` means living costs *excluding* debt payments; debt payments come from `debts[]`, the vehicle payment, and an assumed credit-card minimum (greater of $25 or 2% of balance).
  - `can_afford` says yes if the price fits in one month of leftover cash, or if paying from savings still leaves 3+ months of bills. It treats the purchase as one-time cash.
  - Retirement: `annual_income` is read as current yearly income. It assumes saving 15% of income, a 5% return after inflation, needing 80% of income, a 4% withdrawal rate, and ignores Social Security. "Retire at 50 on 90k" therefore targets $1.8M.
  - Trade-in "makes sense" when equity is at least 20% of the car's value. Loan interest and depreciation over time are not modeled.
- Storage is in memory plus a JSON file (`data/users.json`, git-ignored). No auth: anyone with a `user_id` can read that profile. One process only.
- No conversation memory: each `/chat` call is independent.
- The "synthetic profile" is whatever the user types into `/onboard`; we do not generate extra fake accounts or transactions yet (PNC's generator is unused until Phase 3).
- `gemini-3.8-flash` can be slow or return 503. `/chat` retries once, then tries `gemini-3.5-flash-lite`, then `gemini-3.1-flash-lite`, then falls back to canned text (education) or a health snapshot (coach).
- Extended "thinking" is not disabled by default any more (not every 3.x model accepts `thinking_budget`). Opt in with `GEMINI_THINKING_BUDGET=0` if your model accepts it and you want speed.

## 6. How to run

```bash
./setup.sh                       # first time (creates .venv, installs deps, makes .env)
# paste GEMINI_API_KEY into .env
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000     # interactive docs: http://localhost:8000/docs
python -m pytest -q              # 42 tests, no API key needed
```
Use a second terminal for curl. After editing `.env`, restart uvicorn.

### Common errors

| Error | Fix |
|---|---|
| `source: no such file or directory: .venv/bin/activate` | Run `python3 -m venv .venv` first (or `./setup.sh`) |
| `ModuleNotFoundError: No module named 'fastapi'` | Activate venv (`source .venv/bin/activate`), run `pip install -r requirements.txt`; don't use global `/Library/.../bin/uvicorn` |
| `cryptography` / Rust / `No space left on device (os error 28)` on Mac | Disk is full. Free space (2-5 GB+), then `python3 -m pip cache purge`, `rm -rf .venv ~/Library/Caches/puccinialin`, rerun `./setup.sh` |
| `ensurepip is not available` when creating venv | `sudo apt install python3.12-venv` (Ubuntu/Debian) |
| `"source":"mock"` in replies | `.env` missing or `GEMINI_API_KEY` empty; restart uvicorn after editing `.env` |
| `/chat` with `user_id` says `"source":"fallback_health"` | Gemini failed on every model. Read the `flux.llm` warnings in the uvicorn terminal (bad key, quota, model name, 503) |
| `"source":"gemini:gemini-3.5-flash-lite"` | The primary model was busy; the backup answered. Fine |
| `"tools_used":[]` on a personal question | Gemini answered without calling a tool. Ask again, or be more specific ("can I afford $300?") |
| 404 `Unknown user_id` | The id is wrong, or `data/users.json` was deleted. Call `POST /onboard` again |
| 422 on `/onboard` | A required field is missing or invalid (`monthly_income` must be > 0; numbers cannot be negative) |
| `404` model no longer available (new API keys) | Set `GEMINI_MODEL=gemini-3.8-flash` in `.env` and restart (`2.5-*` is blocked for new users) |
| `429 RESOURCE_EXHAUSTED` | Free-tier rate limit; wait a minute or use `gemini-3.5-flash-lite` |
| `ModuleNotFoundError: app` | Run commands from the repo root, not inside `app/` |
| Browser CORS error | CORS is open (`*`) in `app/main.py`; make sure you hit the right port |
