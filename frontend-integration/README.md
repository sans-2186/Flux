# Connecting the Flux UI to this backend

For the teammate's UI repo: https://github.com/Cindiya/Flux_UI (Next.js, exported from Figma Make).
The patch was made against `Flux_UI@32f2cec` and applies cleanly to it.

## What it changes in the UI

The UI's chat used hard-coded replies. After the patch:

| In the UI | Backend call |
|---|---|
| Typing or tapping a prompt in **Flux AI** chat | `POST /onboard` once (creates a backend user from the UI profile), then `POST /chat` |
| Mic button (speech to text, already in the UI) then Send | same, and the **reply is read aloud** (`POST /speak`) |
| **Listen** button on every AI reply (new) | `POST /speak` |
| Backend not running / Gemini error | the UI's old local answer is shown instead (no error screen) |

Nothing else in the UI changes. No new npm packages.

## Apply it

```bash
cd Flux_UI
git apply /path/to/Flux/frontend-integration/flux-ui.patch
```

(or copy `flux-backend.ts` to `src/app/(frontend)/` and make the small edits shown in the patch to `FluxApp.tsx` and `styles.css`).

Optional `.env.local` in the UI repo (defaults shown):

```
NEXT_PUBLIC_FLUX_BACKEND_URL=http://localhost:8000
# NEXT_PUBLIC_FLUX_USER_ID=C002     # always use one backend demo customer (C001..C030, TY-C001..TY-C020)
```

Use `NEXT_PUBLIC_FLUX_USER_ID` for the demo if you want the richer mock data (PNC ledger, retirement account, Toyota contracts). Leave it unset to use the numbers the user typed in the UI.

## Run both

Terminal 1, backend (Flux repo): `uvicorn app.main:app --port 8000`
Terminal 2, UI (Flux_UI repo): `pnpm install` then `pnpm dev` (the UI repo asks for Node 24.22.1 or newer)

Open http://localhost:3000, go to the Flux AI chat, tap a prompt. You should see "Flux is thinking..." and then a Gemini answer ending in "Not financial advice - just education to help you decide." Tap **Listen**, or use the mic and send: the answer is spoken.

## How the UI profile maps to the backend

| UI profile | Backend `/onboard` |
|---|---|
| `income` | `monthly_income` |
| `housing + expenses` | `monthly_expenses` |
| `savings` | `savings` |
| `debt` (monthly payments) and snapshot `totalDebt` | one debt: `monthly_payment = debt`, `balance = totalDebt` |
| `goals` / `goal` | `goals` |
| first name of the signed-in user | `name` |

The backend then has the same cash flow as the UI (for the example profile: 3200 - 900 - 1100 - 250 = 950 left; tested).
The UI collects no age, so none is sent. If someone asks about retiring, the coach asks "how old are you now?" instead of guessing.

## Good to know

- The backend must be reachable from the browser. A UI deployed on https cannot call `http://localhost:8000`; for the demo run both locally, or host the backend over https and set `NEXT_PUBLIC_FLUX_BACKEND_URL`.
- Backend CORS is open, so `localhost:3000` works (checked).
- Each chat question also sends one line of context: the car scenario currently on screen (price, down payment, term, APR). Delete the `screenContext()` use in `sendPrompt` if you don't want that.
- The backend user id is cached in the browser (`localStorage`, key `flux-backend-user`) and recreated if the profile numbers change or the backend forgot it.
- Browsers only play audio after the user has clicked something on the page; if that is blocked the module falls back to the browser's own voice and never throws.

## Other backend endpoints the UI could use

| Screen idea | Endpoint |
|---|---|
| Financial health cards | `GET /health/{user_id}` |
| Toyota "Next Move" cards | `GET /next-move/{user_id}` (Toyota demo customers `TY-C001`..`TY-C020`) |
| Alert banner / list | `POST /transactions` then `GET /alerts/{user_id}` |
| "Talk to a person" button | `POST /handoff` |

Interactive docs for all of them: http://localhost:8000/docs
