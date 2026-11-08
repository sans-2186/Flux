import 'server-only'

import config from '@payload-config'
import { getPayload, type Payload } from 'payload'
import type { FluxProfile, FluxScenario, User } from '@/payload-types'
import { appAuth } from '@/lib/app-auth'
import {
  calculateScenario,
  type FinancialProfileValues,
  type ScenarioAssumptions,
} from '@/lib/flux-calculations'

export async function getPayloadContext(request: Request) {
  const payload = await getPayload({ config })
  const user = await appAuth.currentUser()
  const demoMode = request.headers.get('x-flux-demo') === '1'
  return { demoMode, payload, user }
}

export async function findActiveProfile(payload: Payload, user: User | null, demoMode: boolean) {
  if (!user && !demoMode) return null
  const result = await payload.find({
    collection: 'flux-profiles',
    context: demoMode ? { allowFluxDemoAccess: true } : undefined,
    overrideAccess: false,
    user: user ?? undefined,
    where: demoMode
      ? { profileKey: { equals: 'demo' } }
      : { owner: { equals: user?.id as string } },
    limit: 1,
  })
  return result.docs[0] ?? null
}

export function profileValues(profile: FluxProfile): FinancialProfileValues {
  return {
    income: profile.income,
    housing: profile.housing,
    expenses: profile.expenses,
    savings: profile.savings,
    debt: profile.debt,
  }
}

export function profileResponse(profile: FluxProfile) {
  return {
    income: profile.income,
    housing: profile.housing,
    expenses: profile.expenses,
    savings: profile.savings,
    debt: profile.debt,
    goal: profile.goal ?? undefined,
    goals: profile.goals?.map((item) => item.label) ?? (profile.goal ? [profile.goal] : []),
    understandingFocus: profile.understandingFocus ?? undefined,
    understandingFocuses: profile.understandingFocuses?.length
      ? profile.understandingFocuses
      : profile.understandingFocus
        ? [profile.understandingFocus]
        : [],
    timeline: profile.timeline,
    motivation: profile.motivation ?? undefined,
    concern: profile.concern ?? undefined,
    guidance: profile.guidance ?? undefined,
  }
}

export function snapshotResponse(profile: FluxProfile) {
  const accounts = (profile.accounts ?? []).map((account) => ({
    id: account.accountKey,
    name: profile.isDemo && account.accountKey === 'card-1' ? 'Core Visa' : account.name,
    type: account.type,
    balance: account.balance,
    ...(account.monthlyPayment != null ? { monthlyPayment: account.monthlyPayment } : {}),
  }))
  const obligations = (profile.obligations ?? []).map((obligation) => ({
    id: obligation.obligationKey,
    name: obligation.name,
    amount: obligation.amount,
    dueInDays: obligation.dueInDays,
  }))
  const availableCash = accounts
    .filter((account) => ['checking', 'savings'].includes(account.type))
    .reduce((total, account) => total + account.balance, 0)
  const investments = accounts
    .filter((account) => account.type === 'investment')
    .reduce((total, account) => total + account.balance, 0)
  const totalCash = availableCash + investments
  const totalDebt = accounts
    .filter((account) => ['credit-card', 'loan'].includes(account.type))
    .reduce((total, account) => total + account.balance, 0)

  return {
    accounts,
    obligations,
    availableCash,
    investments,
    totalCash,
    totalDebt,
    monthlyObligations: profile.debt,
    netPosition: totalCash - totalDebt,
  }
}

export function parseProfilePatch(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('A profile object is required.')
  }
  const body = value as Record<string, unknown>
  const numericFields = ['income', 'housing', 'expenses', 'savings', 'debt'] as const
  const understandingFocuses = [
    'money-flow',
    'affordability',
    'saving',
    'debt',
    'big-picture',
  ] as const
  const result: Partial<
    FinancialProfileValues & {
      goal: string
      goals: { label: string }[]
      understandingFocus: (typeof understandingFocuses)[number]
      understandingFocuses: (typeof understandingFocuses)[number][]
      timeline: string
      motivation: string
      concern: string
      guidance: string
    }
  > = {}

  for (const field of numericFields) {
    if (!(field in body)) continue
    const number = body[field]
    if (typeof number !== 'number' || !Number.isFinite(number) || number < 0) {
      throw new Error(`${field} must be a non-negative number.`)
    }
    result[field] = number
  }
  const textLimits = {
    goal: 160,
    understandingFocus: 80,
    timeline: 80,
    motivation: 500,
    concern: 240,
    guidance: 160,
  } as const
  for (const [field, maxLength] of Object.entries(textLimits)) {
    if (!(field in body)) continue
    const text = body[field]
    const mayBeEmpty = field === 'goal' || field === 'understandingFocus'
    if (typeof text !== 'string' || (!mayBeEmpty && !text.trim()) || text.length > maxLength) {
      throw new Error(
        mayBeEmpty
          ? `${field} must be no more than ${maxLength} characters.`
          : `${field} must be between 1 and ${maxLength} characters.`,
      )
    }
    if (field === 'understandingFocus') {
      const focus = text.trim()
      if (!focus) continue
      if (!understandingFocuses.includes(focus as (typeof understandingFocuses)[number])) {
        throw new Error('understandingFocus is not a supported preference.')
      }
      result.understandingFocus = focus as (typeof understandingFocuses)[number]
      continue
    }
    const textField = field as 'goal' | 'timeline' | 'motivation' | 'concern' | 'guidance'
    result[textField] = text.trim()
  }
  if ('understandingFocuses' in body) {
    if (!Array.isArray(body.understandingFocuses) || body.understandingFocuses.length > 5) {
      throw new Error('understandingFocuses must contain up to 5 preferences.')
    }
    const focuses = body.understandingFocuses.map((value) => {
      if (
        typeof value !== 'string' ||
        !understandingFocuses.includes(value as (typeof understandingFocuses)[number])
      ) {
        throw new Error('understandingFocuses contains an unsupported preference.')
      }
      return value as (typeof understandingFocuses)[number]
    })
    result.understandingFocuses = [...new Set(focuses)]
  }
  if ('goals' in body) {
    if (!Array.isArray(body.goals) || body.goals.length > 6) {
      throw new Error('goals must contain up to 6 selections.')
    }
    result.goals = [
      ...new Set(
        body.goals.map((value) => {
          if (typeof value !== 'string' || !value.trim() || value.trim().length > 160) {
            throw new Error('Each goal must be between 1 and 160 characters.')
          }
          return value.trim()
        }),
      ),
    ].map((label) => ({ label }))
  }
  if (Object.keys(result).length === 0) {
    throw new Error('At least one financial field is required.')
  }
  return result
}

export function parseScenarioAssumptions(value: unknown): ScenarioAssumptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Scenario assumptions are required.')
  }
  const input = value as Record<string, unknown>
  const numericFields = ['price', 'down', 'term', 'apr', 'insurance', 'running', 'fees'] as const
  const parsed: Record<string, number> = {}

  for (const field of numericFields) {
    const number = input[field]
    if (typeof number !== 'number' || !Number.isFinite(number)) {
      throw new Error(`${field} must be a number.`)
    }
    parsed[field] = number
  }
  const price = parsed.price
  const down = parsed.down
  const term = parsed.term
  const apr = parsed.apr
  const insurance = parsed.insurance
  const running = parsed.running
  const fees = parsed.fees
  if (price <= 0) throw new Error('Vehicle price must be greater than $0.')
  if (down < 0 || down > price) {
    throw new Error('Down payment must be between $0 and the vehicle price.')
  }
  if (![36, 48, 60, 72].includes(term)) {
    throw new Error('Loan term must be 36, 48, 60, or 72 months.')
  }
  if (apr < 0 || apr > 40) {
    throw new Error('APR must be between 0% and 40%.')
  }
  for (const field of ['insurance', 'running', 'fees'] as const) {
    if (parsed[field] < 0) throw new Error(`${field} cannot be negative.`)
  }
  const timing = input.purchaseTiming === 'wait-3-months' ? 'wait-3-months' : 'now'

  return {
    price,
    down,
    term,
    apr,
    insurance,
    running,
    fees,
    purchaseTiming: timing,
  }
}

export function scenarioResponse(scenario: FluxScenario) {
  return {
    id: scenario.id,
    name: scenario.name,
    input: scenario.assumptions,
    result: scenario.result,
    createdAt: scenario.createdAt,
  }
}

export function calculateForProfile(assumptions: ScenarioAssumptions, profile: FluxProfile) {
  return calculateScenario(assumptions, profileValues(profile))
}

export function jsonError(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : 'The request could not be completed.'
  return Response.json({ message }, { status })
}
