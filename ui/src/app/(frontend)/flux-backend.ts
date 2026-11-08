import type { FinancialProfile, FinancialSnapshot } from './flux-api-client'

// Flux Python backend (FastAPI). Run it with: uvicorn app.main:app --port 8000
// Override in .env.local:  NEXT_PUBLIC_FLUX_BACKEND_URL=http://localhost:8000
// On Vercel the backend is the `app` service behind the /api/flux rewrite, so a same-origin
// relative base is correct there and no environment variable is needed.
const DEPLOYED_BASE = '/api/flux'

function resolveBase(): string {
  const configured = process.env.NEXT_PUBLIC_FLUX_BACKEND_URL
  if (configured) return configured.replace(/\/+$/, '')
  if (typeof window === 'undefined') return DEPLOYED_BASE
  const host = window.location.hostname
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
  return isLocal ? 'http://localhost:8000' : DEPLOYED_BASE
}

const BASE = resolveBase()
// Optional: skip onboarding and always use one backend demo customer (C001..C030, TY-C001..TY-C020).
const FIXED_USER = process.env.NEXT_PUBLIC_FLUX_USER_ID || ''
const STORAGE_KEY = 'flux-backend-user'

export type CoachReply = { reply: string; source: string; toolsUsed: string[] }

type ChatResponse = { reply: string; mode: string; source: string; tools_used: string[] }
type SpeakResponse = {
  audio_base64: string | null
  mime_type: string | null
  source: string
  text: string
}
type OnboardResponse = { user_id: string }

class BackendError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'BackendError'
  }
}

async function post<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) {
      let detail = ''
      try {
        const payload = (await response.json()) as { detail?: unknown }
        detail = typeof payload.detail === 'string' ? payload.detail : JSON.stringify(payload.detail)
      } catch {
        // keep the status-only message
      }
      throw new BackendError(`Flux backend ${response.status}. ${detail}`.trim(), response.status)
    }
    return (await response.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

// The UI profile -> the backend's POST /onboard body. The UI collects no age, so none is sent;
// the backend asks the user for it if a question needs it (retirement).
export function onboardBody(
  profile: FinancialProfile,
  snapshot: FinancialSnapshot,
  fullName?: string,
) {
  const goals = profile.goals?.length ? profile.goals : profile.goal ? [profile.goal] : []
  const debtPayments = Math.max(profile.debt, 0)
  const checking =
    snapshot.accounts.find((account) => account.type === 'checking')?.balance ?? 0
  // Backend "savings" is liquid cash used for afford / emergency-fund math: checking + savings.
  const liquidCash = Math.max(checking, 0) + Math.max(profile.savings, 0)
  const cardShare = Math.max(snapshot.totalDebt * 0.15, 0)
  return {
    name: fullName?.trim().split(/\s+/)[0] || 'Flux user',
    monthly_income: Math.max(profile.income, 1),
    monthly_expenses: Math.max(profile.housing + profile.expenses, 0),
    savings: liquidCash,
    credit_card_balance: cardShare,
    credit_limit: cardShare > 0 ? Math.max(cardShare * 4, 500) : 0,
    credit_card_payment: Math.max(profile.debt * 0.3, 0),
    debts:
      debtPayments > 0 || snapshot.totalDebt > 0
        ? [
            {
              name: 'Loans and remaining debt',
              balance: Math.max(snapshot.totalDebt - cardShare, 0),
              monthly_payment: Math.max(profile.debt * 0.7, 0),
            },
          ].filter((d) => d.balance > 0 || d.monthly_payment > 0)
        : [],
    goals,
  }
}

function readCache(): { userId: string; fingerprint: string } | null {
  if (typeof window === 'undefined') return null
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null')
  } catch {
    return null
  }
}

function writeCache(value: { userId: string; fingerprint: string } | null) {
  if (typeof window === 'undefined') return
  if (value) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  else window.localStorage.removeItem(STORAGE_KEY)
}

// Creates the backend user once per profile; re-creates it if the numbers change.
export async function getBackendUserId(
  profile: FinancialProfile,
  snapshot: FinancialSnapshot,
  fullName?: string,
): Promise<string> {
  if (FIXED_USER) return FIXED_USER
  const body = onboardBody(profile, snapshot, fullName)
  const fingerprint = JSON.stringify(body)
  const cached = readCache()
  if (cached?.fingerprint === fingerprint) return cached.userId
  const created = await post<OnboardResponse>('/onboard', body, 10000)
  writeCache({ userId: created.user_id, fingerprint })
  return created.user_id
}

// Ask the Flux coach (Gemini + deterministic math tools). Throws if the backend is unreachable,
// so the caller can fall back to its own local answer.
export async function askCoach(
  message: string,
  profile: FinancialProfile,
  snapshot: FinancialSnapshot,
  fullName?: string,
): Promise<CoachReply> {
  const send = async () => {
    const userId = await getBackendUserId(profile, snapshot, fullName)
    return post<ChatResponse>('/chat', { message, user_id: userId }, 20000)
  }
  let answer: ChatResponse
  try {
    answer = await send()
  } catch (error) {
    // The backend forgot this user (its data file was deleted): create it again and retry once.
    if (error instanceof BackendError && error.status === 404 && !FIXED_USER) {
      writeCache(null)
      answer = await send()
    } else {
      throw error
    }
  }
  return { reply: answer.reply, source: answer.source, toolsUsed: answer.tools_used }
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
  }
  writeText(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeText(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

/** Gemini rejects WebM/Opus, so decode the recording and re-encode it as mono 16 kHz WAV. */
export async function blobToWav(blob: Blob): Promise<Blob> {
  const AudioCtx =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) return blob
  const context = new AudioCtx()
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer())
    const targetRate = 16000
    const frames = Math.max(1, Math.ceil(decoded.duration * targetRate))
    const OfflineCtx =
      window.OfflineAudioContext ||
      (window as typeof window & { webkitOfflineAudioContext?: typeof OfflineAudioContext })
        .webkitOfflineAudioContext
    if (!OfflineCtx) return blob
    const offline = new OfflineCtx(1, frames, targetRate)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    const rendered = await offline.startRendering()
    return encodeWav(rendered.getChannelData(0), targetRate)
  } catch {
    return blob
  } finally {
    void context.close()
  }
}

export async function transcribeAudio(
  audioBase64: string,
  mimeType: string,
): Promise<{ transcript: string | null; reason?: string }> {
  const result = await post<{ transcript: string | null; reason?: string }>('/transcribe', {
    audio_base64: audioBase64,
    mime_type: mimeType,
  }, 30000)
  return { transcript: result.transcript?.trim() || null, reason: result.reason }
}

export type CompanionSession = {
  option: 'buy-now' | 'wait' | 'cheaper'
  option_label: string
  vehicle_name: string
  vehicle_price: number
  scenario: {
    price: number
    down: number
    apr: number
    term: number
    insurance: number
    running: number
    fees: number
  }
  profile: FinancialProfile
  snapshot: FinancialSnapshot
  user_id?: string
}

export async function saveCompanionSession(session: CompanionSession): Promise<void> {
  await post('/companion-session', session, 8000)
}

let currentAudio: HTMLAudioElement | null = null

export function stopSpeaking() {
  currentAudio?.pause()
  currentAudio = null
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
}

function browserSpeak(text: string): 'browser' | 'none' {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return 'none'
  const synth = window.speechSynthesis
  // Chrome often stalls the first speak() until voices are loaded / a prior cancel.
  synth.cancel()
  const utter = new SpeechSynthesisUtterance(text)
  utter.rate = 1.05
  const voices = synth.getVoices()
  const preferred = voices.find((v) => /en(-|_)US/i.test(v.lang) && /female|samantha|google us/i.test(v.name))
    || voices.find((v) => /^en/i.test(v.lang))
  if (preferred) utter.voice = preferred
  // Kick the synthesizer awake on engines that queue silently after cancel().
  if (voices.length === 0) {
    synth.addEventListener('voiceschanged', () => synth.speak(utter), { once: true })
    synth.getVoices()
  }
  synth.speak(utter)
  return 'browser'
}

// Read text aloud: Gemini voice when available, otherwise the browser's own voice.
// Never throws, so a voice problem cannot break the chat.
export async function speakReply(
  text: string,
  options?: { preferBrowser?: boolean },
): Promise<'gemini' | 'browser' | 'none'> {
  stopSpeaking()
  // Listen button uses the browser voice so feedback is immediate. Mic replies still try Gemini TTS.
  if (options?.preferBrowser) return browserSpeak(text)
  try {
    const voice = await post<SpeakResponse>('/speak', { text }, 20000)
    if (!voice.audio_base64) return browserSpeak(voice.text || text)
    const audio = new Audio(`data:${voice.mime_type || 'audio/wav'};base64,${voice.audio_base64}`)
    currentAudio = audio
    await audio.play()
    return 'gemini'
  } catch {
    return browserSpeak(text)
  }
}

export type DemoAlert = {
  alert_id: string
  severity: string
  summary?: string
  explanation: string
  explanation_source: string
  flags: { id: string; detail: string }[]
  transaction: {
    amount: number
    merchant: string
    category: string | null
    country: string
    timestamp: string
  }
}

export type DemoPack = {
  matchedUserId: string
  name: string
  matchReason: string
  count: number
  alerts: DemoAlert[]
}

const DEMO_PACK_KEY = 'flux-demo-pack'

function readDemoPackCache(): DemoPack | null {
  if (typeof window === 'undefined') return null
  try {
    return JSON.parse(window.localStorage.getItem(DEMO_PACK_KEY) || 'null')
  } catch {
    return null
  }
}

function writeDemoPackCache(value: DemoPack | null) {
  if (typeof window === 'undefined') return
  if (value) window.localStorage.setItem(DEMO_PACK_KEY, JSON.stringify(value))
  else window.localStorage.removeItem(DEMO_PACK_KEY)
}

/** Match onboarding choices to a PNC demo customer and seed suspicious-transaction alerts.
 * Does NOT change the coach user id — chat still uses the form profile from /onboard.
 */
export async function loadDemoPack(input: {
  goals: string[]
  monthlyIncome: number
  monthlyDebtPayments: number
  understandingFocus?: string
}): Promise<DemoPack> {
  const fingerprint = JSON.stringify(input)
  const cached = readDemoPackCache() as (DemoPack & { fingerprint?: string }) | null
  if (cached?.fingerprint === fingerprint && cached.alerts?.length) {
    return cached
  }
  type Raw = {
    matched_user_id: string
    name: string
    match_reason: string
    count: number
    alerts: DemoAlert[]
  }
  const raw = await post<Raw>(
    '/demo-pack',
    {
      goals: input.goals,
      monthly_income: input.monthlyIncome,
      monthly_debt_payments: input.monthlyDebtPayments,
      understanding_focus: input.understandingFocus || null,
      explain: false,
    },
    12000,
  )
  const pack: DemoPack & { fingerprint: string } = {
    matchedUserId: raw.matched_user_id,
    name: raw.name,
    matchReason: raw.match_reason,
    count: raw.count,
    alerts: raw.alerts,
    fingerprint,
  }
  writeDemoPackCache(pack)
  return pack
}

export function clearDemoPackCache() {
  writeDemoPackCache(null)
}
