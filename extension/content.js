(() => {
  if (window.__fluxCompanionMounted) return
  window.__fluxCompanionMounted = true

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

  const optionFromUrl = () => {
    try {
      return new URL(location.href).searchParams.get('flux_option') || ''
    } catch {
      return ''
    }
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
    return {
      name: name || (slug ? `Toyota ${slug}` : ''),
      price,
      url: location.href,
    }
  }

  const defaults = {
    option: optionFromUrl() || 'buy-now',
    option_label: 'Current listing',
    vehicle_name: 'Toyota of Plano listing',
    vehicle_price: 24500,
    scenario: { price: 24500, down: 3500, apr: 6.2, term: 60, insurance: 148, running: 172, fees: 950 },
    profile: { income: 3200, housing: 900, expenses: 1100, savings: 2000, debt: 250 },
  }

  const askBackground = (payload) =>
    new Promise((resolve) => {
      chrome.runtime.sendMessage(payload, (response) => resolve(response || { ok: false }))
    })

  const mount = async () => {
    const sessionRes = await askBackground({ type: 'flux-get-session' })
    const session = sessionRes?.ok && sessionRes.data ? sessionRes.data : defaults
    const listing = readPageListing()
    const scenario = { ...defaults.scenario, ...(session.scenario || {}) }
    const profile = { ...defaults.profile, ...(session.profile || {}) }
    // The page the user is on wins: analyse this vehicle with the Flux path's loan terms.
    if (listing.price) scenario.price = listing.price
    const vehicleName = listing.name || session.vehicle_name || defaults.vehicle_name
    const estimate = loan(scenario)
    const remaining = profile.income - profile.housing - profile.expenses - profile.debt - estimate.totalMonthly
    const savingsAfter = Math.max((profile.savings || 0) - estimate.upfront, 0)

    const host = document.createElement('div')
    host.id = 'flux-companion-host'
    const shadow = host.attachShadow({ mode: 'open' })
    const cssUrl = chrome.runtime.getURL('content.css')
    const logoUrl = chrome.runtime.getURL('flux-logo.png')
    let cssText = ''
    try {
      cssText = await (await fetch(cssUrl)).text()
    } catch {
      cssText = ''
    }

    shadow.innerHTML = `
      <style>${cssText}</style>
      <aside class="flux-panel" role="dialog" aria-label="Flux Financial Companion">
        <header class="flux-head">
          <img src="${logoUrl}" alt="" />
          <div>
            <strong>Flux companion</strong>
            <small>${session.option_label || session.option || 'listing'}</small>
          </div>
          <button type="button" class="flux-close" aria-label="Close">×</button>
        </header>
        <div class="flux-body">
          <div class="flux-kicker">${vehicleName}</div>
          <div class="flux-metric">
            <span>Estimated monthly car cost</span>
            <b>${money(estimate.totalMonthly)}</b>
            <small>
              ${listing.price ? `From this page: ${money(listing.price)}` : `Price ${money(scenario.price)}`}
              · payment ${money(estimate.payment)}
            </small>
          </div>
          <div class="flux-grid">
            <div><span>Monthly remaining</span><strong>${money(remaining)}</strong></div>
            <div><span>Savings after upfront</span><strong>${money(savingsAfter)}</strong></div>
            <div><span>Income</span><strong>${money(profile.income)}</strong></div>
            <div><span>Housing</span><strong>${money(profile.housing)}</strong></div>
          </div>
          <p class="flux-note">Illustrative only — not financial advice. Same coach as Flux AI.</p>
          <div class="flux-thread"></div>
          <div class="flux-chat">
            <input type="text" placeholder="Ask Flux about this loan…" aria-label="Ask Flux" />
            <button type="button" class="flux-send">Ask</button>
          </div>
        </div>
      </aside>
    `
    document.documentElement.appendChild(host)
    shadow.querySelector('.flux-close')?.addEventListener('click', () => host.remove())

    const thread = shadow.querySelector('.flux-thread')
    const input = shadow.querySelector('.flux-chat input')
    const send = async () => {
      const text = (input?.value || '').trim()
      if (!text) return
      input.value = ''
      thread.insertAdjacentHTML('beforeend', `<p class="user">You: ${text}</p><p class="ai">Flux is thinking…</p>`)
      thread.scrollTop = thread.scrollHeight
      const context =
        `(Shopping companion on the Toyota page ${listing.url}: ${vehicleName} priced ${money(scenario.price)}. ` +
        `Path: ${session.option_label || session.option}. Loan ${scenario.term} mo at ${scenario.apr}% APR, down ${money(scenario.down)}. ` +
        `Estimated payment ${money(estimate.payment)}, total monthly ${money(estimate.totalMonthly)}, remaining ${money(remaining)}.)`
      const result = await askBackground({
        type: 'flux-chat',
        body: {
          message: `${text}\n\n${context}`,
          user_id: session.user_id || undefined,
        },
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

  mount()
})()
