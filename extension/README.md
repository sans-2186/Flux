# Flux Financial Companion (Chrome)

Popup overlay on Toyota listings. It reads the compare-path numbers Flux saved to `POST /companion-session` and uses the same `/chat` coach.

## Load once (Windows)

1. Start the Flux backend on port 8000.
2. Chrome → `chrome://extensions` → turn on **Developer mode**.
3. **Load unpacked** → select this `extension` folder (inside the Flux repo).
4. In Flux: Simulator → Compare → **Open companion on Toyota** on any of the three paths.
5. Toyota of Plano opens; the Flux panel pops up on the right.

Allow the extension to access `127.0.0.1:8000` if Chrome asks.

The dealer site is HTTPS, so the panel is injected by the extension (it cannot iframe `localhost`). Keep uvicorn running.
