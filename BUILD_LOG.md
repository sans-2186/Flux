# Flux - Build Log

Voice-first AI money coach for Gen Z (HackUTD: PNC 360° Financial Health Navigator, Toyota "What's Your Next Move?", Gemini API).

Status: **Phase 1 done** (education `/chat`). **Phase 2 done** (`/onboard`, `/health`, Gemini tools, personalized `/chat`), now **grounded on PNC's mock dataset** (no hidden assumptions, see "How the agent uses the mock data"). **Toyota track added** (vehicle finances, from Toyota's "Next Move" data pack: `/next-move`). **Voice `/speak` done.** **Phase 3 done** (`/transactions`, `/alerts/{id}`, `/handoff`). All phases are built; what remains is testing with a real Gemini key.

## Saved checkpoints

Everything lives on `main` at https://github.com/sans-2186/Flux. Each finished phase also gets a git tag.

| Tag | Contents |
|---|---|
| `phase-1` | Setup + PNC wellness math + `/chat` education |
| `phase-2` | `/onboard`, `/health`, deterministic tools, Gemini function calling in `/chat` (first version, used some assumptions) |
| `phase-2.1` | Same, grounded on PNC's mock data: 30 demo customers, no assumed rates/payments/budget weights |
| `phase-2.2` | Adds the Toyota data pack: 20 Toyota customers (`TY-C001`..`TY-C020`), `/next-move/{id}`, Toyota guardrails, coach tools for vehicle finance |
| `phase-3` | Adds `/speak` (Gemini TTS with browser-speech fallback), `/transactions` flags, `/alerts/{id}`, `/handoff` |

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

**Phase 2 (done)** - verified end to end on a running server
- `GET /demo-users` lists the 30 PNC mock customers (`C001`..`C030`). Use those ids in `/health` and `/chat`; no onboarding needed.
- `GET /health/C002` returns `"data_source":"pnc_mock"` and: savings rate 0.2663 `good`, debt-to-income 0.1131 `good`, emergency fund 4.9524 months `ok`, credit utilization 0.0715 `good`. Each indicator has a one-line `explanation`.
- `POST /chat {"message":"can I retire at 50 on 90k?","user_id":"C002"}` calls `retirement_check` using Maya's real IRA balance ($65,502), her real monthly IRA deposits ($178.33) and the IRA's recorded 3.5% yield. Expected answer: not on track; needs about $2.57M, projected about $193.6k. The reply says which inputs came from her records.
- `POST /chat {"message":"should I trade in my car?","user_id":"C008"}` gives `eligible_offer` (equity about $18.5k); `C002` gives `follow_up` (owes about $3.8k more than the car is worth); `C020` gives `self_service` (equity about $3.2k, only 16% of the value).
- A user created with `POST /onboard` (typed-in numbers, no history) asked "can I retire at 50 on 90k?" gets asked for the missing values (`current_savings`, `monthly_contribution`, `annual_return_pct`) instead of an answer built on guesses.
- Tools are exact and repeatable: same input, same numbers (pytest). Example: car worth 15000 with 11000 loan gives equity +4000.
- `POST /chat` with a `user_id` returns `"mode":"coach"`, `"source":"gemini"` and `"tools_used":[...]`. If `tools_used` is empty on a personal question, Gemini answered without checking the numbers; ask again.
- Unknown `user_id` returns HTTP 404.

**Toyota track (done)** - vehicle finances, grounded on Toyota's pack (`mock/toyota/`)
- `GET /demo-users` now returns 50 people: 30 with `"track":"pnc"` and 20 with `"track":"toyota"` (`TY-C001`..`TY-C020`; extra fields `vehicle`, `contract_type`, `customer_says`).
- `GET /next-move/TY-C001` returns the customer's situation, the guardrails that apply, and the eligible options (KEEP, REFI, EXTEND, EXTRA100, DUEDATE, TRADE, plus AUTOPAY and PAYOFF when the data calls for them). Every option's summary, assumption and tradeoff text comes from the pack.
- Expected `best next move` per customer matches the pack's answer key in `golden_answers.csv` (tests check that all 20 are reachable with the right step type): C001 refinance (Eligible offer), C002 specialist call about a deferral (Follow-up), C005 autopay + payoff quote (Self-service), C014 hardship specialist today (Follow-up), C018 move the due date (Self-service), C020 wait until the loan ends (Self-service).
- Guardrails, enforced in Python (the model never sees withheld options):
  - `TY-C014` (2 missed payments), `TY-C002`, `TY-C011`, `TY-C016` (vulnerable): no refinance/extend/trade/buyout/renewal offers, no "pay extra", and a `HUMAN` option is added.
  - Customers with `marketing_consent = N`: no new-vehicle offers (`TRADE`, `RENEW`).
  - A loan with 12 or fewer payments left: the `TRADE` option carries a timing note.
- `POST /chat {"message":"I missed two payments, what now?","user_id":"TY-C014"}` uses only `next_move_options` and `trade_in_check`, offers a specialist, and does not upsell. Without Gemini it answers from the data (`"source":"fallback_health"`).
- `GET /health/TY-C001` returns HTTP 400 (Toyota customers only have vehicle-finance data); use `/next-move/TY-C001`.

**Phase 3 (done)** - checked on a running server with the PNC customer `C002` (Maya; her usual dining purchase is $204.50)
- `POST /transactions` `{"user_id":"C002","amount":200,"merchant":"Chipotle","category":"dining","timestamp":"2026-11-07T12:30:00"}` returns `"flagged":false`.
- Same with `"amount":1300` (still midday) returns `flags:[large_amount]`, severity `medium`: "$1,300.00 is 6.4x your usual dining purchase of $204.50, z-score 83.4."
- `{"amount":40,"merchant":"Crypto Exchange Ltd","category":"shopping","country":"RO","timestamp":"2026-11-07T03:12:00"}` returns flags `new_merchant`, `foreign`, `odd_hour`, severity `high`.
- `GET /alerts/C002` lists the flagged ones, newest first, each with a plain-language `explanation` (`explanation_source` is `gemini`; `fallback` if Gemini was busy) ending in the disclaimer. A normal purchase never appears.
- `POST /handoff {"user_id":"TY-C014"}` returns a who / what / why / next-step summary: Kevin, 2025 Tacoma SR5 loan, 2 missed payments, vulnerable, contact by Phone, no upsell. For `C002` it lists the health indicators and flagged transactions.

**Voice (done)**
- `POST /speak {"text":"Hi Maya, you are on track."}` returns `{"audio_base64":"UklGR...","mime_type":"audio/wav","source":"gemini_tts:<model>","text":"..."}`. Play it in the browser with `new Audio("data:audio/wav;base64," + audio_base64).play()`.
- If TTS fails (no key, model unavailable, busy), it still returns HTTP 200 with the cause in `reason` / `errors`, and it tries any TTS model your key lists (`models.list`, names containing `tts`) before giving up; the first model that works is remembered until restart. It returns HTTP 200 with `"audio_base64":null` and `"source":"browser_speech"`: the frontend should then call `speechSynthesis.speak(new SpeechSynthesisUtterance(text))`. So the demo never shows an error.

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
| `app/main.py` | FastAPI app and endpoints: `GET /`, `GET /demo-users`, `POST /onboard`, `GET /health/{id}`, `GET /next-move/{id}`, `POST /chat`; CORS open |
| `app/voice.py` | `/speak`: Gemini TTS (16-bit 24 kHz PCM wrapped into WAV), model fallback chain, browser-speech fallback; strips markdown before speaking |
| `app/speak_demo.html` | One-page voice test served at `/speak-demo`: text box, voice picker, Speak button; plays Gemini audio or the browser's voice |
| `app/fraud.py` | Phase 3: transaction flag rules (large amount, new merchant, foreign, odd hour), severity, alert store, Gemini plain-language explanation with fixed-text fallback |
| `app/handoff.py` | Phase 3: who/what/why/next-step summary for a human agent (plain Python, no LLM) |
| `mock/merchants.json` | **MOCK**: typical merchants per spending category (PNC's data has no merchant names) |
| `app/toyota.py` | **Toyota track**: loads the data pack into customer records; `next_move_options` (guardrails + option list), `trade_in_check`, data-only fallback text. Plain Python, no LLM |
| `mock/toyota/*.csv` | Toyota's "Next Move" pack, copied unchanged: customers, accounts, vehicles, situations, 142 precomputed option scenarios, offers catalog, rate sheet, value drivers, and `golden_answers.csv` (the answer key; used only by tests, never by the agent) |
| `app/finance.py` | **All deterministic math**: budget, health indicators, can_afford, retirement_check, spending_breakdown, forecast_balances, what_if, trade_in_equity/trade_in_check |
| `app/mockdata.py` | Loads PNC's mock dataset and builds one user record per customer; every number is computed from the accounts and ledger |
| `app/agent.py` | Wraps the finance functions as Gemini tools (plain Python functions, SDK does function calling); coach system prompt (never guess, ask for missing inputs); health-snapshot fallback |
| `mock/pnc/profiles.csv`, `accounts.csv`, `transactions.csv`, `history_manifest.json` | PNC's synthetic dataset, copied unchanged from their repo (30 customers, 196 accounts, 21,225 transactions, 2024-11 to 2026-10; Apache-2.0) |
| `mock/people.json` | **MOCK extras we added**: name, age, goals for each customer, and a Toyota (model, year, estimated value) for the 15 customers who have an auto loan. PNC's data has none of these |
| `app/llm.py` | Gemini client, model fallback chain (`run_chain`), education prompt, disclaimer helper, mock/canned fallbacks |
| `app/store.py` | Users in memory, mirrored to `data/users.json` (path override: `FLUX_DATA_FILE`) |
| `app/demo_fallbacks.py` | Canned education answers (IRA, interest rates, credit score, emergency fund, budget) for when Gemini is down |
| `app/__init__.py` | Makes `app` a package |
| `wellness/data_gen.py` | Copied from PNC: seeded synthetic customer generator (not used; we use PNC's generated CSV dataset in `mock/pnc/` instead) |
| `wellness/profile.py` | Copied from PNC: rolls accounts/transactions into one profile (not used directly; `finance.build_profile` builds the same shape from the onboarding form) |
| `wellness/metrics.py` | Copied from PNC: used by `/health` (`compute_metrics`) |
| `wellness/forecast.py` | Copied from PNC: used by `forecast_balances` (`forecast_cash`) |
| `wellness/scenarios.py` | Copied from PNC: car purchase what-if (not wired yet) |
| `wellness/validation.py` | Copied from PNC: sanity checks on tool outputs (not wired yet) |
| `wellness/__init__.py`, `wellness/LICENSE-PNC` | Package marker; PNC's Apache-2.0 license |
| `tests/test_finance.py` | Tests for the math: affordability, retirement (known values, missing inputs), trade-in equity, health, budget, spending, forecast, what-if |
| `tests/test_mockdata.py` | Checks the loader against the raw CSVs: balances, scheduled payments, IRA data, vehicles, all 30 customers |
| `tests/test_phase3.py` | Voice (WAV conversion, fallbacks, model chain, request sent to Gemini), every flag rule incl. edges, alerts, Gemini explanation and caching, handoff |
| `tests/test_toyota.py` | Toyota tests: loader vs raw CSVs, all 20 golden best-moves reachable, guardrails (vulnerable, missed payments, no marketing consent), trade-in rules, lease handling, fallback text |
| `tests/test_api.py` | API tests: onboard, health, 404s, persistence, chat fallbacks, and a full Gemini function-calling loop against a fake local Gemini server |
| `tests/test_wellness.py`, `tests/test_fallbacks.py` | Vendored PNC math tests; canned-answer fallback tests |
| `setup.sh` | Mac/Linux one-shot: creates `.venv`, installs deps, copies `.env.example` |
| `requirements.txt`, `.env.example`, `.gitignore` | Pinned deps; env template; ignores `.venv`, `.env`, `data/*.json` |
| `BUILD_LOG.md` | This file |

## 3. Endpoints (with curl)

**Using the `/docs` page (Swagger):** every endpoint has an example dropdown above the request body (and above the `user_id` box). Pick one before clicking Execute. If you leave Swagger's default placeholder (`"string"`), you get 404 (unknown user) or 422 (invalid value), and `/alerts` shows 0 because nothing was stored. Order for the Phase 3 demo: `/transactions` "Large purchase", then "New merchant + abroad + 3 AM", then `/alerts/C002`, then `/handoff`.

Sample user used below (saved as shell variable `UID_` after onboarding):

```bash
curl -s -X POST http://localhost:8000/onboard -H 'Content-Type: application/json' -d '{
  "name":"Sam","age":22,"monthly_income":3200,"monthly_expenses":2100,"savings":3500,
  "debts":[{"name":"student loan","balance":14000,"monthly_payment":180}],
  "credit_card_balance":900,"credit_limit":3000,"goals":["buy a car","retire early"],
  "vehicle":{"make":"Toyota","model":"Corolla","year":2019,"value":15000,"loan_balance":11000,"monthly_payment":300}}'
# {"user_id":"u_dad27303","name":"Sam","data_source":"form","budget":{...,"total":3200.0},"health":[4 indicators]}
```

### `GET /`
Whether a key is configured, the primary model and the fallback chain.
```bash
curl http://localhost:8000/
# {"status":"ok","gemini_configured":true,"model":"gemini-3.8-flash","model_fallbacks":["gemini-3.8-flash","gemini-3.5-flash-lite","gemini-3.1-flash-lite"]}
```

### `GET /demo-users`
All 50 demo customers. `track:"pnc"` (`C001`..`C030`): name, age, goals, `has_vehicle`. `track:"toyota"` (`TY-C001`..`TY-C020`): name, age, `vehicle`, `contract_type`, `customer_says`. Frontend: use this for a "pick a demo user" dropdown.
```bash
curl http://localhost:8000/demo-users
# [{"user_id":"C001","name":"Sam","age":25,"goals":[...],"has_vehicle":false}, ...]
```

### `POST /onboard`
Optional: create your own user from typed-in numbers. Body: `name, age, monthly_income, monthly_expenses, savings, debts[{name,balance,monthly_payment}], credit_card_balance, credit_limit, credit_card_payment, goals[], vehicle?{make,model,year,value,loan_balance,monthly_payment}`. `monthly_expenses` excludes debt payments; `credit_card_payment` is what they actually pay on the card (0 if omitted; Flux does not guess a minimum). Returns `user_id`, `data_source:"form"`, a budget and the 4 health indicators. Budget = their expenses line + scheduled debt payments + savings (whatever income is left); if nothing is left, `over_budget:true` and `shortfall` shows the gap. Validation errors return HTTP 422.
These users have no transaction history or retirement account on record, so `retirement_check` and `spending_breakdown` ask for the missing information.

### `GET /health/{user_id}`
```bash
curl http://localhost:8000/health/C002
# {"user_id":"C002","name":"Maya","data_source":"pnc_mock","indicators":[{"id":"savings_rate","label":"Savings rate","value":0.1859,"status":"ok","explanation":"You keep 19% of income after expenses and debt payments; aim for 20% or more."}, ...]}
```
Thresholds are PNC's: savings rate good >= 20%, ok >= 10%; debt-to-income good <= 20%, ok <= 36%; emergency fund good >= 6 months, ok >= 3; credit utilization good <= 10%, ok <= 30%. PNC's `watch` label is shown as `ok`.

### `POST /speak`
Body `{"text": str, "voice": str | null}`. `voice` is optional (default `Kore`, or `GEMINI_TTS_VOICE` in `.env`); other Gemini voices include `Puck`, `Charon`, `Aoede`, `Zephyr`, `Fenrir`, `Leda`, `Orus`. An unsupported voice name makes Gemini reject the call, so `/speak` returns the browser-speech fallback with the error. Always HTTP 200.

**You cannot hear `/speak` in the `/docs` page**: it returns the audio as a long base64 text string, which Swagger only prints. To listen: open **http://localhost:8000/speak-demo** (type text, press Speak; falls back to the browser's voice and shows why), or call `POST /speak/audio`, which returns the `.wav` file itself (use Swagger's Download file link, or `curl -s -X POST localhost:8000/speak/audio -H 'Content-Type: application/json' -d '{"text":"Hi Maya"}' -o out.wav` then open `out.wav`).
```bash
curl -s -X POST localhost:8000/speak -H 'Content-Type: application/json' -d '{"text":"Hi Maya, you are on track."}'
# {"audio_base64":"UklGRi...","mime_type":"audio/wav","source":"gemini_tts:gemini-2.5-flash-preview-tts","text":"Hi Maya, you are on track."}
# fallback: {"audio_base64":null,"mime_type":null,"source":"browser_speech","text":"...","reason":"Gemini TTS failed for every model tried","tried_models":[...],"errors":["<model>: <Gemini's error>"]}
```

### `POST /transactions`
Body `{"user_id", "amount", "merchant", "category"?, "country"? (default US), "timestamp"? (ISO, default now)}`. Returns `flagged`, `flags[{id,detail}]`, `severity` (`none/low/medium/high`) and `alert_id` when flagged. If you omit `timestamp` the server's clock is used, so a purchase sent between midnight and 5 AM local time gets an `odd_hour` flag; always send a midday `timestamp` for predictable demos. Unknown user 404; bad timestamp or amount <= 0 is 422.
```bash
curl -s -X POST localhost:8000/transactions -H 'Content-Type: application/json' \
  -d '{"user_id":"C002","amount":1300,"merchant":"Chipotle","category":"dining","timestamp":"2026-11-07T12:30:00"}'
curl -s -X POST localhost:8000/transactions -H 'Content-Type: application/json' \
  -d '{"user_id":"C002","amount":40,"merchant":"Crypto Exchange Ltd","category":"shopping","country":"RO","timestamp":"2026-11-07T03:12:00"}'
```

### `GET /alerts/{user_id}`
Flagged transactions, newest first. Each has `transaction`, `flags`, `severity`, `explanation`, `explanation_source` (`gemini` / `fallback`). `?explain=false` skips Gemini. Gemini explains only the 5 newest (the rest use the fixed text), and a Gemini explanation is cached on the alert.
```bash
curl -s localhost:8000/alerts/C002
```

### `POST /handoff`
Body `{"user_id", "reason"?, "conversation"? [recent chat lines]}`. Returns `who`, `what`, `why[]`, `next_step`, `open_alerts` and a ready-to-paste `summary`. Toyota customers: contract, missed payments, and the guardrail reasons (vulnerable, missed payments) plus preferred contact channel. PNC/form customers: health indicators (at-risk ones listed under why).
```bash
curl -s -X POST localhost:8000/handoff -H 'Content-Type: application/json' -d '{"user_id":"TY-C014"}'
```

### `GET /next-move/{user_id}`
Toyota customers only (`TY-C001`..`TY-C020`; others return HTTP 400). Returns `customer`, `vehicle`, `account`, `situation`, `guardrails` (`upsell_allowed`, `new_vehicle_offers_allowed`, `must_offer_human`, `human_specialist_available`, `rules_applied`), `options` (each with `option_id`, `status`, `next_step_type`, `summary`, `assumption`, `tradeoff`) and `not_eligible` (with the reason).
```bash
curl http://localhost:8000/next-move/TY-C001
```

### `POST /chat`
Body `{"message": str, "user_id": str | null}`.
- **Without `user_id`** (Phase 1): general education via Gemini, 3-5 sentences. `"mode":"education"`.
- **With `user_id`** (a demo customer id or one from `/onboard`): Gemini gets the tools below and must call them for any personal number. For Toyota customers (`TY-...`) it gets only `next_move_options` and `trade_in_check`. `"mode":"coach"`, `tools_used` lists which tools ran.
```bash
curl -X POST http://localhost:8000/chat -H 'Content-Type: application/json' \
  -d '{"message":"can I buy a $300 bag?","user_id":"C002"}'
# {"reply":"... \n\nNot financial advice - just education to help you decide.","mode":"coach","source":"gemini","tools_used":["can_afford"]}
curl -X POST http://localhost:8000/chat -H 'Content-Type: application/json' \
  -d '{"message":"can I retire at 50 on 90k?","user_id":"C002"}'
# tools_used: ["retirement_check"]
curl -X POST http://localhost:8000/chat -H 'Content-Type: application/json' \
  -d '{"message":"should I trade in my car?","user_id":"C008"}'
curl -X POST http://localhost:8000/chat -H 'Content-Type: application/json' \
  -d '{"message":"where is my money going?","user_id":"C002"}'
# tools_used: ["spending_breakdown"]
# tools_used: ["trade_in_check"]
```
`source`: `gemini` (primary model), `gemini:<model>` (fallback model answered), `fallback_health` (Gemini unreachable: deterministic health snapshot), `fallback_canned` / `fallback_generic` / `mock` (education mode). The disclaimer is appended in Python. Unknown `user_id` returns 404.

### The tools Gemini can call (`app/agent.py` -> `app/finance.py`)
| Tool | Inputs | Returns |
|---|---|---|
| `can_afford` | `price` | `affordable` yes/no, `reason`, monthly surplus, months of surplus needed, emergency fund months before/after paying from savings |
| `retirement_check` | `target_age`, `annual_income` = yearly income wanted in retirement (from the user); optional `current_savings`, `monthly_contribution`, `annual_return_pct` (default to the user's IRA records) | `on_track`, `projected_balance`, `needed_balance`, `shortfall`, contribution used vs needed, `inputs` (each marked "provided by the user" or "the user's records"). If anything is unavailable: `missing_inputs` instead of a guess |
| `spending_breakdown` | `months` (default 3) | monthly average by category from the real ledger, and change vs the previous period |
| `forecast_balances` | `months` (1-60) | starting/ending balance, monthly income, obligations, net cash flow, lowest balance, `goes_negative`, month-by-month projection |
| `what_if` | dollar deltas: `monthly_income_change`, `monthly_expenses_change`, `savings_change`, `debt_payment_change`, `credit_card_balance_change` | before/after value and status per indicator, surplus before/after |
| `trade_in_check` | none (uses the user's vehicle) | `estimated_equity` = value - loan balance, `makes_sense_now`, `reason`, ONE `next_step` of type `self_service` / `follow_up` / `eligible_offer` |
| `health_check` | none | the 4 indicators (extra helper so "how am I doing?" works) |
| `next_move_options` (Toyota customers) | none | situation, guardrails and the allowed options with the pack's summary/assumption/tradeoff text; withheld options are not included |
| `trade_in_check` (Toyota customers) | none | equity = estimated value - payoff (loan) or - (residual + $350) (lease), `makes_sense_now`, `reason`, ONE `next_step` (Self-service / Follow-up / Eligible offer) |

`what_if(change)` from the spec is implemented as numeric dollar deltas rather than free text, so Gemini only has to map words to numbers ("cut $200 of dining" -> `monthly_expenses_change=-200`) and Python does the rest.

### How the agent uses the mock data ("training")

Toyota customers work the same way: `app/toyota.py` loads Toyota's pack, and the agent only sees what `next_move_options` returns. The pack's `golden_answers.csv` is the judges' answer key: it is used by tests only and is never given to the agent.

Gemini is **not** fine-tuned. Fine-tuning would not make numbers reliable and is not practical in a 24-hour hackathon. Instead the agent is *grounded* on the mock data:

1. `app/mockdata.py` reads PNC's CSVs and builds each customer from their real accounts, scheduled payments, APRs, IRA yield and 24 months of transactions.
2. Gemini can only learn about a customer by calling a tool; each tool is plain Python over those records.
3. The system prompt forbids inventing or assuming numbers, and tells the agent to ask the user when a tool reports `missing_inputs`.
4. Tests in `tests/test_mockdata.py` re-read the raw CSVs and check the loader and tools against them.

## 4. Deterministic tools vs LLM calls

| Function | Kind |
|---|---|
| `finance.can_afford`, `retirement_check`, `spending_breakdown`, `forecast_balances`, `what_if`, `trade_in_equity`, `trade_in_check`, `generate_budget`, `health_indicators`, `monthly_debt_payments` | Deterministic Python (no randomness, no LLM) |
| `fraud.*` (flag rules, z-score, severity), `handoff.build`, `voice.pcm_to_wav` / `clean_for_speech` | Deterministic Python |
| `fraud.explain_alert` -> `llm.run_chain` | **LLM call (no tools)**: rewrites the already-computed flags into 2-3 plain sentences; falls back to fixed text |
| `voice.speak` | **Gemini TTS call**: text to audio only; no decisions |
| `mockdata.*`, `toyota.*` (options, guardrails, trade-in check, fallback text) | Deterministic Python (reads CSV/JSON files) |
| `wellness.metrics.compute_metrics`, `wellness.forecast.forecast_cash` | Deterministic Python (PNC) |
| `llm.with_disclaimer`, `store.*`, `demo_fallbacks.lookup` | Deterministic Python |
| `llm.explain` | **LLM call**: education answer, no user numbers |
| `agent.coach_reply` -> `llm.run_chain` | **LLM call with function calling**: Gemini chooses a tool and explains its result; the tool does the math |

## 5. Known limitations / shortcuts / mocks

- **Function calling is not verified against the real Gemini service.** No Gemini key exists in the build environment. It IS verified through the real `google-genai` SDK against a fake local server that speaks Gemini's REST format (`tests/test_api.py::test_chat_coach_runs_real_function_calling_loop`): tools are declared, the SDK calls our Python function, and the result goes back. Please run the three coach curls above once with your key. Check the uvicorn terminal for `flux.llm` warnings if you see `fallback_health`.
- The SDK prints "Direct use of automatic function calling in Models.generate_content is not recommended". It is a warning only; it works.
- **Toyota pack notes:**
  - The pack's option numbers (payments, interest, payoff) are precomputed by Toyota; Flux does not recompute them. AUTOPAY and PAYOFF are added by Flux from the account data (`autopay = N`, payoff quote).
  - The pack uses "Offer / Self-service / Follow-up" step types; options without one in the catalog are mapped by us: KEEP = Self-service, EXTEND LEASE and END EARLY = Follow-up.
  - Our own rules on top of the pack: hide "pay extra" for distressed customers; trade-in "wait" when 12 or fewer payments remain; trade-in goes to a human when LTV is over 125%. LTV and the 12-month rule are policy numbers we chose.
  - `trade_in_check` for Toyota leases says it does not apply (lease options are in `next_move_options`).
  - PNC customers' Toyotas in `mock/people.json` remain invented; Toyota-track customers use the real pack data.
- **Mocked / stubbed:**
  - `mock/people.json`: names, ages, goals and Toyota vehicles are invented. PNC's data has none of them. Vehicle `value` is a made-up estimate (MSRP x 0.87^age), so trade-in equity = that made-up value minus the real loan balance from the data.
  - `eligible_offer` in `trade_in_check` is a label only. No real Toyota offer or valuation lookup.
- **What was removed vs the first Phase 2 build:** the assumed 15% savings rate, 5% return, 80% income replacement, 4% withdrawal rate, the assumed credit-card minimum (2% / $25), and the fixed budget split (40% housing etc.). None of those exist any more.
- **Rules that remain (policy, not guesses about the user)**, each returned with the result so the agent can say them:
  - Health thresholds are PNC's (e.g. savings rate good at 20%+, emergency fund good at 6+ months).
  - `can_afford` says yes if the price fits in one month of leftover cash, or if paying from savings keeps 3+ months of bills covered.
  - Trade-in "makes sense" when equity is at least 20% of the car's value.
  - Retirement: needed balance = desired yearly income / yearly return (live on returns, keep principal). It is nominal dollars: no inflation, taxes or Social Security (the dataset has none either).
- **Income/expenses for mock customers** are their 12-month average from the ledger (paychecks; expense transactions), not the single snapshot number in `profiles.csv`. They differ by under 5% (tested). Debt payments are the *scheduled* payments in `accounts.csv`; PNC notes actual historical payments can differ.
- 10 of the 30 mock customers have scheduled debt payments larger than their leftover income, so their budget shows `over_budget:true`. That is what the data says.
- **Phase 3 notes:**
  - PNC's data has no merchants, countries or times, so `mock/merchants.json` (typical merchants per category) is invented. A user's known merchants = those mock merchants for categories they spend in + merchants from their earlier unflagged transactions. Form/Toyota users start with none, so `new_merchant` is skipped until Flux has seen one clean transaction.
  - Large amount: compared with the user's own history of purchases in that category (PNC ledger, 24 purchases): flagged when at least 1.5x the average AND z-score at least 3. With no history it is a fixed $500 limit. These cut-offs are policy numbers we chose (`app/fraud.py`).
  - PNC's ledger holds one lump purchase per category per month, so a "usual purchase" is about $200, much bigger than a coffee. Demo with amounts like 1300.
  - Odd hour = 12:00 AM to 4:59 AM, in the timestamp as sent. Foreign = country other than US. Severity score: large amount 2, foreign 2, new merchant 1, odd hour 1 -> 1 low, 2 medium, 3+ high.
  - Alerts and learned merchants live in memory only (lost on restart). No alert status or "this was me" confirmation.
  - A flagged merchant is not learned, so the same new merchant keeps flagging until a clean transaction from it exists.
  - `/handoff` creates no ticket and sends nothing; it only builds the summary.
- **`/speak` is not verified against the real Gemini TTS service** (no key here). The request/response handling is tested through the real SDK against a fake server. TTS model names are configurable (`GEMINI_TTS_MODEL`, `GEMINI_TTS_MODEL_FALLBACKS`); if neither works for your key, `/speak` returns the browser-speech fallback instead of an error, and the uvicorn log shows `flux.voice` warnings with the real reason. The voice, "Kore", is a default; change with `GEMINI_TTS_VOICE`.
- Storage is in memory plus a JSON file (`data/users.json`, git-ignored). No auth: anyone with a `user_id` can read that profile. One process only.
- No conversation memory: each `/chat` call is independent.
- `gemini-3.8-flash` can be slow or return 503. `/chat` retries once, then tries `gemini-3.5-flash-lite`, then `gemini-3.1-flash-lite`, then falls back to canned text (education) or a health snapshot (coach).
- `GEMINI_MAX_OUTPUT_TOKENS` defaults to 1024: thinking models count hidden reasoning against the cap, and a low cap can cut answers off.
- Tool numeric parameters are declared as plain `float` (not `Optional[float]`): the SDK rejects whole numbers like 90000 for `Optional[float]`. Found by a test; fixed.
- Extended "thinking" is not disabled by default any more (not every 3.x model accepts `thinking_budget`). Opt in with `GEMINI_THINKING_BUDGET=0` if your model accepts it and you want speed.

## 6. How to run

```bash
./setup.sh                       # first time (creates .venv, installs deps, makes .env)
# paste GEMINI_API_KEY into .env
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000     # interactive docs: http://localhost:8000/docs
python -m pytest -q              # 149 tests, no API key needed
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
| `/speak` returns `"source":"browser_speech"` | No key, or the TTS models are unavailable for your key. Read the `flux.voice` warnings in the uvicorn terminal; set `GEMINI_TTS_MODEL` to a TTS model your key can use |
| `/alerts` explanation says `"explanation_source":"fallback"` | Gemini was busy or unavailable; the fixed text is still correct. Retry later |
| Transaction not flagged when you expected it | Check the amount vs the user's usual (C002 dining ~$204.50), that the merchant is not a known one (e.g. Chipotle), and that the hour is 0-4 for odd-hour |
| 400 on `/health/TY-...` or `/next-move/C0xx` | `/health` is for PNC customers, `/next-move` is for Toyota customers (`TY-C001`..`TY-C020`) |
| 404 `Unknown user_id` | Use `C001`..`C030` or `TY-C001`..`TY-C020` (see `/demo-users`), or an id from `/onboard`. Onboarded ids are lost if `data/users.json` is deleted |
| Agent says it needs `current_savings` etc. | Working as intended for users without records: the tool refuses to guess. Give the values in the chat, or use a demo customer |
| 422 on `/onboard` | A required field is missing or invalid (`monthly_income` must be > 0; numbers cannot be negative) |
| `404` model no longer available (new API keys) | Set `GEMINI_MODEL=gemini-3.8-flash` in `.env` and restart (`2.5-*` is blocked for new users) |
| `429 RESOURCE_EXHAUSTED` | Free-tier rate limit; wait a minute or use `gemini-3.5-flash-lite` |
| `ModuleNotFoundError: app` | Run commands from the repo root, not inside `app/` |
| Browser CORS error | CORS is open (`*`) in `app/main.py`; make sure you hit the right port |
