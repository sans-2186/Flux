import type { FinancialProfile, FinancialSnapshot } from './flux-api-client'

// Flux Python backend (FastAPI). Run it with: uvicorn app.main:app --port 8000
// Override in .env.local:  NEXT_PUBLIC_FLUX_BACKEND_URL=http://localhost:8000
const BASE = (process.env.NEXT_PUBLIC_FLUX_BACKEND_URL || 'http://localhost:8000').replace(/\/+$/, '')
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
  return {
    name: fullName?.trim().split(/\s+/)[0] || 'Flux user',
    monthly_income: Math.max(profile.income, 1),
    monthly_expenses: Math.max(profile.housing + profile.expenses, 0),
    savings: Math.max(profile.savings, 0),
    debts:
      debtPayments > 0 || snapshot.totalDebt > 0
        ? [
            {
              name: 'Existing debt payments',
              balance: Math.max(snapshot.totalDebt, 0),
              monthly_payment: debtPayments,
            },
          ]
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
  const created = await post<OnboardResponse>('/onboard', body, 15000)
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
    return post<ChatResponse>('/chat', { message, user_id: userId }, 35000)
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

let currentAudio: HTMLAudioElement | null = null

export function stopSpeaking() {
  currentAudio?.pause()
  currentAudio = null
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
}

function browserSpeak(text: string): 'browser' | 'none' {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return 'none'
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
  return 'browser'
}

// Read text aloud: Gemini voice when available, otherwise the browser's own voice.
// Never throws, so a voice problem cannot break the chat.
export async function speakReply(text: string): Promise<'gemini' | 'browser' | 'none'> {
  stopSpeaking()
  try {
    const voice = await post<SpeakResponse>('/speak', { text }, 35000)
    if (!voice.audio_base64) return browserSpeak(voice.text || text)
    const audio = new Audio(`data:${voice.mime_type || 'audio/wav'};base64,${voice.audio_base64}`)
    currentAudio = audio
    await audio.play()
    return 'gemini'
  } catch {
    return browserSpeak(text)
  }
}
