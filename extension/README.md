# Flux Financial Companion (Chrome)

Popup overlay on Toyota vehicle pages. It reads the vehicle name and price off the page you are
on, combines them with the compare-path numbers Flux saved to `POST /companion-session`, and
answers questions with the same `/chat` coach.

## Load once (Windows)

1. Start the Flux backend on port 8000.
2. Chrome → `chrome://extensions` → turn on **Developer mode**.
3. **Load unpacked** → select this `extension` folder (inside the Flux repo).
4. In Flux: Simulator → Compare → **Open companion on Toyota** on any of the three paths.
5. A real Toyota model page opens (for example `toyota.com/corolla/`) and the Flux panel pops up
   on the right with that vehicle's price run through your loan terms.

Allow the extension to access `127.0.0.1:8000` if Chrome asks.

## Do I need to deploy anything or buy a domain?

No. A Chrome extension runs *inside* the Toyota page, so it needs host permissions (already in
`manifest.json`) and nothing else — no hosting, no domain, no cooperation from Toyota. The panel
talks to the backend from the extension's service worker, which is why `http://127.0.0.1:8000`
works even though the Toyota page is HTTPS. Deploying the backend to a public URL only matters if
you want the extension to work on a machine that is not running uvicorn locally; in that case
change the base URL in `background.js` and add the host to `host_permissions`.

The Toyota site is HTTPS, so the panel must be injected by the extension (it cannot iframe
`localhost`). Keep uvicorn running.
