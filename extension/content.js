(() => {
  if (window.__fluxCompanionMounted) return
  window.__fluxCompanionMounted = true

  // Inlined so the panel never depends on fetching an extension file (strict page CSP blocks that).
  const PANEL_CSS = `
.flux-panel{position:fixed;top:16px;right:16px;z-index:2147483646;width:min(380px,calc(100vw - 24px));
max-height:calc(100vh - 32px);overflow:auto;background:#f4f7f3;color:#1c2d26;border:1px solid #d5ddd8;
border-radius:22px;box-shadow:0 18px 50px rgba(16,28,24,.28);font-family:"Segoe UI","Helvetica Neue",sans-serif}
.flux-head{display:flex;align-items:center;gap:10px;padding:14px 14px 10px;background:#1c2d26;color:#f4f7f3}
.flux-mark{width:28px;height:28px;border-radius:9px;background:#9ec4ad;color:#13211b;display:flex;
align-items:center;justify-content:center;font-weight:700;font-size:15px}
.flux-head strong{display:block;font-size:14px}
.flux-head small{color:#c9d5ce}
.flux-head button{margin-left:auto;border:0;background:transparent;color:#f4f7f3;font-size:20px;cursor:pointer}
.flux-body{padding:14px}
.flux-kicker{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:#5b7168}
.flux-metric{margin:10px 0 14px;padding:12px;background:#fff;border-radius:14px}
.flux-metric b{display:block;font-size:26px}
.flux-metric small{color:#5b7168}
.flux-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.flux-grid div{background:#fff;border-radius:12px;padding:10px}
.flux-grid span{display:block;font-size:11px;color:#5b7168}
.flux-note{margin:12px 0;font-size:12px;color:#5b7168}
.flux-chat{display:flex;gap:6px}
.flux-chat input{flex:1;border:1px solid #d5ddd8;border-radius:10px;padding:10px;font:inherit}
.flux-chat button{border:0;border-radius:10px;padding:10px 12px;background:#1c2d26;color:#fff;cursor:pointer}
.flux-thread{margin:10px 0;max-height:140px;overflow:auto;font-size:13px}
.flux-thread p{margin:0 0 8px}
.flux-thread .user{color:#5b7168}
`

  const money = (value) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
      Number(value) || 0,
    )

  const loan = (scenario) => {
    const principal = Math.max((scenario.price || 0) - (scenario.down || 0), 0)
    const monthlyRate = (scenario.apr || 0) / 100 / 12
    const payment =
      monthlyRate === 0
        ? principal / (scenario.term || 1)
        : (principal * monthlyRate * Math.pow(1 + monthlyRate, scenario.term)) /
          (Math.pow(1 + monthlyRate, scenario.term) - 1)
    const totalMonthly = payment + (scenario.insurance || 0) + (scenario.running || 0)
    return {
      payment: Number.isFinite(payment) ? payment : 0,
      totalMonthly: Number.isFinite(totalMonthly) ? totalMonthly : 0,
      upfront: (scenario.down || 0) + (scenario.fees || 0),
    }
  }

  /** Toyota 301-redirects away query strings, so Flux passes the path in the hash. */
  const optionFromUrl = () => {
    const match = /flux_option=([a-z-]+)/i.exec(`${location.hash} ${location.search}`)
    return match ? match[1] : ''
  }

  /** Read the vehicle and price off the Toyota page the user is actually on. */
  const readPageListing = () => {
    const titleSource =
      document.querySelector('h1')?.textContent ||
      document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
      document.title ||
      ''
    const name = titleSource.replace(/\s+/g, ' ').trim().slice(0, 70)

    let price = 0
    const priceAttr =
      document.querySelector('[itemprop="price"]')?.getAttribute('content') ||
      document.querySelector('meta[property="product:price:amount"]')?.getAttribute('content')
    if (priceAttr) price = Number(String(priceAttr).replace(/[^0-9.]/g, '')) || 0
    if (!price) {
      const text = (document.body?.innerText || '').slice(0, 20000)
      const candidates = [...text.matchAll(/\$\s?([0-9]{2,3},[0-9]{3})/g)]
        .map((match) => Number(match[1].replace(/,/g, '')))
        .filter((value) => value >= 12000 && value <= 120000)
      if (candidates.length) price = candidates.sort((a, b) => a - b)[0]
    }
    const slug = location.pathname.split('/').filter(Boolean)[0] || ''
    return { name: name || (slug ? `Toyota ${slug}` : 'This Toyota'), price, url: location.href }
  }

  const defaults = {
    option: optionFromUrl() || 'buy-now',
    option_label: 'Current listing',
    vehicle_name: 'Toyota listing',
    scenario: { price: 24500, down: 3500, apr: 6.2, term: 60, insurance: 148, running: 172, fees: 950 },
    profile: { income: 3200, housing: 900, expenses: 1100, savings: 2000, debt: 250 },
  }

  const askBackground = (payload) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(payload, (response) => resolve(response || { ok: false }))
      } catch {
        resolve({ ok: false })
      }
    })

  const escapeHtml = (value) =>
    String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

  const mount = async () => {
    document.getElementById('flux-companion-host')?.remove()

    const sessionRes = await askBackground({ type: 'flux-get-session' })
    const session = sessionRes?.ok && sessionRes.data ? sessionRes.data : defaults
    const backendDown = !sessionRes?.ok
    const listing = readPageListing()
    const scenario = { ...defaults.scenario, ...(session.scenario || {}) }
    const profile = { ...defaults.profile, ...(session.profile || {}) }
    // The page the user is on wins: analyse this vehicle with the Flux path's loan terms.
    if (listing.price) scenario.price = listing.price
    const vehicleName = listing.name || session.vehicle_name || defaults.vehicle_name
    const pathLabel = session.option_label || session.option || optionFromUrl() || 'listing'
    const estimate = loan(scenario)
    const remaining = profile.income - profile.housing - profile.expenses - profile.debt - estimate.totalMonthly
    const savingsAfter = Math.max((profile.savings || 0) - estimate.upfront, 0)

    const host = document.createElement('div')
    host.id = 'flux-companion-host'
    const shadow = host.attachShadow({ mode: 'open' })

    shadow.innerHTML = `
      <style>${PANEL_CSS}</style>
      <aside class="flux-panel" role="dialog" aria-label="Flux Financial Companion">
        <header class="flux-head">
          <span class="flux-mark">F</span>
          <div>
            <strong>Flux companion</strong>
            <small>${escapeHtml(pathLabel)}</small>
          </div>
          <button type="button" class="flux-close" aria-label="Close">×</button>
        </header>
        <div class="flux-body">
          <div class="flux-kicker">${escapeHtml(vehicleName)}</div>
          <div class="flux-metric">
            <span>Estimated monthly car cost</span>
            <b>${money(estimate.totalMonthly)}</b>
            <small>${listing.price ? `From this page: ${money(listing.price)}` : `Price ${money(scenario.price)}`} · payment ${money(estimate.payment)}</small>
          </div>
          <div class="flux-grid">
            <div><span>Monthly remaining</span><strong>${money(remaining)}</strong></div>
            <div><span>Savings after upfront</span><strong>${money(savingsAfter)}</strong></div>
            <div><span>Income</span><strong>${money(profile.income)}</strong></div>
            <div><span>Housing</span><strong>${money(profile.housing)}</strong></div>
          </div>
          <p class="flux-note">
            ${backendDown ? 'Flux backend not reachable on port 8000 — showing example numbers. ' : ''}
            Illustrative only — not financial advice.
          </p>
          <div class="flux-thread"></div>
          <div class="flux-chat">
            <input type="text" placeholder="Ask Flux about this loan…" aria-label="Ask Flux" />
            <button type="button" class="flux-send">Ask</button>
          </div>
        </div>
      </aside>
    `
    document.documentElement.appendChild(host)
    shadow.querySelector('.flux-close')?.addEventListener('click', () => {
      window.__fluxCompanionClosed = true
      host.remove()
    })

    const thread = shadow.querySelector('.flux-thread')
    const input = shadow.querySelector('.flux-chat input')
    const send = async () => {
      const text = (input?.value || '').trim()
      if (!text) return
      input.value = ''
      thread.insertAdjacentHTML(
        'beforeend',
        `<p class="user">You: ${escapeHtml(text)}</p><p class="ai">Flux is thinking…</p>`,
      )
      thread.scrollTop = thread.scrollHeight
      const context =
        `(Shopping companion on the Toyota page ${listing.url}: ${vehicleName} priced ${money(scenario.price)}. ` +
        `Path: ${pathLabel}. Loan ${scenario.term} mo at ${scenario.apr}% APR, down ${money(scenario.down)}. ` +
        `Estimated payment ${money(estimate.payment)}, total monthly ${money(estimate.totalMonthly)}, remaining ${money(remaining)}.)`
      const result = await askBackground({
        type: 'flux-chat',
        body: { message: `${text}\n\n${context}`, user_id: session.user_id || undefined },
      })
      const reply = result?.data?.reply || 'Could not reach the Flux backend on localhost:8000.'
      const pending = thread.querySelector('p.ai:last-child')
      if (pending) pending.textContent = reply
      thread.scrollTop = thread.scrollHeight
    }
    shadow.querySelector('.flux-send')?.addEventListener('click', () => void send())
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        void send()
      }
    })
  }

  const ensureMounted = () => {
    if (window.__fluxCompanionClosed) return
    if (!document.getElementById('flux-companion-host')) void mount()
  }

  void mount()
  // Toyota's pages hydrate late and swap DOM nodes; keep the panel alive.
  setInterval(ensureMounted, 2000)
})()
