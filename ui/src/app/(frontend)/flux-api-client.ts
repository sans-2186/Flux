export type ApiMode = 'real'
export type DataSource = 'backend'
export type OnboardingStep = 'overview' | 'understanding' | 'goal' | 'insight' | 'complete'

export interface AuthUser {
  id: string
  email: string
  fullName: string
  onboardingStep: OnboardingStep
}

export interface AuthSession {
  authenticated: boolean
  user?: AuthUser
}

export interface FinancialProfile {
  income: number
  housing: number
  expenses: number
  savings: number
  debt: number
  goal?: string
  goals?: string[]
  understandingFocus?: string
  understandingFocuses?: string[]
  timeline?: string
  motivation?: string
  concern?: string
  guidance?: string
}

export interface FinancialAccount {
  id: string
  name: string
  type: 'checking' | 'savings' | 'credit-card' | 'loan' | 'investment'
  balance: number
  monthlyPayment?: number
}

export interface FinancialObligation {
  id: string
  name: string
  amount: number
  dueInDays: number
}

export interface FinancialSnapshot {
  accounts: FinancialAccount[]
  obligations: FinancialObligation[]
  availableCash: number
  investments: number
  totalCash: number
  totalDebt: number
  monthlyObligations: number
  netPosition: number
}

export interface FinancialGoal {
  id: string
  label: string
  targetAmount?: number
  timeline?: string
}

export interface ScenarioInput {
  price: number
  down: number
  term: number
  apr: number
  insurance: number
  running: number
  fees: number
  purchaseTiming?: 'now' | 'wait-3-months'
  profile?: FinancialProfile
}

export interface ScenarioResult {
  payment: number
  interest: number
  totalRepayment: number
  totalMonthly: number
  upfront: number
  cashFlowBefore: number
  remainingAfter: number
  savingsAfterUpfront: number
}

export interface ScenarioRecord {
  id: string
  name: string
  input: ScenarioInput
  result: ScenarioResult
  createdAt: string
}

export interface ScenarioComparisonRequest {
  id: string
  name: string
  input: ScenarioInput
  assumptions: string[]
}

export interface ScenarioComparison extends ScenarioComparisonRequest {
  result: ScenarioResult
}

export const MOCK_PROFILE: FinancialProfile = {
  income: 3200,
  housing: 900,
  expenses: 1100,
  savings: 2000,
  debt: 250,
  goal: 'Buy my first car',
  timeline: 'Within 6 months',
  motivation:
    "I need a reliable way to get to work. I want a car, but I don't want to end up struggling with payments.",
  concern: 'Having a payment I can comfortably afford.',
  guidance: 'Show me a clear plan.',
}

export const MOCK_SCENARIO: ScenarioInput = {
  price: 18000,
  down: 2000,
  term: 60,
  apr: 7.5,
  insurance: 180,
  running: 150,
  fees: 450,
  purchaseTiming: 'now',
}

export const MOCK_SNAPSHOT: FinancialSnapshot = {
  accounts: [
    {
      id: 'checking-1',
      name: 'Everyday Checking',
      type: 'checking',
      balance: 2450,
    },
    {
      id: 'savings-1',
      name: 'Goal Savings',
      type: 'savings',
      balance: 2000,
    },
    {
      id: 'card-1',
      name: 'Core Visa',
      type: 'credit-card',
      balance: 1250,
    },
    {
      id: 'loan-1',
      name: 'Personal Loan',
      type: 'loan',
      balance: 8400,
    },
    {
      id: 'investment-1',
      name: 'CD & IRA',
      type: 'investment',
      balance: 6200,
    },
  ],
  obligations: [
    { id: 'rent', name: 'Rent', amount: 900, dueInDays: 5 },
    { id: 'card', name: 'Credit card', amount: 100, dueInDays: 8 },
    { id: 'phone', name: 'Phone bill', amount: 65, dueInDays: 12 },
  ],
  availableCash: 4450,
  investments: 6200,
  totalCash: 10650,
  totalDebt: 9650,
  monthlyObligations: 250,
  netPosition: 1000,
}

export const MOCK_GOALS: FinancialGoal[] = [
  {
    id: 'car',
    label: 'Buy my first car',
    targetAmount: 4000,
    timeline: 'Within 6 months',
  },
  { id: 'home', label: 'Buy a home' },
  { id: 'debt', label: 'Pay off debt' },
  { id: 'savings', label: 'Build my savings' },
  { id: 'control', label: 'Feel more in control of my money' },
  { id: 'change', label: 'Prepare for a major life change' },
]

export function calculateMockScenario(input: ScenarioInput): ScenarioResult {
  const profile = input.profile ?? MOCK_PROFILE
  const principal = Math.max(input.price - input.down, 0)
  const monthlyRate = input.apr / 100 / 12
  const payment =
    monthlyRate === 0
      ? principal / input.term
      : (principal * monthlyRate * Math.pow(1 + monthlyRate, input.term)) /
        (Math.pow(1 + monthlyRate, input.term) - 1)
  const totalRepayment = payment * input.term
  const cashFlowBefore = profile.income - profile.housing - profile.expenses - profile.debt
  const totalMonthly = payment + input.insurance + input.running
  const upfront = input.down + input.fees
  return {
    payment,
    interest: Math.max(totalRepayment - principal, 0),
    totalRepayment,
    totalMonthly,
    upfront,
    cashFlowBefore,
    remainingAfter: cashFlowBefore - totalMonthly,
    savingsAfterUpfront: Math.max(profile.savings - upfront, 0),
  }
}

const ENDPOINTS = {
  session: '/flux-api/auth/session',
  login: '/flux-api/auth/login',
  logout: '/flux-api/auth/logout',
  signup: '/flux-api/auth/signup',
  onboarding: '/flux-api/auth/onboarding',
  profile: '/flux-api/profile',
  snapshot: '/flux-api/snapshot',
  goals: '/flux-api/goals',
  scenarios: '/flux-api/scenarios',
  scenarioCalculate: '/flux-api/scenarios/calculate',
  scenarioCompare: '/flux-api/scenarios/compare',
} as const

let demoMode = false
let demoProfile: FinancialProfile = { ...MOCK_PROFILE }
let demoSnapshot: FinancialSnapshot = structuredClone(MOCK_SNAPSHOT)

function stripDemoExtras(profile: FinancialProfile): FinancialProfile {
  const copy = { ...profile } as FinancialProfile & { _checking?: number; _debtBalance?: number }
  delete copy._checking
  delete copy._debtBalance
  return copy
}

/** Rebuild demo snapshot from profile + optional checking/debt overrides (mirrors FluxApp). */
function applyDemoProfile(profile: FinancialProfile): FinancialSnapshot {
  const extras = profile as FinancialProfile & { _checking?: number; _debtBalance?: number }
  const checking =
    extras._checking ??
    demoSnapshot.accounts.find((a) => a.type === 'checking')?.balance ??
    0
  const debtBalance = extras._debtBalance ?? demoSnapshot.totalDebt
  const clean = stripDemoExtras(profile)
  const accounts: FinancialAccount[] = [
    {
      id: 'checking-1',
      name: 'Everyday Checking',
      type: 'checking',
      balance: Math.max(checking, 0),
    },
    {
      id: 'savings-1',
      name: 'Goal Savings',
      type: 'savings',
      balance: Math.max(clean.savings, 0),
    },
    {
      id: 'card-1',
      name: 'Core Visa',
      type: 'credit-card',
      balance: Math.max(debtBalance * 0.15, 0),
      monthlyPayment: Math.max(clean.debt * 0.3, 0),
    },
    {
      id: 'loan-1',
      name: 'Personal Loan',
      type: 'loan',
      balance: Math.max(debtBalance * 0.85, 0),
      monthlyPayment: Math.max(clean.debt * 0.7, 0),
    },
    {
      id: 'investment-1',
      name: 'CD & IRA',
      type: 'investment',
      balance: Math.max(MOCK_SNAPSHOT.investments, 0),
    },
  ]
  const availableCash = accounts
    .filter((a) => a.type === 'checking' || a.type === 'savings')
    .reduce((t, a) => t + a.balance, 0)
  const investments = accounts.filter((a) => a.type === 'investment').reduce((t, a) => t + a.balance, 0)
  const totalDebt = accounts
    .filter((a) => a.type === 'credit-card' || a.type === 'loan')
    .reduce((t, a) => t + a.balance, 0)
  demoProfile = clean
  demoSnapshot = {
    accounts,
    availableCash,
    investments,
    totalCash: availableCash + investments,
    totalDebt,
    monthlyObligations: clean.debt,
    netPosition: availableCash + investments - totalDebt,
    obligations: [
      { id: 'rent', name: 'Rent / housing', amount: clean.housing, dueInDays: 5 },
      {
        id: 'card',
        name: 'Credit card',
        amount: Math.max(clean.debt * 0.3, 0),
        dueInDays: 8,
      },
      {
        id: 'loan',
        name: 'Loan payment',
        amount: Math.max(clean.debt * 0.7, 0),
        dueInDays: 12,
      },
    ],
  }
  return demoSnapshot
}


class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(demoMode ? { 'x-flux-demo': '1' } : {}),
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  if (!response.ok) {
    let message = `API request failed with status ${response.status}.`
    try {
      const payload = (await response.json()) as { message?: string }
      if (payload.message) message = payload.message
    } catch {
      // Preserve the status-based fallback for non-JSON errors.
    }
    throw new ApiError(message, response.status)
  }
  return (await response.json()) as T
}


function localScenarioResult(input: ScenarioInput, profile: FinancialProfile = MOCK_PROFILE): ScenarioResult {
  const principal = Math.max(input.price - input.down, 0)
  const monthlyRate = input.apr / 100 / 12
  const payment =
    monthlyRate === 0
      ? principal / input.term
      : (principal * monthlyRate * Math.pow(1 + monthlyRate, input.term)) /
        (Math.pow(1 + monthlyRate, input.term) - 1)
  const totalRepayment = payment * input.term
  const cashFlowBefore = profile.income - profile.housing - profile.expenses - profile.debt
  const totalMonthly = payment + input.insurance + input.running
  const upfront = input.down + input.fees
  const monthlyContribution = Math.max(Math.min(cashFlowBefore * 0.25, 250), 0)
  const availableSavings =
    profile.savings + (input.purchaseTiming === 'wait-3-months' ? monthlyContribution * 3 : 0)
  return {
    payment,
    interest: Math.max(totalRepayment - principal, 0),
    totalRepayment,
    totalMonthly,
    upfront,
    cashFlowBefore,
    remainingAfter: cashFlowBefore - totalMonthly,
    savingsAfterUpfront: Math.max(availableSavings - upfront, 0),
  }
}

export const api = {
  mode: 'real' as ApiMode,
  source: 'backend' as DataSource,
  setDemoMode: (enabled: boolean) => {
    demoMode = enabled
    if (enabled) {
      demoProfile = { ...MOCK_PROFILE }
      demoSnapshot = structuredClone(MOCK_SNAPSHOT)
    }
  },
  /** Push the live React snapshot into demo storage so My Finances / reloads stay in sync. */
  syncDemoSnapshot: (profile: FinancialProfile, snapshot: FinancialSnapshot) => {
    if (!demoMode) return
    demoProfile = stripDemoExtras(profile)
    demoSnapshot = structuredClone(snapshot)
  },
  getSession: () =>
    demoMode
      ? Promise.resolve({ authenticated: false } as AuthSession)
      : request<AuthSession>(ENDPOINTS.session),
  login: (email: string, password: string) =>
    request<AuthSession>(ENDPOINTS.login, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  signup: (input: { fullName: string; email: string; password: string; confirmPassword: string }) =>
    request<AuthSession>(ENDPOINTS.signup, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  logout: () =>
    demoMode
      ? Promise.resolve({ authenticated: false } as AuthSession)
      : request<AuthSession>(ENDPOINTS.logout, { method: 'POST' }),
  saveOnboardingStep: (step: OnboardingStep) =>
    demoMode
      ? Promise.resolve({ onboardingStep: step })
      : request<{ onboardingStep: OnboardingStep }>(ENDPOINTS.onboarding, {
          method: 'PATCH',
          body: JSON.stringify({ step }),
        }),
  // Demo mode stays on the device: no Payload / Figma environment needed.
  getFinancialProfile: () =>
    demoMode ? Promise.resolve({ ...demoProfile }) : request<FinancialProfile>(ENDPOINTS.profile),
  getFinancialSnapshot: () =>
    demoMode
      ? Promise.resolve(structuredClone(demoSnapshot))
      : request<FinancialSnapshot>(ENDPOINTS.snapshot),
  updateFinancialProfile: (profile: FinancialProfile) => {
    if (!demoMode) {
      return request<FinancialProfile>(ENDPOINTS.profile, {
        method: 'PATCH',
        body: JSON.stringify(stripDemoExtras(profile)),
      })
    }
    applyDemoProfile(profile)
    return Promise.resolve({ ...demoProfile })
  },
  getFinancialGoals: () =>
    demoMode ? Promise.resolve([...MOCK_GOALS]) : request<FinancialGoal[]>(ENDPOINTS.goals),
  getAvailableScenarios: () =>
    demoMode
      ? Promise.resolve([
          {
            id: 'demo-scenario',
            name: 'Car scenario',
            input: { ...MOCK_SCENARIO },
            result: localScenarioResult(MOCK_SCENARIO),
            createdAt: new Date().toISOString(),
          },
        ] as ScenarioRecord[])
      : request<ScenarioRecord[]>(ENDPOINTS.scenarios),
  createScenario: (input: ScenarioInput, name = 'Car scenario') =>
    demoMode
      ? Promise.resolve({
          id: `demo-${Date.now()}`,
          name,
          input,
          result: localScenarioResult(input),
          createdAt: new Date().toISOString(),
        } as ScenarioRecord)
      : request<ScenarioRecord>(ENDPOINTS.scenarios, {
          method: 'POST',
          body: JSON.stringify({ name, goal: 'Get a reliable car', assumptions: input }),
        }),
  calculateScenario: (input: ScenarioInput) =>
    demoMode
      ? Promise.resolve(localScenarioResult(input))
      : request<ScenarioResult>(ENDPOINTS.scenarioCalculate, {
          method: 'POST',
          body: JSON.stringify({ assumptions: input }),
        }),
  compareScenarios: (items: ScenarioComparisonRequest[]) =>
    demoMode
      ? Promise.resolve(
          items.map((item) => ({
            ...item,
            result: localScenarioResult(item.input),
          })) as ScenarioComparison[],
        )
      : request<ScenarioComparison[]>(ENDPOINTS.scenarioCompare, {
          method: 'POST',
          body: JSON.stringify({ scenarios: items }),
        }),
}
