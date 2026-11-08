// The local backend is preferred during development; the deployed Vercel service is the fallback
// so the panel still works on a machine that is not running uvicorn.
const CANDIDATES = ['http://127.0.0.1:8000', 'https://myflux.us/api/flux']
let workingBase = null

async function callBackend(path, init) {
  const bases = workingBase ? [workingBase, ...CANDIDATES.filter((b) => b !== workingBase)] : CANDIDATES
  let lastError = null
  for (const base of bases) {
    try {
      const response = await fetch(`${base}${path}`, init)
      if (response.status >= 500) {
        lastError = new Error(`${base} returned ${response.status}`)
        continue
      }
      workingBase = base
      return response
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error('no Flux backend reachable')
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  ;(async () => {
    try {
      if (message.type === 'flux-get-session') {
        const response = await callBackend('/companion-session')
        sendResponse({
          ok: response.ok,
          status: response.status,
          data: response.ok ? await response.json() : null,
        })
        return
      }
      if (message.type === 'flux-chat') {
        const response = await callBackend('/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message.body),
        })
        sendResponse({
          ok: response.ok,
          data: response.ok ? await response.json() : { reply: 'Flux backend is not reachable.' },
        })
        return
      }
      sendResponse({ ok: false })
    } catch (error) {
      sendResponse({ ok: false, error: String(error) })
    }
  })()
  return true
})
