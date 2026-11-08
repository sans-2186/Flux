# Flux Financial Companion (Chrome)

Popup overlay on Toyota vehicle pages. It reads the vehicle name and price off the page you are
on, combines them with the compare-path numbers Flux saved to `POST /companion-session`, and
answers questions with the same `/chat` coach.

## Load it (do this once — the popup will NOT appear until you do)

1. Start the Flux backend on port 8000.
2. Chrome → address bar → `chrome://extensions`.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select this `extension` folder (inside the Flux repo).
   "Flux Financial Companion" should now be listed and enabled.
5. In Flux: Simulator → Compare → **Open companion on Toyota** on any of the three paths.
6. A real Toyota model page opens and the Flux panel appears in the top-right corner.

After pulling new code, click the **reload arrow** on the extension card — a page refresh alone
does not pick up changes to `content.js` or `manifest.json`.

If the panel still does not show: open the Toyota page, press F12 → Console, and look for errors
mentioning `flux`. The panel re-mounts every two seconds, so it survives Toyota's late hydration.
If the backend is down the panel still appears, using example numbers and saying so.

## Do I need to deploy anything or buy a domain?

No. A Chrome extension runs *inside* the Toyota page, so it needs host permissions (already in
`manifest.json`) and nothing else — no hosting, no domain, no cooperation from Toyota. The panel
talks to the backend from the extension's service worker, which is why `http://127.0.0.1:8000`
works even though the Toyota page is HTTPS. Deploying the backend to a public URL only matters if
you want the extension to work on a machine that is not running uvicorn locally; in that case
change `BASE` in `background.js` and add the host to `host_permissions`.

## If toyota.com returns 403

That is Toyota's Akamai bot protection rejecting your browser or network, not Flux. The page
loads fine from most connections; a VPN, a corporate/campus network, or an aggressive blocker
will trip it. Things that help, in order of effort:

- Open the Toyota page in a normal window first (type `toyota.com` yourself and click Camry). Once
  Akamai sets its cookies, the Flux-opened tab usually loads.
- Turn off the VPN or switch networks (phone hotspot works).
- Try a different vehicle page, e.g. `https://www.toyota.com/corolla`.
- Fall back to **Open companion in Flux** on the compare card, which shows the same panel inside
  the app with no external site involved.

The content script also runs on Toyota's 403 page, so the Flux panel still appears there using the
saved session numbers — it just has no listing price to read.

## Notes

- Toyota 301-redirects query strings away, so Flux passes the compare path in the URL **hash**
  (`#flux_option=cheaper`). The option also comes back from `GET /companion-session`.
- The panel CSS is inlined in `content.js` and the logo is drawn in CSS, so a strict page
  Content-Security-Policy cannot block the panel's assets.
