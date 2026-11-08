const BASE = 'http://127.0.0.1:8000'

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  ;(async () => {
    try {
      if (message.type === 'flux-get-session') {
        const response = await fetch(`${BASE}/companion-session`)
        sendResponse({
          ok: response.ok,
          status: response.status,
          data: response.ok ? await response.json() : null,
        })
        return
      }
      if (message.type === 'flux-chat') {
        const response = await fetch(`${BASE}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message.body),
        })
        sendResponse({
          ok: response.ok,
          data: response.ok ? await response.json() : { reply: 'Flux backend is not running on port 8000.' },
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
