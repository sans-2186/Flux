'use client'

import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react'
import {
  api,
  calculateMockScenario,
  MOCK_GOALS,
  MOCK_PROFILE,
  MOCK_SCENARIO,
  MOCK_SNAPSHOT,
  type DataSource,
  type AuthUser,
  type FinancialGoal,
  type FinancialProfile,
  type FinancialSnapshot,
  type ScenarioComparison,
  type ScenarioInput,
  type ScenarioResult,
  type OnboardingStep,
} from './flux-api-client'
import { askCoach, getBackendUserId, speakReply, stopSpeaking } from './flux-backend'

const fluxLogo = '/flux-logo.png'

type Screen =
  | 'auth-welcome'
  | 'signup'
  | 'login'
  | 'welcome'
  | 'goal'
  | 'obstacles'
  | 'motivation'
  | 'timeline'
  | 'snapshot'
  | 'summary'
  | 'plan'
  | 'ai'
  | 'simulator'
  | 'home'
  | 'finances'
  | 'forecast'
  | 'compare'
  | 'next'
  | 'profile'
  | 'extension'

type FinanceProfile = FinancialProfile
type SimulatorData = ScenarioInput

const initialFinance = MOCK_PROFILE
const initialSimulator = MOCK_SCENARIO

const screenOrder: Screen[] = ['welcome', 'goal', 'motivation', 'snapshot', 'summary', 'home']

const screenForOnboardingStep: Record<OnboardingStep, Screen> = {
  overview: 'welcome',
  understanding: 'goal',
  goal: 'motivation',
  insight: 'summary',
  complete: 'home',
}

const onboardingStepForScreen: Partial<Record<Screen, OnboardingStep>> = {
  welcome: 'overview',
  goal: 'understanding',
  motivation: 'goal',
  summary: 'insight',
  home: 'complete',
}

const money = (value: number, digits = 0) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: digits,
  }).format(value || 0)

const loanDetails = (data: SimulatorData) => {
  const principal = Math.max(data.price - data.down, 0)
  const monthlyRate = data.apr / 100 / 12
  const payment =
    monthlyRate === 0
      ? principal / data.term
      : (principal * monthlyRate * Math.pow(1 + monthlyRate, data.term)) /
        (Math.pow(1 + monthlyRate, data.term) - 1)
  const totalInterest = payment * data.term - principal
  return {
    payment: Number.isFinite(payment) ? payment : 0,
    interest: Math.max(Number.isFinite(totalInterest) ? totalInterest : 0, 0),
    totalMonthly: (Number.isFinite(payment) ? payment : 0) + data.insurance + data.running,
    upfront: data.down + data.fees,
  }
}

const iconPaths: Record<string, ReactNode> = {
  home: (
    <>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v10h13V10M9 20v-6h6v6" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 6.5h14a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2h12" />
      <path d="M15 11h6v4h-6a2 2 0 0 1 0-4Z" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6h10M18 6h2M4 18h2M10 18h10M4 12h4M12 12h8" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="8" cy="18" r="2" />
      <circle cx="10" cy="12" r="2" />
    </>
  ),
  spark: (
    <>
      <path d="M12 3c.7 4.8 3.2 7.3 8 8-4.8.7-7.3 3.2-8 8-.7-4.8-3.2-7.3-8-8 4.8-.7 7.3-3.2 8-8Z" />
    </>
  ),
  arrow: (
    <>
      <path d="m9 18 6-6-6-6" />
    </>
  ),
  back: (
    <>
      <path d="m15 18-6-6 6-6" />
    </>
  ),
  check: (
    <>
      <path d="m5 12 4 4L19 6" />
    </>
  ),
  car: (
    <>
      <path d="m5 16-1 3M19 16l1 3M3 13l2-6h14l2 6v4H3v-4Z" />
      <path d="M5 13h14M7 17v2M17 17v2" />
    </>
  ),
  house: (
    <>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v10h13V10M9 20v-6h6v6" />
    </>
  ),
  debt: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M3 10h18M7 15h4" />
    </>
  ),
  leaf: (
    <>
      <path d="M19 4C11 4 5 8 5 14c0 3 2 5 5 5 6 0 9-7 9-15Z" />
      <path d="M5 20c2-5 5-8 10-11" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 20 6v5c0 5-3.3 8.6-8 10-4.7-1.4-8-5-8-10V6l8-3Z" />
      <path d="m8 12 2.5 2.5L16 9" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  edit: (
    <>
      <path d="m14 5 5 5M4 20l3.5-.7L20 6.8 17.2 4 4.7 16.5 4 20Z" />
    </>
  ),
  chevron: (
    <>
      <path d="m9 18 6-6-6-6" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  send: (
    <>
      <path d="m21 3-7 18-3.5-7.5L3 10l18-7Z" />
      <path d="M10.5 13.5 21 3" />
    </>
  ),
  microphone: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7h.01" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" />
      <path d="M10 21h4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21V4M5 5h11l-2 4 2 4H5" />
    </>
  ),
}

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {iconPaths[name] || iconPaths.spark}
    </svg>
  )
}

function Button({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  icon,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'small'
  disabled?: boolean
  icon?: string
}) {
  return (
    <button className={`btn btn-${variant}`} onClick={onClick} disabled={disabled}>
      <span>{children}</span>
      {icon && <Icon name={icon} size={18} />}
    </button>
  )
}

function Header({
  onBack,
  step,
  totalSteps = 6,
  title = 'Flux',
  action,
}: {
  onBack?: () => void
  step?: number
  totalSteps?: number
  title?: string
  action?: ReactNode
}) {
  return (
    <>
      <header className="topbar">
        <div className="topbar-side">
          {onBack && (
            <button className="icon-btn" onClick={onBack} aria-label="Go back">
              <Icon name="back" />
            </button>
          )}
        </div>
        <div className="brand-small">
          {title === 'Flux' ? <img className="header-logo" src={fluxLogo} alt="Flux" /> : title}
        </div>
        <div className="topbar-side right">{action}</div>
      </header>
      {step && (
        <div className="progress-wrap">
          <div className="progress-label">
            <span>
              Step {step} of {totalSteps}
            </span>
            <span>{Math.round((step / totalSteps) * 100)}%</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${(step / totalSteps) * 100}%` }} />
          </div>
        </div>
      )}
    </>
  )
}

function Page({
  children,
  footer,
  nav,
  className = '',
}: {
  children: ReactNode
  footer?: ReactNode
  nav?: ReactNode
  className?: string
}) {
  return (
    <div className={`page ${className}`}>
      <main className="page-content">{children}</main>
      {footer && <footer className="sticky-actions">{footer}</footer>}
      {nav}
    </div>
  )
}

function Choice({
  selected,
  onClick,
  children,
  icon,
  compact = false,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
  icon?: string
  compact?: boolean
}) {
  return (
    <button
      className={`choice ${selected ? 'selected' : ''} ${compact ? 'compact' : ''}`}
      onClick={onClick}
    >
      {icon && (
        <span className="choice-icon">
          <Icon name={icon} />
        </span>
      )}
      <span>{children}</span>
      <span className="choice-check">{selected && <Icon name="check" size={15} />}</span>
    </button>
  )
}

function CurrencyInput({
  label,
  value,
  onChange,
  hint,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  hint?: string
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="input-shell">
        <span className="input-prefix">$</span>
        <input
          type="number"
          min="0"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </span>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

function BottomNav({ screen, go }: { screen: Screen; go: (screen: Screen) => void }) {
  const items: { label: string; icon: string; target: Screen }[] = [
    { label: 'Home', icon: 'home', target: 'home' },
    { label: 'My Finances', icon: 'wallet', target: 'finances' },
    { label: 'Simulator', icon: 'sliders', target: 'simulator' },
    { label: 'Flux AI', icon: 'spark', target: 'ai' },
  ]
  return (
    <nav className="bottom-nav">
      {items.map((item) => (
        <button
          key={item.target}
          className={screen === item.target ? 'active' : ''}
          onClick={() => go(item.target)}
        >
          <Icon name={item.icon} size={25} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}

function SectionTitle({
  eyebrow,
  title,
  body,
}: {
  eyebrow?: string
  title: string
  body?: string
}) {
  return (
    <div className="section-title">
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1>{title}</h1>
      {body && <p>{body}</p>}
    </div>
  )
}

function ApiStatus({
  loading,
  error,
  source,
  onRetry,
}: {
  loading: boolean
  error: string
  source: DataSource
  onRetry: () => void
}) {
  if (loading) {
    return (
      <div className="api-status loading">
        <span className="api-spinner" />
        <span>Updating from {source === 'backend' ? 'the API' : 'the mock API'}…</span>
      </div>
    )
  }
  if (error) {
    return (
      <div className="api-status error">
        <Icon name="info" size={17} />
        <span>{error}</span>
        <button onClick={onRetry}>Retry</button>
      </div>
    )
  }
  return null
}

function App() {
  const [screen, setScreen] = useState<Screen>('auth-welcome')
  const [history, setHistory] = useState<Screen[]>([])
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [authChecking, setAuthChecking] = useState(true)
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [authError, setAuthError] = useState('')
  const [demoMode, setDemoMode] = useState(false)
  const [signupForm, setSignupForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [goal, setGoal] = useState('')
  const [understandingFocus, setUnderstandingFocus] = useState('')
  const [selectedGoals, setSelectedGoals] = useState<string[]>([])
  const [understandingFocuses, setUnderstandingFocuses] = useState<string[]>([])
  const [obstacles, setObstacles] = useState<string[]>([
    "I'm not sure what I can afford.",
    'Insurance and maintenance costs feel confusing.',
    "I'm worried about making the wrong decision.",
  ])
  const [motivation, setMotivation] = useState(
    "I need a reliable way to get to work. I want a car, but I don't want to end up struggling with payments.",
  )
  const [concern, setConcern] = useState('Having a payment I can comfortably afford.')
  const [timeline, setTimeline] = useState('Within 6 months')
  const [guidance, setGuidance] = useState('Show me a clear plan.')
  const [finance, setFinance] = useState<FinanceProfile>(initialFinance)
  const [sim, setSim] = useState<SimulatorData>(initialSimulator)
  const [snapshot, setSnapshot] = useState<FinancialSnapshot>(MOCK_SNAPSHOT)
  const [availableGoals, setAvailableGoals] = useState<FinancialGoal[]>(MOCK_GOALS)
  const [details, setDetails] = useState<ScenarioResult>(() =>
    calculateMockScenario({ ...initialSimulator, profile: initialFinance }),
  )
  const [comparisonResults, setComparisonResults] = useState<ScenarioComparison[]>([])
  const [dataSource, setDataSource] = useState<DataSource>(api.source)
  const [apiLoading, setApiLoading] = useState(true)
  const [scenarioLoading, setScenarioLoading] = useState(false)
  const [apiError, setApiError] = useState('')
  const [scenarioError, setScenarioError] = useState('')
  const [hasLoadedApi, setHasLoadedApi] = useState(false)
  const [savedScenarios, setSavedScenarios] = useState<SimulatorData[]>([])
  const [chat, setChat] = useState<{ id?: number; from: 'ai' | 'user'; text: string; pending?: boolean }[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [voiceMessage, setVoiceMessage] = useState('')
  const [completed, setCompleted] = useState<boolean[]>([false, false, false])
  const [toast, setToast] = useState('')
  const [goalPickerOpen, setGoalPickerOpen] = useState(false)
  const [customGoal, setCustomGoal] = useState('')
  const [weeklyOpen, setWeeklyOpen] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const [demoConnections, setDemoConnections] = useState<string[]>([])
  const [extensionStep, setExtensionStep] = useState(1)
  const [recognizedVehicle, setRecognizedVehicle] = useState('2022 Toyota Camry')
  const [recognizedPrice, setRecognizedPrice] = useState(21500)
  const [extensionChoice, setExtensionChoice] = useState('Buy this car now')
  const profileTouchedRef = useRef(false)
  const chatIdRef = useRef(0)
  const lastInputWasVoiceRef = useRef(false)
  const recognitionRef = useRef<{
    start: () => void
    stop: () => void
    abort: () => void
  } | null>(null)

  const go = (next: Screen) => {
    if (next !== screen) setHistory((h) => [...h, screen])
    setScreen(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const back = () => {
    const prior = history[history.length - 1]
    if (prior) {
      setHistory((h) => h.slice(0, -1))
      setScreen(prior)
    } else {
      const index = screenOrder.indexOf(screen)
      setScreen(index > 0 ? screenOrder[index - 1] : 'welcome')
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const next = () => {
    const index = screenOrder.indexOf(screen)
    if (index >= 0 && index < screenOrder.length - 1) {
      const nextScreen = screenOrder[index + 1]
      go(nextScreen)
      const step = onboardingStepForScreen[nextScreen]
      if (authUser && step) {
        void api.saveOnboardingStep(step).catch(() => {
          setApiError('Your progress could not be saved. You can continue in this session.')
        })
      }
    }
  }
  const rebuildSnapshot = (
    nextFinance: FinanceProfile,
    checkingBalance: number,
    debtBalance: number,
  ): FinancialSnapshot => {
    const accounts: FinancialSnapshot['accounts'] = [
      {
        id: 'checking-1',
        name: 'Everyday Checking',
        type: 'checking',
        balance: Math.max(checkingBalance, 0),
      },
      {
        id: 'savings-1',
        name: 'Goal Savings',
        type: 'savings',
        balance: Math.max(nextFinance.savings, 0),
      },
      {
        id: 'card-1',
        name: 'Core Visa',
        type: 'credit-card',
        balance: Math.max(debtBalance * 0.15, 0),
        monthlyPayment: Math.max(nextFinance.debt * 0.3, 0),
      },
      {
        id: 'loan-1',
        name: 'Personal Loan',
        type: 'loan',
        balance: Math.max(debtBalance * 0.85, 0),
        monthlyPayment: Math.max(nextFinance.debt * 0.7, 0),
      },
      {
        id: 'investment-1',
        name: 'CD & IRA',
        type: 'investment',
        balance: Math.max(MOCK_SNAPSHOT.investments, 0),
      },
    ]
    const availableCash = accounts
      .filter((account) => ['checking', 'savings'].includes(account.type))
      .reduce((total, account) => total + account.balance, 0)
    const investments = accounts
      .filter((account) => account.type === 'investment')
      .reduce((total, account) => total + account.balance, 0)
    const totalDebt = accounts
      .filter((account) => ['credit-card', 'loan'].includes(account.type))
      .reduce((total, account) => total + account.balance, 0)
    const totalCash = availableCash + investments
    return {
      accounts,
      obligations: [
        { id: 'rent', name: 'Rent / housing', amount: nextFinance.housing, dueInDays: 5 },
        {
          id: 'card',
          name: 'Credit card',
          amount: Math.max(nextFinance.debt * 0.3, 0),
          dueInDays: 8,
        },
        {
          id: 'loan',
          name: 'Loan payment',
          amount: Math.max(nextFinance.debt * 0.7, 0),
          dueInDays: 12,
        },
      ],
      availableCash,
      investments,
      totalCash,
      totalDebt,
      monthlyObligations: nextFinance.debt,
      netPosition: totalCash - totalDebt,
    }
  }
  const pushDemoSnapshot = (nextFinance: FinanceProfile, nextSnapshot: FinancialSnapshot) => {
    if (demoMode) api.syncDemoSnapshot(nextFinance, nextSnapshot)
  }
  const updateFinance = (key: keyof FinanceProfile, value: number) => {
    profileTouchedRef.current = true
    setFinance((current) => {
      const nextFinance = { ...current, [key]: value }
      setSnapshot((snap) => {
        const checking = snap.accounts.find((account) => account.type === 'checking')?.balance ?? 0
        const debtBalance = snap.totalDebt
        const rebuilt = rebuildSnapshot(nextFinance, checking, debtBalance)
        pushDemoSnapshot(nextFinance, rebuilt)
        return rebuilt
      })
      return nextFinance
    })
  }
  const updateChecking = (value: number) => {
    profileTouchedRef.current = true
    setSnapshot((snap) => {
      const rebuilt = rebuildSnapshot(finance, value, snap.totalDebt)
      pushDemoSnapshot(finance, rebuilt)
      return rebuilt
    })
  }
  const updateDebtBalance = (value: number) => {
    profileTouchedRef.current = true
    setSnapshot((snap) => {
      const rebuilt = rebuildSnapshot(
        finance,
        snap.accounts.find((account) => account.type === 'checking')?.balance ?? 0,
        value,
      )
      pushDemoSnapshot(finance, rebuilt)
      return rebuilt
    })
  }
  const updateSim = (
    key: 'price' | 'down' | 'term' | 'apr' | 'insurance' | 'running' | 'fees',
    value: number,
  ) => setSim((s) => ({ ...s, [key]: value }))
  const extensionScenario: SimulatorData = {
    ...initialSimulator,
    price: recognizedPrice,
    running: 175,
  }
  const extensionDetails = loanDetails(extensionScenario)
  const cashFlow = finance.income - finance.housing - finance.expenses - finance.debt
  const remainingAfterCar = cashFlow - details.totalMonthly
  const savingsAfterUpfront = Math.max(finance.savings - details.upfront, 0)
  const essentialMonthly = finance.housing + finance.expenses + finance.debt
  const safetyBefore = essentialMonthly ? finance.savings / essentialMonthly : 0
  const safetyAfter = essentialMonthly ? savingsAfterUpfront / essentialMonthly : 0
  const contribution = Math.max(Math.min(cashFlow * 0.25, 250), 0)
  const forecast = Array.from(
    { length: 7 },
    (_, i) => finance.savings + contribution * i - (i === 3 ? 350 : 0),
  )

  const loadApiData = async (restorePreferences = false) => {
    setApiLoading(true)
    setApiError('')
    try {
      const [profileData, snapshotData, goalData, scenarioData] = await Promise.all([
        api.getFinancialProfile(),
        api.getFinancialSnapshot(),
        api.getFinancialGoals(),
        api.getAvailableScenarios(),
      ])
      if (!profileTouchedRef.current) {
        setFinance(profileData)
        if (restorePreferences) {
          const restoredGoals = profileData.goals ?? (profileData.goal ? [profileData.goal] : [])
          const restoredFocuses =
            profileData.understandingFocuses ??
            (profileData.understandingFocus ? [profileData.understandingFocus] : [])
          setSelectedGoals(restoredGoals)
          setGoal(restoredGoals[0] ?? '')
          setUnderstandingFocuses(restoredFocuses)
          setUnderstandingFocus(restoredFocuses[0] ?? '')
        }
        if (profileData.timeline) setTimeline(profileData.timeline)
        if (profileData.motivation) setMotivation(profileData.motivation)
        if (profileData.concern) setConcern(profileData.concern)
        if (profileData.guidance) setGuidance(profileData.guidance)
        setSnapshot(snapshotData)
      }
      setAvailableGoals(goalData)
      setSavedScenarios(scenarioData.map((scenario) => scenario.input))
      setDataSource(api.source)
      setHasLoadedApi(true)
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Unable to load financial data.')
    } finally {
      setApiLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    void api
      .getSession()
      .then((session) => {
        if (!active || !session.authenticated || !session.user) return
        api.setDemoMode(false)
        setAuthUser(session.user)
        setScreen(screenForOnboardingStep[session.user.onboardingStep])
        void loadApiData(true)
      })
      .catch(() => {
        // Signed-out visitors remain on the welcome screen.
      })
      .finally(() => {
        if (active) setAuthChecking(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(
    () => () => {
      recognitionRef.current?.abort()
    },
    [],
  )

  useEffect(() => {
    if (!hasLoadedApi) return
    const timeout = window.setTimeout(() => {
      const checking = snapshot.accounts.find((a) => a.type === 'checking')?.balance ?? 0
      void api
        .updateFinancialProfile({
          ...finance,
          ...(demoMode ? { _checking: checking, _debtBalance: snapshot.totalDebt } : {}),
        } as FinancialProfile)
        .then(() => (demoMode ? Promise.resolve(null) : api.getFinancialSnapshot()))
        .then((updatedSnapshot) => {
          // Demo: React snapshot is source of truth — do not clobber edits from the API mock.
          if (updatedSnapshot && !profileTouchedRef.current) setSnapshot(updatedSnapshot)
          else if (updatedSnapshot && !demoMode) setSnapshot(updatedSnapshot)
        })
        .catch((error) => {
          setApiError(error instanceof Error ? error.message : 'Unable to update the profile.')
        })
    }, 500)
    return () => window.clearTimeout(timeout)
    // snapshot intentionally omitted from deps: finance edits already rebuild snapshot in helpers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finance, hasLoadedApi, demoMode])

  useEffect(() => {
    if (!hasLoadedApi) return
    let cancelled = false
    const timeout = window.setTimeout(async () => {
      setScenarioLoading(true)
      setScenarioError('')
      const waitInput: SimulatorData = {
        ...sim,
        down: sim.down + contribution * 3,
        purchaseTiming: 'wait-3-months',
        profile: finance,
      }
      const requests = [
        {
          id: 'buy-now',
          name: 'Buy now',
          input: { ...sim, purchaseTiming: 'now' as const, profile: finance },
          assumptions: ['Purchase this month', 'Current price and APR'],
        },
        {
          id: 'wait-three-months',
          name: 'Wait 3 months',
          input: waitInput,
          assumptions: ['Save for three months', 'Price and APR unchanged'],
        },
        {
          id: 'lower-cost',
          name: 'Choose a lower-cost car',
          input: { ...sim, price: Math.max(sim.price - 3000, 5000), profile: finance },
          assumptions: ['Same timing and down payment', 'Vehicle price reduced by $3,000'],
        },
      ]
      try {
        const [result, comparisons] = await Promise.all([
          api.calculateScenario({ ...sim, profile: finance }),
          api.compareScenarios(requests),
        ])
        if (cancelled) return
        if (!result) throw new Error('The API returned no scenario result.')
        setDetails(result)
        setComparisonResults(comparisons)
      } catch (error) {
        if (cancelled) return
        setScenarioError(
          error instanceof Error ? error.message : 'Unable to calculate this scenario.',
        )
        setComparisonResults([])
      } finally {
        if (!cancelled) setScenarioLoading(false)
      }
    }, 350)
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [sim, finance, contribution, hasLoadedApi])

  const saveScenario = async () => {
    setScenarioLoading(true)
    setScenarioError('')
    try {
      const saved = await api.createScenario({ ...sim, profile: finance }, 'First car scenario')
      setSavedScenarios((items) => [...items, saved.input])
      showToast('Scenario saved for comparison')
    } catch (error) {
      setScenarioError(error instanceof Error ? error.message : 'Unable to save this scenario.')
    } finally {
      setScenarioLoading(false)
    }
  }
  const saveProfileChanges = async () => {
    setApiLoading(true)
    setApiError('')
    try {
      const checking = snapshot.accounts.find((a) => a.type === 'checking')?.balance ?? 0
      const updatedProfile = await api.updateFinancialProfile({
        ...finance,
        goal,
        goals: goal ? [goal] : [],
        timeline,
        motivation,
        concern,
        guidance,
        ...(demoMode ? { _checking: checking, _debtBalance: snapshot.totalDebt } : {}),
      } as FinancialProfile)
      const updatedSnapshot = demoMode
        ? rebuildSnapshot(updatedProfile, checking, snapshot.totalDebt)
        : await api.getFinancialSnapshot()
      if (demoMode) api.syncDemoSnapshot(updatedProfile, updatedSnapshot)
      setFinance(updatedProfile)
      setSelectedGoals(goal ? [goal] : [])
      setSnapshot(updatedSnapshot)
      showToast('Your changes are reflected across Flux')
      back()
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Unable to save your profile.')
    } finally {
      setApiLoading(false)
    }
  }
  const completeOnboarding = async () => {
    setApiLoading(true)
    setApiError('')
    const resolvedGoals = selectedGoals
      .filter((item) => item !== 'No specific goal')
      .map((item) => (item === 'Something else' ? customGoal.trim() : item))
      .filter(Boolean)
    const selectedGoal = resolvedGoals[0] ?? ''
    const selectedFocus = understandingFocuses[0] ?? ''
    try {
      const checking = snapshot.accounts.find((a) => a.type === 'checking')?.balance ?? 0
      const updatedProfile = await api.updateFinancialProfile({
        ...finance,
        goal: selectedGoal,
        goals: resolvedGoals,
        understandingFocus: selectedFocus,
        understandingFocuses,
        ...(demoMode ? { _checking: checking, _debtBalance: snapshot.totalDebt } : {}),
      } as FinancialProfile)
      if (demoMode) {
        const rebuilt = rebuildSnapshot(updatedProfile, checking, snapshot.totalDebt)
        api.syncDemoSnapshot(updatedProfile, rebuilt)
        setSnapshot(rebuilt)
      }
      setFinance(updatedProfile)
      if (authUser) {
        await api.saveOnboardingStep('complete')
        setAuthUser({ ...authUser, onboardingStep: 'complete' })
      }
    } catch (error) {
      // Local / demo mode: still enter the app even if the Payload API is unavailable.
      setFinance({
        ...finance,
        goal: selectedGoal,
        goals: resolvedGoals,
        understandingFocus: selectedFocus,
        understandingFocuses,
      })
      setApiError(error instanceof Error ? error.message : 'Unable to save your preferences.')
    } finally {
      setGoal(selectedGoal)
      setUnderstandingFocus(selectedFocus)
      setApiLoading(false)
      go('home')
      // Warm the backend user now so the first chat is not waiting on /onboard.
      void getBackendUserId(
        {
          ...finance,
          goal: selectedGoal,
          goals: resolvedGoals,
          understandingFocus: selectedFocus,
          understandingFocuses,
        },
        snapshot,
        authUser?.fullName,
      ).catch(() => undefined)
    }
  }
  const showToast = (text: string) => {
    setToast(text)
    window.setTimeout(() => setToast(''), 2200)
  }

  const handleSignup = async (event: FormEvent) => {
    event.preventDefault()
    setAuthError('')
    if (signupForm.fullName.trim().length < 2) {
      setAuthError('Enter your full name.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupForm.email.trim())) {
      setAuthError('Enter a valid email address.')
      return
    }
    if (signupForm.password.length < 8) {
      setAuthError('Use at least 8 characters for your password.')
      return
    }
    if (signupForm.password !== signupForm.confirmPassword) {
      setAuthError('Passwords do not match.')
      return
    }
    setAuthSubmitting(true)
    try {
      api.setDemoMode(false)
      const session = await api.signup(signupForm)
      if (!session.user) throw new Error('Unable to create your account.')
      setAuthUser(session.user)
      setScreen('welcome')
      await loadApiData()
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to create your account.')
    } finally {
      setAuthSubmitting(false)
    }
  }

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault()
    setAuthError('')
    if (!loginForm.email.trim() || !loginForm.password) {
      setAuthError('Enter your email address and password.')
      return
    }
    setAuthSubmitting(true)
    try {
      api.setDemoMode(false)
      const session = await api.login(loginForm.email.trim(), loginForm.password)
      if (!session.user) throw new Error('Unable to log in.')
      setAuthUser(session.user)
      setScreen(screenForOnboardingStep[session.user.onboardingStep])
      await loadApiData(true)
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to log in.')
    } finally {
      setAuthSubmitting(false)
    }
  }

  const enterDemo = async () => {
    setAuthError('')
    api.setDemoMode(true)
    setDemoMode(true)
    setScreen('welcome')
    await loadApiData()
  }

  const logout = async () => {
    try {
      await api.logout()
    } finally {
      api.setDemoMode(false)
      setAuthUser(null)
      setDemoMode(false)
      setHasLoadedApi(false)
      setFinance(initialFinance)
      setSnapshot(MOCK_SNAPSHOT)
      setGoal('')
      setUnderstandingFocus('')
      setSelectedGoals([])
      setUnderstandingFocuses([])
      profileTouchedRef.current = false
      setHistory([])
      setScreen('auth-welcome')
    }
  }

  const localReply = (prompt: string) => {
    const normalized = prompt.toLowerCase()
    let response = `Using the example profile—not bank-connected data—I calculated ${money(finance.income)} income minus ${money(finance.housing)} housing, ${money(finance.expenses)} other expenses, and ${money(finance.debt)} existing debt payments. That leaves an estimated ${money(cashFlow)} before a car. I would review the full monthly car cost and the assumptions before considering any next step.`
    if (normalized.includes('other cost'))
      response = `Beyond the payment, your estimate includes ${money(sim.insurance)} for insurance and ${money(sim.running)} for fuel and maintenance each month. Registration, taxes, parking, and unexpected repairs can also matter. These are planning estimates, not guarantees.`
    if (normalized.includes('loan'))
      response = `Lenders often consider income, existing debt, credit history, loan term, and down payment. You can prepare by reviewing your credit, comparing offers, and deciding on a total-cost limit before shopping. Approval and rates will vary by lender.`
    if (normalized.includes('save'))
      response = `Saving an extra $100 per month for six months could add about $600 to your upfront cushion. A larger down payment can reduce the amount financed, but it’s also worth keeping some savings available for emergencies.`
    if (normalized.includes('wait'))
      response = `If you wait three months and continue setting aside about ${money(contribution)} per month, you could add roughly ${money(contribution * 3)} to your down payment. With the same car and loan assumptions, that would lower the amount borrowed and leave about ${money(cashFlow - loanDetails({ ...sim, down: sim.down + contribution * 3 }).totalMonthly)} of estimated monthly room after the full car cost. The tradeoff is waiting longer for reliable transportation.`
    if (normalized.includes('afford'))
      response = `Your current scenario is about ${money(details.totalMonthly)} per month including the estimated payment, insurance, fuel, and maintenance. That is about ${Math.round((details.totalMonthly / finance.income) * 100)}% of your take-home income. Rather than calling that affordable or not, we can compare it with the ${money(cashFlow)} you currently have after estimated core expenses.`
    return response
  }
  // Facts from the screen the user is looking at; sent with the question so the coach can use them.
  const screenContext = () => {
    const checking = snapshot.accounts.find((a) => a.type === 'checking')?.balance ?? 0
    return (
      `(User money on file from onboarding — use tools to confirm before quoting: ` +
      `take-home ${money(finance.income)}/mo, housing ${money(finance.housing)}, other expenses ${money(finance.expenses)}, ` +
      `debt payments ${money(finance.debt)}/mo, checking ${money(checking)}, savings ${money(finance.savings)}, ` +
      `total debt balance ${money(snapshot.totalDebt)}. ` +
      `Car scenario on screen: price ${money(sim.price)}, down ${money(sim.down)}, ${sim.term} mo at ${sim.apr}% APR.)`
    )
  }
  const sendPrompt = async (prompt: string) => {
    stopSpeaking()
    const viaVoice = lastInputWasVoiceRef.current
    lastInputWasVoiceRef.current = false
    const id = ++chatIdRef.current
    setChat((c) => [
      ...c,
      { from: 'user', text: prompt },
      { id, from: 'ai', text: 'Flux is thinking…', pending: true },
    ])
    let text: string
    try {
      const answer = await askCoach(`${prompt}\n\n${screenContext()}`, finance, snapshot, authUser?.fullName)
      text = answer.reply
    } catch {
      text = localReply(prompt)
    }
    setChat((c) => c.map((m) => (m.id === id ? { from: 'ai', text } : m)))
    // Browser speech is immediate; Gemini TTS adds multi-second delay after every reply.
    if (viaVoice) void speakReply(text, { preferBrowser: true })
  }
  const submitChat = (e: FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim()) return
    sendPrompt(chatInput.trim())
    setChatInput('')
  }
  const toggleVoiceInput = () => {
    if (isListening) {
      recognitionRef.current?.stop()
      return
    }

    type SpeechResult = {
      isFinal: boolean
      0: { transcript: string }
    }
    type SpeechRecognition = {
      continuous: boolean
      interimResults: boolean
      lang: string
      start: () => void
      stop: () => void
      abort: () => void
      onstart: (() => void) | null
      onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null
      onerror: ((event: { error: string }) => void) | null
      onend: (() => void) | null
    }
    type SpeechRecognitionConstructor = new () => SpeechRecognition

    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor
      webkitSpeechRecognition?: SpeechRecognitionConstructor
    }
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition

    if (!Recognition) {
      setVoiceMessage('Voice input is not supported in this browser.')
      return
    }

    const recognition = new Recognition()
    const startingText = chatInput.trim()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = navigator.language || 'en-US'
    recognition.onstart = () => {
      setVoiceMessage('Listening…')
      setIsListening(true)
    }
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim()
      setChatInput([startingText, transcript].filter(Boolean).join(' '))
      if (transcript) lastInputWasVoiceRef.current = true
      setVoiceMessage('Listening… Speak naturally, then review your message.')
    }
    recognition.onerror = (event) => {
      setIsListening(false)
      setVoiceMessage(
        event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'Microphone access was blocked. Allow access in your browser to use voice input.'
          : event.error === 'no-speech'
            ? 'No speech was detected. Try again when you’re ready.'
            : 'Voice input stopped unexpectedly. You can try again or continue typing.',
      )
    }
    recognition.onend = () => {
      setIsListening(false)
      recognitionRef.current = null
      setVoiceMessage((message) =>
        message.startsWith('Listening') ? 'Voice input added. Review it, then send.' : message,
      )
    }
    recognitionRef.current = recognition
    setVoiceMessage('')
    try {
      recognition.start()
    } catch {
      recognitionRef.current = null
      setIsListening(false)
      setVoiceMessage('Voice input could not start. You can try again or continue typing.')
    }
  }

  const nav = <BottomNav screen={screen} go={go} />

  if (authChecking) {
    return (
      <Page className="auth-page auth-loading">
        <img className="auth-logo" src={fluxLogo} alt="Flux" />
        <span className="api-spinner" aria-label="Checking your Flux session" />
      </Page>
    )
  }

  if (screen === 'auth-welcome') {
    return (
      <Page className="auth-page auth-welcome-page">
        <div className="auth-welcome-waves" aria-hidden="true">
          <svg viewBox="0 0 520 320" preserveAspectRatio="none">
            <path d="M-40 230C35 165 80 145 145 185C215 225 255 175 320 125C385 75 435 90 560 10" />
            <path d="M-40 300C35 235 80 215 145 255C215 295 255 245 320 195C385 145 435 160 560 80" />
          </svg>
        </div>
        <div className="auth-welcome-content">
          <div className="auth-welcome-copy">
            <h1>Welcome to Flux</h1>
            <h2>Your finances, moving toward what matters.</h2>
            <p>Understand your money. Explore your options. Make confident financial decisions.</p>
          </div>
          <div className="auth-welcome-visual" aria-hidden="true">
            <img src={fluxLogo} alt="" />
            <span>FLUX</span>
          </div>
        </div>
        <div className="auth-actions">
          <Button onClick={() => setScreen('signup')}>Create Account</Button>
          <Button variant="secondary" onClick={() => setScreen('login')}>
            Log In
          </Button>
          <button className="demo-login-button" onClick={() => void enterDemo()}>
            Explore with demo data
            <small>Demo only · Not a secure account</small>
          </button>
          <p>
            By using Flux, you agree to the <a href="/terms">Terms of Service</a> and{' '}
            <a href="/privacy">Privacy Policy</a>.
          </p>
        </div>
      </Page>
    )
  }

  if (screen === 'signup') {
    return (
      <Page className="auth-page auth-form-page">
        <Header
          onBack={() => {
            setAuthError('')
            setScreen('auth-welcome')
          }}
          title="Create account"
        />
        <SectionTitle
          title="Start with a clearer picture."
          body="Create a private Flux app account. This does not grant access to the Payload admin."
        />
        <form className="auth-form" onSubmit={handleSignup} noValidate>
          <label>
            <span>Full name</span>
            <input
              autoComplete="name"
              value={signupForm.fullName}
              onChange={(event) =>
                setSignupForm((form) => ({ ...form, fullName: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Email address</span>
            <input
              type="email"
              autoComplete="email"
              value={signupForm.email}
              onChange={(event) =>
                setSignupForm((form) => ({ ...form, email: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={signupForm.password}
              onChange={(event) =>
                setSignupForm((form) => ({ ...form, password: event.target.value }))
              }
            />
            <small>Use at least 8 characters.</small>
          </label>
          <label>
            <span>Confirm password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={signupForm.confirmPassword}
              onChange={(event) =>
                setSignupForm((form) => ({ ...form, confirmPassword: event.target.value }))
              }
            />
          </label>
          {authError && <div className="auth-error">{authError}</div>}
          <Button disabled={authSubmitting}>
            {authSubmitting ? 'Creating account…' : 'Create Account'}
          </Button>
        </form>
        <p className="auth-switch">
          Already have an account?{' '}
          <button
            onClick={() => {
              setAuthError('')
              setScreen('login')
            }}
          >
            Log In
          </button>
        </p>
      </Page>
    )
  }

  if (screen === 'login') {
    return (
      <Page className="auth-page auth-form-page">
        <Header
          onBack={() => {
            setAuthError('')
            setScreen('auth-welcome')
          }}
          title="Log in"
        />
        <SectionTitle
          title="Welcome back."
          body="Continue from your saved Flux dashboard or onboarding step."
        />
        <form className="auth-form" onSubmit={handleLogin} noValidate>
          <label>
            <span>Email address</span>
            <input
              type="email"
              autoComplete="email"
              value={loginForm.email}
              onChange={(event) => setLoginForm((form) => ({ ...form, email: event.target.value }))}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={loginForm.password}
              onChange={(event) =>
                setLoginForm((form) => ({ ...form, password: event.target.value }))
              }
            />
          </label>
          <button
            type="button"
            className="forgot-password"
            onClick={() =>
              setAuthError('Password reset email is not configured in this prototype.')
            }
          >
            Forgot Password?
          </button>
          {authError && <div className="auth-error">{authError}</div>}
          <Button disabled={authSubmitting}>{authSubmitting ? 'Logging in…' : 'Log In'}</Button>
        </form>
        <p className="auth-switch">
          New to Flux?{' '}
          <button
            onClick={() => {
              setAuthError('')
              setScreen('signup')
            }}
          >
            Create Account
          </button>
        </p>
      </Page>
    )
  }

  if (screen === 'welcome') {
    const liquidAccounts = snapshot.accounts.filter((account) =>
      ['checking', 'savings'].includes(account.type),
    )
    const debtAccounts = snapshot.accounts.filter((account) =>
      ['credit-card', 'loan'].includes(account.type),
    )
    const investmentAccounts = snapshot.accounts.filter((account) => account.type === 'investment')

    return (
      <Page
        className="onboarding-page onboarding-overview-page"
        footer={
          <Button onClick={next} icon="arrow">
            Continue
          </Button>
        }
      >
        <Header
          step={1}
          totalSteps={5}
          action={demoMode ? <span className="demo-mode-badge">Demo mode</span> : undefined}
        />
        <SectionTitle
          eyebrow="Your financial overview"
          title="Everything starts with a clear picture."
          body="Your accounts and debts are shown together in one place so you can see where you stand right now."
        />
        <ApiStatus
          loading={apiLoading}
          error={apiError}
          source={dataSource}
          onRetry={() => void loadApiData()}
        />
        <section className="banking-overview" aria-label="Financial overview">
          <div className="net-position-card">
            <span>
              Total financial position <i>Calculated estimate</i>
            </span>
            <strong>{money(snapshot.netPosition)}</strong>
            <small>All prototype assets, including investments, minus total debt</small>
          </div>
          <div className="overview-totals">
            <div>
              <span>Cash available</span>
              <strong>{money(snapshot.availableCash)}</strong>
              <small>Checking + savings</small>
            </div>
            <div>
              <span>Total debt</span>
              <strong>{money(snapshot.totalDebt)}</strong>
              <small>Cards + loans</small>
            </div>
          </div>
          <div className="account-overview-heading">
            <div>
              <strong>Account overview</strong>
              <span>Prototype account balances</span>
            </div>
          </div>
          <div className="account-groups">
            <div>
              <span className="onboarding-account-icon cash">
                <Icon name="wallet" size={18} />
              </span>
              <span>
                <strong>Everyday cash</strong>
                <small>{liquidAccounts.length} checking or savings accounts</small>
              </span>
              <strong>{money(snapshot.availableCash)}</strong>
            </div>
            <div>
              <span className="onboarding-account-icon debt">
                <Icon name="debt" size={18} />
              </span>
              <span>
                <strong>Credit and loans</strong>
                <small>{debtAccounts.length} debt accounts</small>
              </span>
              <strong className="account-debt">−{money(snapshot.totalDebt)}</strong>
            </div>
            {investmentAccounts.length > 0 && (
              <div>
                <span className="onboarding-account-icon savings">
                  <Icon name="chart" size={18} />
                </span>
                <span>
                  <strong>Investments</strong>
                  <small>{investmentAccounts.length} long-term accounts</small>
                </span>
                <strong>{money(snapshot.investments)}</strong>
              </div>
            )}
          </div>
          <div className="recent-activity-empty">
            <span className="secondary-insight-icon">
              <Icon name="clock" size={18} />
            </span>
            <span>
              <strong>Recent activity</strong>
              <small>Transaction history is not connected in this prototype.</small>
            </span>
            <i>Not available</i>
          </div>
        </section>
        <p className="onboarding-data-note">
          <Icon name="shield" size={16} /> Starting from example balances. On the money step you
          can edit checking, savings, income, and debt — Home and My Finances will follow.
        </p>
      </Page>
    )
  }

  if (screen === 'goal') {
    const understandingOptions = [
      ['Where my money goes', 'money-flow'],
      ['What I can afford', 'affordability'],
      ['How to save more', 'saving'],
      ['How debt affects me', 'debt'],
      ['Just show me the big picture', 'big-picture'],
    ]
    return (
      <Page
        className="onboarding-page"
        footer={
          <div className="action-stack">
            <Button onClick={next} icon="arrow">
              Continue
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setUnderstandingFocuses([])
                setUnderstandingFocus('')
                next()
              }}
            >
              Skip for now
            </Button>
          </div>
        }
      >
        <Header onBack={back} step={2} totalSteps={5} />
        <SectionTitle
          eyebrow="Optional"
          title="What would you like to understand first?"
          body="Select all that apply. Flux will use your choices to frame your first insights, and you can change them later."
        />
        <div className="support-label">Choose as many as you’d like.</div>
        <div className="choice-grid onboarding-choices">
          {understandingOptions.map(([label, value]) => (
            <Choice
              compact
              key={value}
              selected={understandingFocuses.includes(value)}
              onClick={() =>
                setUnderstandingFocuses((items) =>
                  items.includes(value)
                    ? items.filter((item) => item !== value)
                    : [...items, value],
                )
              }
            >
              {label}
            </Choice>
          ))}
        </div>
        <p className="reassurance">No pressure. This only changes what Flux explains first.</p>
      </Page>
    )
  }

  if (screen === 'obstacles') {
    const options = [
      "I'm not sure what I can afford.",
      "I'm worried about monthly payments.",
      "I don't understand credit or loan options.",
      'Insurance and maintenance costs feel confusing.',
      'I have other expenses to manage.',
      "I don't know where to start.",
      "I'm worried about making the wrong decision.",
      'Something else.',
    ]
    return (
      <Page
        footer={
          <Button onClick={next} icon="arrow">
            Review My Starting Point
          </Button>
        }
      >
        <Header onBack={back} step={2} />
        <SectionTitle
          title="What’s making it difficult right now?"
          body="Getting started can feel complicated. Let’s figure out what’s getting in your way."
        />
        <div className="support-label">Choose as many as you’d like.</div>
        <div className="choice-grid">
          {options.map((option) => (
            <Choice
              compact
              key={option}
              selected={obstacles.includes(option)}
              onClick={() =>
                setObstacles((items) =>
                  items.includes(option) ? items.filter((x) => x !== option) : [...items, option],
                )
              }
            >
              {option}
            </Choice>
          ))}
        </div>
      </Page>
    )
  }

  if (screen === 'motivation') {
    const goalOptions = [
      ['Build an emergency fund', 'Build an emergency fund'],
      ['Pay down debt', 'Pay down debt'],
      ['Save for a purchase', 'Save for a purchase'],
      ['Improve monthly cash flow', 'Improve monthly cash flow'],
      ['Something else', 'Something else'],
      ['No specific goal', 'No specific goal'],
    ]
    return (
      <Page
        className="onboarding-page"
        footer={
          <Button onClick={next} icon="arrow">
            Continue
          </Button>
        }
      >
        <Header onBack={back} step={3} totalSteps={5} />
        <SectionTitle
          eyebrow="Optional"
          title="What goals do you have in mind?"
          body="Select all that apply. Goals can make insights more relevant, but you do not need one to use Flux."
        />
        <div className="support-label">Choose as many as you’d like.</div>
        <div className="choice-grid goals onboarding-goals">
          {goalOptions.map(([label, value]) => (
            <Choice
              key={label}
              icon={
                value === 'Build an emergency fund'
                  ? 'shield'
                  : value === 'Pay down debt'
                    ? 'debt'
                    : value === 'Save for a purchase'
                      ? 'leaf'
                      : value === 'Improve monthly cash flow'
                        ? 'chart'
                        : value === 'No specific goal'
                          ? 'compass'
                          : 'spark'
              }
              selected={selectedGoals.includes(value)}
              onClick={() =>
                setSelectedGoals((items) => {
                  const nextItems =
                    value === 'No specific goal'
                      ? ['No specific goal']
                      : items.includes(value)
                        ? items.filter((item) => item !== value)
                        : [...items.filter((item) => item !== 'No specific goal'), value]
                  setGoal(
                    nextItems.find(
                      (item) => item !== 'No specific goal' && item !== 'Something else',
                    ) ?? '',
                  )
                  return nextItems
                })
              }
            >
              {label}
            </Choice>
          ))}
        </div>
        {selectedGoals.includes('Something else') && (
          <label className="field custom-goal-field">
            <span className="field-label">Describe your goal</span>
            <input
              value={customGoal}
              onChange={(event) => setCustomGoal(event.target.value)}
              placeholder="For example, prepare for a move"
              maxLength={160}
            />
          </label>
        )}
        <p className="reassurance">Start with what feels useful. Nothing here locks you in.</p>
      </Page>
    )
  }

  if (screen === 'timeline') {
    const timelines = [
      'As soon as possible',
      'Within 3 months',
      'Within 6 months',
      'Within a year',
      "I'm just exploring",
    ]
    const styles = [
      'Give me small, manageable steps.',
      'Help me understand my options.',
      'Show me a clear plan.',
      'Help me compare different choices.',
    ]
    return (
      <Page
        footer={
          <Button onClick={next} icon="arrow">
            Continue
          </Button>
        }
      >
        <Header onBack={back} step={4} />
        <SectionTitle
          title="When are you hoping to reach your goal?"
          body="Every goal has its own timeline. We’ll work with yours."
        />
        <div className="chip-group">
          {timelines.map((item) => (
            <button
              key={item}
              className={`chip ${timeline === item ? 'active' : ''}`}
              onClick={() => setTimeline(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="question-label spaced">How would you like Flux to help?</div>
        <div className="choice-grid">
          {styles.map((item) => (
            <Choice key={item} selected={guidance === item} onClick={() => setGuidance(item)}>
              {item}
            </Choice>
          ))}
        </div>
      </Page>
    )
  }

  if (screen === 'snapshot') {
    return (
      <Page
        footer={
          <div className="action-stack">
            <Button onClick={next} icon="arrow">
              Continue
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setFinance(initialFinance)
                setSnapshot(MOCK_SNAPSHOT)
                if (demoMode) api.syncDemoSnapshot(initialFinance, MOCK_SNAPSHOT)
                next()
              }}
            >
              Skip for now
            </Button>
          </div>
        }
      >
        <Header onBack={back} step={4} totalSteps={5} />
        <SectionTitle
          title="Let’s understand where you are today."
          body="Edit these estimates — they update My Finances, Home, and what Flux AI uses. You don’t need exact numbers."
        />
        <div className="form-card">
          <CurrencyInput
            label="Monthly take-home income"
            value={finance.income}
            onChange={(v) => updateFinance('income', v)}
          />
          <CurrencyInput
            label="Monthly housing costs"
            value={finance.housing}
            onChange={(v) => updateFinance('housing', v)}
          />
          <CurrencyInput
            label="Other monthly expenses (excluding debt)"
            value={finance.expenses}
            onChange={(v) => updateFinance('expenses', v)}
          />
          <CurrencyInput
            label="Checking balance"
            value={snapshot.accounts.find((account) => account.type === 'checking')?.balance ?? 0}
            onChange={updateChecking}
          />
          <CurrencyInput
            label="Savings balance"
            value={finance.savings}
            onChange={(v) => updateFinance('savings', v)}
          />
          <CurrencyInput
            label="Total debt balance (cards + loans)"
            value={snapshot.totalDebt}
            onChange={updateDebtBalance}
          />
          <CurrencyInput
            label="Existing monthly debt payments"
            value={finance.debt}
            onChange={(v) => updateFinance('debt', v)}
          />
        </div>
        <div className="privacy-note">
          <Icon name="shield" />
          <div>
            <strong>Your information stays in this prototype.</strong>
            <span>No bank connection is required. You control what you share.</span>
          </div>
        </div>
      </Page>
    )
  }

  if (screen === 'summary') {
    const focusLabels: Record<string, string> = {
      'money-flow': 'where your money goes',
      affordability: 'what fits comfortably',
      saving: 'how to build savings',
      debt: 'how debt affects your options',
      'big-picture': 'the big picture',
    }
    const summaryGoals = selectedGoals
      .filter((item) => item !== 'No specific goal')
      .map((item) => (item === 'Something else' ? customGoal.trim() : item))
      .filter(Boolean)
    const selectedGoal = summaryGoals[0] ?? goal
    const selectedFocus = understandingFocuses[0] ?? understandingFocus
    const goalConnection =
      selectedGoal === 'Build an emergency fund'
        ? 'That estimate can help you test how much might be available to build an emergency fund.'
        : selectedGoal === 'Pay down debt'
          ? 'That estimate can help you compare extra debt payments with your other monthly needs.'
          : selectedGoal === 'Save for a purchase'
            ? 'That estimate can help you explore how a major purchase could affect your savings pace.'
            : selectedGoal === 'Improve monthly cash flow'
              ? 'That estimate gives you a baseline for exploring where monthly cash flow could improve.'
              : selectedGoal
                ? `That estimate is a starting point for understanding progress toward ${selectedGoal.toLowerCase()}.`
                : 'You can use that estimate to explore your finances without committing to a goal.'
    const secondaryInsight =
      selectedFocus === 'debt'
        ? `${money(finance.debt)} of your monthly income currently goes to debt payments.`
        : selectedFocus === 'saving'
          ? `Your current savings could cover about ${safetyBefore.toFixed(1)} months of estimated core costs.`
          : selectedFocus === 'money-flow'
            ? finance.income > 0
              ? `Housing and everyday expenses account for ${Math.round(((finance.housing + finance.expenses) / finance.income) * 100)}% of take-home income.`
              : 'Add income when you are ready to see where your monthly money goes.'
            : `You have ${money(snapshot.totalCash)} in total prototype assets, including investments, alongside ${money(snapshot.totalDebt)} in debt.`

    return (
      <Page
        className="onboarding-page"
        footer={
          <Button onClick={() => void completeOnboarding()} disabled={apiLoading} icon="arrow">
            {apiLoading ? 'Saving…' : 'Explore what this means'}
          </Button>
        }
      >
        <Header onBack={back} step={5} totalSteps={5} />
        <SectionTitle
          eyebrow="Your first insight"
          title="Here’s what stands out."
          body="Flux starts with the numbers, then connects them to the decisions that matter to you."
        />
        {apiError && (
          <ApiStatus
            loading={false}
            error={apiError}
            source={dataSource}
            onRetry={() => void completeOnboarding()}
          />
        )}
        <article className="primary-insight-card">
          <span className="insight-kicker">
            <Icon name="chart" size={17} /> Calculated monthly estimate
          </span>
          <strong>{money(Math.abs(cashFlow))}</strong>
          <p>
            {cashFlow >= 0
              ? `Based on your estimated take-home income and recurring profile costs, you have about ${money(cashFlow)} left each month before additional spending and unexpected costs. ${goalConnection}`
              : `Your estimated recurring profile costs are about ${money(Math.abs(cashFlow))} higher than your take-home income before additional spending and unexpected costs. Reviewing the assumptions may help clarify the gap.`}
          </p>
          <div className="insight-equation">
            <span>{money(finance.income)} income</span>
            <span>− {money(finance.housing + finance.expenses + finance.debt)} costs</span>
          </div>
        </article>
        <article className="secondary-insight-card">
          <span className="secondary-insight-icon">
            <Icon name={selectedFocus === 'debt' ? 'debt' : 'chart'} size={19} />
          </span>
          <div>
            <span>
              {selectedFocus
                ? `A closer look at ${focusLabels[selectedFocus]}`
                : 'A useful second signal'}
            </span>
            <strong>{secondaryInsight}</strong>
          </div>
        </article>
        <div className="insight-context">
          <span>Your context</span>
          <strong>
            {summaryGoals.length
              ? `Goals: ${summaryGoals.join(' · ')}`
              : 'No specific goal selected'}
          </strong>
          <p>
            {summaryGoals.length
              ? 'Flux will keep these goals in view while you explore tradeoffs.'
              : 'You can explore your full financial picture now and add a goal whenever it becomes useful.'}
          </p>
        </div>
        <div className="data-provenance-card">
          <strong>How to read this insight</strong>
          <div>
            <span>
              <i className="source-mark account" /> Account data
              <small>Stored mock balances</small>
            </span>
            <span>
              <i className="source-mark estimate" /> Calculated estimate
              <small>Income minus profile costs</small>
            </span>
            <span>
              <i className="source-mark assumption" /> Your assumptions
              <small>Goal and understanding preference</small>
            </span>
            <span>
              <i className="source-mark explanation" /> Flux explanation
              <small>Context, not financial advice</small>
            </span>
          </div>
        </div>
      </Page>
    )
  }

  if (screen === 'plan') {
    const cards = [
      {
        icon: 'wallet',
        eyebrow: 'Start with your comfort zone',
        title: 'Understand your monthly budget',
        text: 'Decide how much room you want to leave for your other priorities.',
        button: 'Explore My Budget',
        target: 'home' as Screen,
      },
      {
        icon: 'car',
        eyebrow: 'Prepare for the full cost',
        title: 'A car costs more than its payment',
        text: 'Insurance, fuel, maintenance, registration, and repairs can affect your budget.',
        button: 'See the Full Cost',
        target: 'simulator' as Screen,
      },
      {
        icon: 'leaf',
        eyebrow: 'Build toward your goal',
        title: 'Create a savings plan',
        text: 'A little progress each month can help with upfront costs and surprises.',
        button: 'Build My Savings Plan',
        target: 'forecast' as Screen,
      },
    ]
    return (
      <Page
        footer={
          <div className="action-stack">
            <Button onClick={() => go('simulator')} icon="arrow">
              Explore My Options
            </Button>
            <Button variant="ghost" onClick={() => go('ai')}>
              Talk to Flux
            </Button>
          </div>
        }
      >
        <Header onBack={back} title="Your plan" />
        <ApiStatus
          loading={apiLoading}
          error={apiError}
          source={dataSource}
          onRetry={() => void loadApiData()}
        />
        <SectionTitle
          title="Let’s make your goal feel more manageable."
          body="Getting to work reliably is your priority. These tools help you review the tradeoffs without rushing a decision."
        />
        <div className="plan-list">
          {cards.map((card, i) => (
            <article className="plan-card" key={card.title}>
              <div className="plan-number">0{i + 1}</div>
              <div className="card-icon">
                <Icon name={card.icon} />
              </div>
              <div className="mini-label">{card.eyebrow}</div>
              <h2>{card.title}</h2>
              <p>{card.text}</p>
              <Button variant="secondary" onClick={() => go(card.target)} icon="arrow">
                {card.button}
              </Button>
            </article>
          ))}
        </div>
        <div className="insight-card">
          <div className="insight-icon">
            <Icon name="spark" />
          </div>
          <div>
            <strong>A thought from Flux</strong>
            <p>
              Since reliable transportation matters for getting to work, let’s focus on a car that
              supports your daily life without making other expenses harder to manage.
            </p>
          </div>
        </div>
      </Page>
    )
  }

  if (screen === 'ai') {
    const prompts = [
      'How much car can I comfortably afford?',
      'What other costs should I expect?',
      'How can I prepare for a car loan?',
      'What changes if I wait three months?',
    ]
    return (
      <Page nav={nav} className="chat-page">
        <Header
          onBack={history.length ? back : undefined}
          title="Flux AI"
          action={<span className="online-dot">Online</span>}
        />
        <SectionTitle
          title="Let’s figure this out together."
          body="Ask questions, explore tradeoffs, and move at your own pace."
        />
        <div className="chat-thread">
          <div className="chat-row ai">
            <div className="avatar">
              <Icon name="spark" size={17} />
            </div>
            <div className="bubble">
              <p>
                I’m using example numbers—not connected bank data: {money(finance.income)} income,{' '}
                {money(finance.housing + finance.expenses)} housing and other expenses,{' '}
                {money(finance.debt)} existing debt payments, and {money(finance.savings)} savings.
              </p>
              <p>
                Getting to work reliably is your priority. Before considering a next step, we can
                verify the assumptions, review the full cost, or compare how each path changes the
                rest of your budget.
              </p>
              <span>Grounded in the example profile and visible scenario assumptions</span>
            </div>
          </div>
          {chat.map((message, i) => (
            <div key={i} className={`chat-row ${message.from}`}>
              <div className={`bubble${message.pending ? ' pending' : ''}`}>
                <p>{message.text}</p>
                {message.from === 'ai' && !message.pending && (
                  <button
                    type="button"
                    className="listen-button"
                    aria-label="Listen to this reply"
                    onClick={() => void speakReply(message.text, { preferBrowser: true })}
                  >
                    Listen
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {chat.length === 0 && (
          <div className="prompt-list">
            {prompts.map((prompt) => (
              <button key={prompt} onClick={() => sendPrompt(prompt)}>
                {prompt}
                <Icon name="arrow" size={16} />
              </button>
            ))}
          </div>
        )}
        <form className="chat-input" onSubmit={submitChat}>
          <input
            value={chatInput}
            onChange={(e) => {
              lastInputWasVoiceRef.current = false
              setChatInput(e.target.value)
            }}
            placeholder="Ask Flux anything about your goal..."
            aria-label="Message Flux AI"
          />
          <button
            type="button"
            className={`chat-mic-button ${isListening ? 'listening' : ''}`}
            aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
            aria-pressed={isListening}
            title={isListening ? 'Stop listening' : 'Talk to Flux'}
            onClick={toggleVoiceInput}
          >
            <Icon name="microphone" />
          </button>
          <button type="submit" className="chat-send-button" aria-label="Send message">
            <Icon name="send" />
          </button>
        </form>
        {voiceMessage && (
          <p className="voice-input-status" role="status" aria-live="polite">
            {voiceMessage}
          </p>
        )}
        <p className="ai-disclaimer">
          Flux provides educational estimates, not financial guarantees.
        </p>
      </Page>
    )
  }

  if (screen === 'simulator') {
    const budgetRatio = finance.income ? details.totalMonthly / finance.income : 0
    const comfort =
      budgetRatio < 0.15
        ? ['Comfortable starting point', 'positive']
        : budgetRatio < 0.22
          ? ['Worth reviewing', 'review']
          : ['May put pressure on your budget', 'pressure']
    return (
      <Page nav={nav}>
        <Header onBack={history.length ? back : undefined} title="What-if simulator" />
        <ApiStatus
          loading={scenarioLoading}
          error={scenarioError}
          source={dataSource}
          onRetry={() => setSim((current) => ({ ...current }))}
        />
        <SectionTitle
          eyebrow="Financial Ripple Effect"
          title="If you buy this car, what else changes?"
          body="See how this decision could change your monthly budget, savings, bills, and goal."
        />
        <div className="scenario-label">
          <span className="card-icon">
            <Icon name="car" />
          </span>
          <div>
            <span>Goal this decision affects</span>
            <strong>{goal === 'Buy my first car' ? 'Get a reliable car' : goal}</strong>
          </div>
          <button className="goal-change-button" onClick={() => setGoalPickerOpen((open) => !open)}>
            <Icon name="edit" size={14} />
            Change goal
          </button>
        </div>
        {goalPickerOpen && (
          <div className="sim-goal-picker">
            <div className="card-heading">
              <span>Choose the goal you want to keep in view</span>
              <button onClick={() => setGoalPickerOpen(false)} aria-label="Close goal picker">
                ×
              </button>
            </div>
            <p>
              The car calculation stays the same. Flux will show how this decision could affect the
              goal you select.
            </p>
            <div className="sim-goal-options">
              {availableGoals.map((goalOption) => (
                <button
                  key={goalOption.id}
                  className={goal === goalOption.label ? 'selected' : ''}
                  onClick={() => {
                    setGoal(goalOption.label)
                    setGoalPickerOpen(false)
                  }}
                >
                  <span>{goalOption.label}</span>
                  {goal === goalOption.label && <Icon name="check" size={15} />}
                </button>
              ))}
            </div>
            <form
              className="sim-custom-goal"
              onSubmit={(event) => {
                event.preventDefault()
                if (!customGoal.trim()) return
                setGoal(customGoal.trim())
                setCustomGoal('')
                setGoalPickerOpen(false)
              }}
            >
              <label htmlFor="custom-goal">Or enter your own goal</label>
              <div>
                <input
                  id="custom-goal"
                  value={customGoal}
                  onChange={(event) => setCustomGoal(event.target.value)}
                  placeholder="e.g. Start a small business"
                />
                <button type="submit" disabled={!customGoal.trim()}>
                  Use goal
                </button>
              </div>
            </form>
          </div>
        )}
        <div className="sim-form">
          <div className="field">
            <span className="field-label">Purchase timing</span>
            <div className="timing-tabs">
              <button
                className={(sim.purchaseTiming || 'now') === 'now' ? 'active' : ''}
                onClick={() => setSim((current) => ({ ...current, purchaseTiming: 'now' }))}
              >
                Buy now
              </button>
              <button
                className={sim.purchaseTiming === 'wait-3-months' ? 'active' : ''}
                onClick={() =>
                  setSim((current) => ({ ...current, purchaseTiming: 'wait-3-months' }))
                }
              >
                Wait 3 months
              </button>
            </div>
          </div>
          <CurrencyInput
            label="Estimated car price"
            value={sim.price}
            onChange={(v) => updateSim('price', v)}
          />
          <CurrencyInput
            label="Down payment"
            value={sim.down}
            onChange={(v) => updateSim('down', v)}
          />
          <div className="field">
            <span className="field-label">Loan term</span>
            <div className="term-tabs">
              {[36, 48, 60, 72].map((term) => (
                <button
                  key={term}
                  className={sim.term === term ? 'active' : ''}
                  onClick={() => updateSim('term', term)}
                >
                  {term}
                  <span>mo</span>
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            <span className="field-label">Estimated APR</span>
            <span className="input-shell">
              <input
                type="number"
                min="0"
                step=".1"
                value={sim.apr}
                onChange={(e) => updateSim('apr', Number(e.target.value))}
              />
              <span className="input-suffix">%</span>
            </span>
          </label>
          <div className="split-fields">
            <CurrencyInput
              label="Monthly insurance"
              value={sim.insurance}
              onChange={(v) => updateSim('insurance', v)}
            />
            <CurrencyInput
              label="Fuel & maintenance"
              value={sim.running}
              onChange={(v) => updateSim('running', v)}
            />
          </div>
          <CurrencyInput
            label="Upfront fees"
            value={sim.fees}
            onChange={(v) => updateSim('fees', v)}
            hint="Registration, taxes, or dealer fees"
          />
        </div>
        <div className="ripple-intro">
          <div className="ripple-rings" aria-hidden="true">
            <span />
            <span />
            <span />
            <Icon name="car" size={22} />
          </div>
          <div>
            <span className="eyebrow">The payment is only the start</span>
            <h2>{money(details.totalMonthly)} estimated total per month</h2>
            <p>
              A {money(details.payment)} loan payment creates a wider ripple once insurance, fuel,
              and maintenance are included.
            </p>
          </div>
        </div>
        <div className="full-cost-strip">
          <div>
            <span>Loan</span>
            <strong>{money(details.payment)}</strong>
          </div>
          <span>+</span>
          <div>
            <span>Insurance</span>
            <strong>{money(sim.insurance)}</strong>
          </div>
          <span>+</span>
          <div>
            <span>Running costs</span>
            <strong>{money(sim.running)}</strong>
          </div>
        </div>
        <div className="calculation-ledger">
          <div className="card-heading">
            <span>Where the monthly remainder comes from</span>
            <span className="demo-pill">No double-counting</span>
          </div>
          <div className="ledger-row">
            <span>Monthly income</span>
            <strong>{money(finance.income)}</strong>
          </div>
          <div className="ledger-row subtract">
            <span>Housing</span>
            <strong>− {money(finance.housing)}</strong>
          </div>
          <div className="ledger-row subtract">
            <span>Other expenses, excluding debt</span>
            <strong>− {money(finance.expenses)}</strong>
          </div>
          <div className="ledger-row subtract">
            <span>Existing debt payments</span>
            <strong>− {money(finance.debt)}</strong>
          </div>
          <div className="ledger-row total">
            <span>Money left before the car</span>
            <strong>{money(cashFlow)}</strong>
          </div>
          <div className="ledger-row subtract">
            <span>Total car cost, including new loan</span>
            <strong>− {money(details.totalMonthly)}</strong>
          </div>
          <div className="ledger-row final">
            <span>Money left after the car</span>
            <strong>{money(remainingAfterCar)}</strong>
          </div>
        </div>
        <div className="ripple-heading">
          <div>
            <span className="eyebrow">What this could mean for you</span>
            <h2>Your whole picture, connected</h2>
          </div>
          <span className="demo-pill">Live estimate</span>
        </div>
        <div className="ripple-grid">
          <article className="ripple-card cash">
            <div className="ripple-card-top">
              <span className="ripple-icon">
                <Icon name="chart" />
              </span>
              <span>Money left each month</span>
            </div>
            <div className="before-after">
              <div>
                <span>Before</span>
                <strong>{money(cashFlow)}</strong>
              </div>
              <Icon name="arrow" size={16} />
              <div>
                <span>After</span>
                <strong>{money(remainingAfterCar)}</strong>
              </div>
            </div>
            <p>
              About {money(Math.max(remainingAfterCar, 0))} would remain for additional savings and
              unexpected expenses.
            </p>
          </article>
          <article className="ripple-card safety">
            <div className="ripple-card-top">
              <span className="ripple-icon">
                <Icon name="shield" />
              </span>
              <span>Emergency savings</span>
            </div>
            <div className="before-after">
              <div>
                <span>Before</span>
                <strong>{safetyBefore.toFixed(1)} mo</strong>
              </div>
              <Icon name="arrow" size={16} />
              <div>
                <span>After upfront cost</span>
                <strong>{safetyAfter.toFixed(1)} mo</strong>
              </div>
            </div>
            <p>
              Your {money(details.upfront)} upfront cost would leave about{' '}
              {money(savingsAfterUpfront)} in savings.
            </p>
          </article>
          <article className="ripple-card obligations">
            <div className="ripple-card-top">
              <span className="ripple-icon">
                <Icon name="debt" />
              </span>
              <span>Bills and debt payments</span>
            </div>
            <div className="obligation-stack">
              <span
                style={{ width: `${Math.min((finance.debt / finance.income) * 100 * 2.5, 100)}%` }}
              />
              <span
                style={{
                  width: `${Math.min(((finance.debt + details.payment) / finance.income) * 100 * 2.5, 100)}%`,
                }}
              />
            </div>
            <div className="obligation-labels">
              <span>Current debt {money(finance.debt)}</span>
              <span>With car loan {money(finance.debt + details.payment)}</span>
            </div>
            <p>The new loan would sit alongside the commitments you already have.</p>
          </article>
          <article className="ripple-card goal">
            <div className="ripple-card-top">
              <span className="ripple-icon">
                <Icon name="flag" />
              </span>
              <span>Progress toward your goal</span>
            </div>
            <span className="goal-context">
              {goal === 'Buy my first car' ? 'Get a reliable car' : goal}
            </span>
            <div className="goal-impact">
              <strong>
                {remainingAfterCar >= contribution ? 'Still moving' : 'May take longer'}
              </strong>
              <span>toward this goal</span>
            </div>
            <p>
              {remainingAfterCar >= contribution
                ? `Your current ${money(contribution)} monthly goal contribution may still fit.`
                : `Your current ${money(contribution)} monthly contribution may need to change.`}
            </p>
          </article>
        </div>
        <div className="flux-verdict">
          <div className="insight-icon">
            <Icon name="spark" />
          </div>
          <div>
            <strong>The payment may fit. The full ripple is tighter.</strong>
            <p>
              Before the car, you have about {money(cashFlow)} left after estimated expenses. After
              the full car cost, that becomes about {money(remainingAfterCar)}. That does not make
              the choice right or wrong—it shows the tradeoff.
            </p>
          </div>
        </div>
        <button className="wait-feature" onClick={() => go('compare')}>
          <span className="wait-calendar">
            <Icon name="calendar" size={24} />
            <strong>+3</strong>
          </span>
          <span>
            <span className="eyebrow">Signature what-if</span>
            <strong>What if I wait three months?</strong>
            <small>See how more time could change all four ripples.</small>
          </span>
          <Icon name="arrow" />
        </button>
        <div className="results-card compact-results">
          <div className="card-heading">
            <span>Loan details</span>
            <span className={`comfort-label ${comfort[1]}`}>{comfort[0]}</span>
          </div>
          <div className="result-breakdown">
            <div>
              <span>Loan payment</span>
              <strong>{money(details.payment)}</strong>
            </div>
            <div>
              <span>Insurance + running costs</span>
              <strong>{money(sim.insurance + sim.running)}</strong>
            </div>
            <div>
              <span>Total interest</span>
              <strong>{money(details.interest)}</strong>
            </div>
            <div>
              <span>Upfront cost</span>
              <strong>{money(details.upfront)}</strong>
            </div>
          </div>
          <p className="estimate-note">
            Estimates use your illustrative profile and the assumptions above. They do not include
            every possible cost or determine affordability.
          </p>
        </div>
        {savedScenarios.length > 0 && (
          <div className="saved-strip">
            <span>
              {savedScenarios.length} scenario{savedScenarios.length > 1 ? 's' : ''} saved
            </span>
            <Button variant="small" onClick={() => go('compare')}>
              Compare
            </Button>
          </div>
        )}
        <div className="page-actions">
          <Button onClick={() => void saveScenario()} disabled={scenarioLoading}>
            Save This Scenario
          </Button>
          <Button variant="secondary" onClick={() => go('compare')}>
            Compare Three Paths
          </Button>
          <Button variant="ghost" onClick={() => go('plan')}>
            Back to My Plan
          </Button>
        </div>
      </Page>
    )
  }

  if (screen === 'extension') {
    const fuel = 110
    const maintenance = extensionScenario.running - fuel
    const monthlyRoom = cashFlow - extensionDetails.totalMonthly
    const savingsAfterPurchase = Math.max(finance.savings - extensionDetails.upfront, 0)
    const extensionOptions = [
      {
        name: 'Buy this car now',
        note: 'Get reliable transportation sooner.',
        data: extensionScenario,
        delay: 0,
      },
      {
        name: 'Choose a lower-cost car',
        note: 'Reduce the monthly commitment.',
        data: { ...extensionScenario, price: Math.max(recognizedPrice - 3500, 5000) },
        delay: 0,
      },
      {
        name: 'Wait 3 months and save more',
        note: 'Build a larger down payment first.',
        data: { ...extensionScenario, down: extensionScenario.down + contribution * 3 },
        delay: 3,
      },
    ]
    const chooseExtensionOption = (name: string, data: SimulatorData) => {
      setExtensionChoice(name)
      setRecognizedPrice(data.price)
      setExtensionStep(5)
    }
    return (
      <div className="extension-host">
        <aside className="extension-panel">
          <header className="extension-header">
            <div>
              <span className="extension-logo">
                <img src={fluxLogo} alt="" />
              </span>
              <div>
                <strong>Flux Companion</strong>
                <span>Chrome side panel</span>
              </div>
            </div>
            <div className="extension-header-actions">
              {extensionStep > 1 && (
                <button
                  onClick={() => setExtensionStep((step) => Math.max(step - 1, 1))}
                  aria-label="Previous extension screen"
                >
                  <Icon name="back" size={17} />
                </button>
              )}
              <button onClick={() => go('home')} aria-label="Close Flux Companion">
                <span className="close-mark">×</span>
              </button>
            </div>
          </header>

          {extensionStep === 1 && (
            <div className="extension-welcome">
              <div className="extension-welcome-art">
                <span className="browser-window">
                  <i />
                  <i />
                  <i />
                  <span className="browser-listing">
                    <img className="browser-flux-mark" src={fluxLogo} alt="" />
                  </span>
                </span>
                <span className="companion-badge">
                  <img src={fluxLogo} alt="" />
                </span>
              </div>
              <span className="extension-kicker">Context for your next move</span>
              <h1>Flux Companion</h1>
              <p className="extension-tagline">Your finances, moving toward what matters.</p>
              <p className="extension-body">
                On a car listing, click the Flux extension icon to open this panel. This demo
                focuses only on car listings and never opens automatically.
              </p>
              <div className="extension-demo-note">
                <Icon name="shield" size={17} />
                <span>
                  <strong>You choose when Flux analyzes a page</strong>
                  Flux does not scan links automatically. This demo uses example financial data.
                </span>
              </div>
              <Button onClick={() => setExtensionStep(2)} icon="arrow">
                Open Flux on This Page
              </Button>
            </div>
          )}

          {extensionStep === 2 && (
            <div className="extension-content">
              <div className="noticed-banner">
                <span>
                  <Icon name="spark" size={16} />
                </span>
                <div>
                  <strong>Want to see how this car could fit?</strong>
                  <p>Flux only analyzes this page when you choose to.</p>
                </div>
              </div>
              <div className="listing-preview">
                <p className="permission-note">
                  You opened Flux on this listing. Review or edit the details before continuing. If
                  Flux cannot detect a price, you can enter it here.
                </p>
                <div className="listing-site-row">
                  <span className="listing-site-icon">A</span>
                  <div>
                    <strong>AutoMarket</strong>
                    <span>Vehicle listing · Demo</span>
                  </div>
                  <span className="listing-live">On this page</span>
                </div>
                <div className="listing-car-art">
                  <span className="listing-year">2022</span>
                  <Icon name="car" size={72} />
                </div>
                <label className="extension-field">
                  <span>Vehicle</span>
                  <input
                    value={recognizedVehicle}
                    onChange={(event) => setRecognizedVehicle(event.target.value)}
                  />
                </label>
                <label className="extension-field">
                  <span>Listed price</span>
                  <span className="extension-price-input">
                    <span>$</span>
                    <input
                      type="number"
                      min="0"
                      value={recognizedPrice}
                      onChange={(event) => setRecognizedPrice(Number(event.target.value))}
                    />
                  </span>
                </label>
                <p className="listing-edit-note">
                  <Icon name="edit" size={14} /> Edit anything Flux did not recognize correctly.
                </p>
              </div>
              <div className="extension-profile-strip">
                <span className="profile-mini">A</span>
                <div>
                  <strong>Compared with the example profile</strong>
                  <span>
                    Income − housing − other expenses − debt = {money(cashFlow)} monthly room
                  </span>
                </div>
                <Icon name="check" size={17} />
              </div>
              <Button onClick={() => setExtensionStep(3)} icon="arrow">
                Analyze This Decision
              </Button>
            </div>
          )}

          {extensionStep === 3 && (
            <div className="extension-content">
              <div className="extension-title">
                <span className="extension-kicker">Financial Ripple Effect</span>
                <h1>How could this decision affect your finances?</h1>
                <p>
                  See how this decision could change your monthly budget, savings, bills, and goal.
                  Based on {recognizedVehicle} at {money(recognizedPrice)}.
                </p>
              </div>
              <div className="extension-total-card">
                <span>Estimated total monthly car cost</span>
                <strong>
                  {money(extensionDetails.totalMonthly)}
                  <small>/month</small>
                </strong>
                <div className="extension-cost-grid">
                  <div>
                    <span>Loan</span>
                    <strong>{money(extensionDetails.payment)}</strong>
                  </div>
                  <div>
                    <span>Insurance</span>
                    <strong>{money(extensionScenario.insurance)}</strong>
                  </div>
                  <div>
                    <span>Fuel</span>
                    <strong>{money(fuel)}</strong>
                  </div>
                  <div>
                    <span>Maintenance</span>
                    <strong>{money(maintenance)}</strong>
                  </div>
                </div>
              </div>
              <div className="extension-ripple-list">
                <article>
                  <span className="extension-ripple-icon sage">
                    <Icon name="chart" />
                  </span>
                  <div>
                    <span>Money left each month</span>
                    <strong>
                      {money(cashFlow)} → {money(monthlyRoom)} remaining
                    </strong>
                    <p>
                      The full car cost would use about{' '}
                      {Math.round((extensionDetails.totalMonthly / cashFlow) * 100)}% of your
                      current monthly room.
                    </p>
                  </div>
                </article>
                <article>
                  <span className="extension-ripple-icon peach">
                    <Icon name="shield" />
                  </span>
                  <div>
                    <span>Emergency savings</span>
                    <strong>
                      {money(finance.savings)} → {money(savingsAfterPurchase)}
                    </strong>
                    <p>After the estimated {money(extensionDetails.upfront)} upfront cost.</p>
                  </div>
                </article>
                <article>
                  <span className="extension-ripple-icon neutral">
                    <Icon name="debt" />
                  </span>
                  <div>
                    <span>Bills and debt payments</span>
                    <strong>{money(finance.debt + extensionDetails.payment)}/month</strong>
                    <p>Your current debt payments plus the estimated car loan.</p>
                  </div>
                </article>
                <article>
                  <span className="extension-ripple-icon sage">
                    <Icon name="flag" />
                  </span>
                  <div>
                    <span>Progress toward your goal</span>
                    <strong>
                      {monthlyRoom >= contribution ? 'Still moving forward' : 'May need more time'}
                    </strong>
                    <p>Your transportation goal moves forward, with less room for savings.</p>
                  </div>
                </article>
              </div>
              <div className="extension-explanation">
                <Icon name="spark" size={18} />
                <p>
                  The loan payment is only part of the decision. After the full estimated cost,
                  you’d have about <strong>{money(monthlyRoom)}</strong> left for savings and
                  unexpected expenses.
                </p>
              </div>
              <div className="extension-actions">
                <Button onClick={() => setExtensionStep(4)} icon="arrow">
                  Compare Ways Forward
                </Button>
                <Button variant="ghost" onClick={() => setExtensionStep(5)}>
                  See Flux Insight
                </Button>
              </div>
            </div>
          )}

          {extensionStep === 4 && (
            <div className="extension-content">
              <div className="extension-title">
                <span className="extension-kicker">Compare the tradeoffs</span>
                <h1>You have a few ways forward.</h1>
                <p>No single path is right for everyone. Choose what you want to prioritize.</p>
              </div>
              <div className="extension-option-list">
                {extensionOptions.map((option, index) => {
                  const optionDetails = loanDetails(option.data)
                  const optionSavings =
                    finance.savings + contribution * option.delay - optionDetails.upfront
                  return (
                    <article className={index === 1 ? 'recommended' : ''} key={option.name}>
                      <div className="extension-option-top">
                        <span>Option {String.fromCharCode(65 + index)}</span>
                        {index === 1 && (
                          <span className="extension-recommendation">More monthly room</span>
                        )}
                      </div>
                      <h2>{option.name}</h2>
                      <p>{option.note}</p>
                      <div className="extension-option-cost">
                        <strong>{money(optionDetails.totalMonthly)}</strong>
                        <span>estimated / month</span>
                      </div>
                      <div className="extension-option-stats">
                        <div>
                          <span>Total interest</span>
                          <strong>{money(optionDetails.interest)}</strong>
                        </div>
                        <div>
                          <span>Upfront cost</span>
                          <strong>{money(optionDetails.upfront)}</strong>
                        </div>
                        <div>
                          <span>Goal effect</span>
                          <strong>
                            {optionSavings >= 0
                              ? `${money(Math.max(optionSavings, 0))} cushion`
                              : 'Uses full cushion'}
                          </strong>
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() => chooseExtensionOption(option.name, option.data)}
                        icon="arrow"
                      >
                        Review This Path
                      </Button>
                      <details className="extension-assumptions">
                        <summary>View assumptions</summary>
                        <ul>
                          <li>Car price: {money(option.data.price)}</li>
                          <li>
                            APR: {option.data.apr}% and loan term: {option.data.term} months
                          </li>
                          <li>Current down payment: {money(extensionScenario.down)}</li>
                          {option.delay > 0 && (
                            <>
                              <li>Monthly savings while waiting: {money(contribution)}</li>
                              <li>Additional savings after 3 months: {money(contribution * 3)}</li>
                              <li>Car price and APR assumed unchanged</li>
                            </>
                          )}
                          {index === 1 && <li>Lower-cost car uses the same down payment</li>}
                        </ul>
                      </details>
                    </article>
                  )
                })}
              </div>
            </div>
          )}

          {extensionStep === 5 && (
            <div className="extension-content extension-insight-screen">
              <div className="extension-insight-mark">
                <span>
                  <Icon name="spark" size={26} />
                </span>
              </div>
              <span className="extension-kicker">A thought from Flux</span>
              <h1>Keep the whole picture in view.</h1>
              <div className="extension-quote">
                <p>
                  “Getting reliable transportation is your priority. Based on the example numbers,
                  <strong> {extensionChoice.toLowerCase()}</strong> changes both your monthly room
                  and savings cushion. I would review those assumptions alongside the alternatives
                  before deciding.”
                </p>
              </div>
              <div className="extension-reason">
                <span className="extension-ripple-icon sage">
                  <Icon name="info" />
                </span>
                <div>
                  <strong>Why Flux is showing this</strong>
                  <p>
                    The example profile leaves {money(cashFlow)} before a car. This is not linked
                    bank data, and the result depends on the price, APR, down payment, and ownership
                    costs shown above.
                  </p>
                </div>
              </div>
              <div className="extension-actions">
                <Button onClick={() => setExtensionStep(4)}>Compare Another Option</Button>
                <Button variant="secondary" onClick={() => go('ai')} icon="spark">
                  Ask Flux a Question
                </Button>
                <Button variant="ghost" onClick={() => setExtensionStep(2)}>
                  Return to the Listing
                </Button>
              </div>
              <p className="extension-disclaimer">
                Illustrative estimates only. Flux has not accessed or changed the listing.
              </p>
            </div>
          )}
        </aside>
      </div>
    )
  }

  if (screen === 'home') {
    const purchaseGoal = goal === 'Save for a purchase' || goal === 'Buy my first car'
    const dashboardInsight =
      understandingFocus === 'debt'
        ? `${money(finance.debt)} in monthly debt payments is included in your recurring-cost estimate.`
        : understandingFocus === 'saving'
          ? `Your current savings cover about ${safetyBefore.toFixed(1)} months of the recurring costs in your profile.`
          : understandingFocus === 'money-flow'
            ? `${money(finance.housing + finance.expenses + finance.debt)} of your monthly profile is currently assigned to recurring costs.`
            : `Your estimated monthly amount after recurring profile costs is ${money(cashFlow)} before additional spending and unexpected costs.`
    return (
      <Page nav={nav}>
        <header className="dashboard-header">
          <div>
            <img className="home-logo" src={fluxLogo} alt="Flux" />
          </div>
          <div className="home-header-actions">
            <button
              className={`notification-button ${weeklyOpen ? 'active' : ''}`}
              onClick={() => setWeeklyOpen((open) => !open)}
              aria-label="Open weekly suggestions"
            >
              <Icon name="bell" size={21} />
              <span>2</span>
            </button>
            <button className="avatar-button" onClick={() => go('profile')}>
              A
            </button>
          </div>
        </header>
        <ApiStatus
          loading={apiLoading}
          error={apiError}
          source={dataSource}
          onRetry={() => void loadApiData()}
        />
        {weeklyOpen && (
          <div className="weekly-panel">
            <div className="weekly-panel-heading">
              <div>
                <span className="eyebrow">This week from Flux</span>
                <h2>Two things worth reviewing</h2>
              </div>
              <button onClick={() => setWeeklyOpen(false)} aria-label="Close weekly suggestions">
                ×
              </button>
            </div>
            <article>
              <span className="weekly-icon sage">
                <Icon name="calendar" size={18} />
              </span>
              <div>
                <strong>
                  {purchaseGoal
                    ? 'Waiting could add to your purchase savings'
                    : 'Review what is included in your monthly estimate'}
                </strong>
                <p>
                  {purchaseGoal
                    ? `At your example contribution, three months could add about ${money(contribution * 3)} before unexpected expenses.`
                    : `${money(cashFlow)} remains after the recurring costs in your profile, before additional spending and unexpected costs.`}
                </p>
                <button
                  onClick={() => {
                    setWeeklyOpen(false)
                    go(purchaseGoal ? 'compare' : 'finances')
                  }}
                >
                  {purchaseGoal ? 'Review the assumptions' : 'Review the numbers'}{' '}
                  <Icon name="arrow" size={14} />
                </button>
              </div>
            </article>
            <article>
              <span className="weekly-icon peach">
                <Icon name="clock" size={18} />
              </span>
              <div>
                <strong>Rent is the next large obligation</strong>
                <p>Your housing payment of {money(finance.housing)} is due in five days.</p>
                <button
                  onClick={() => {
                    setWeeklyOpen(false)
                    go('forecast')
                  }}
                >
                  View the forecast <Icon name="arrow" size={14} />
                </button>
              </div>
            </article>
            <p className="weekly-disclaimer">
              Suggestions use example data and visible assumptions—not a connected account.
            </p>
          </div>
        )}
        <SectionTitle
          title="Your financial picture."
          body="Review accounts, recurring costs, savings, and upcoming obligations before exploring a decision."
        />
        {goal ? (
          <article className="goal-card">
            <div className="goal-top">
              <div>
                <div className="mini-label">Your goal</div>
                <h2>{goal === 'Buy my first car' ? 'Get a reliable car' : goal}</h2>
                <p>Saved preference</p>
              </div>
              <button
                className="goal-view"
                onClick={() =>
                  go(
                    purchaseGoal
                      ? 'plan'
                      : goal === 'Build an emergency fund'
                        ? 'forecast'
                        : 'finances',
                  )
                }
              >
                {purchaseGoal ? 'View plan' : 'Review finances'} <Icon name="arrow" size={15} />
              </button>
            </div>
            <p className="goal-data-note">Goal preference · No target amount has been assumed</p>
          </article>
        ) : (
          <article className="goal-card open-explore-card">
            <div className="goal-top">
              <div>
                <div className="mini-label">Explore without a goal</div>
                <h2>Start with your full financial picture.</h2>
                <p>Add a goal later whenever it becomes useful.</p>
              </div>
              <button className="goal-view" onClick={() => go('finances')}>
                View finances <Icon name="arrow" size={15} />
              </button>
            </div>
          </article>
        )}
        <div className="section-row">
          <div>
            <span className="eyebrow financial-picture-title">
              Your financial picture&nbsp;&nbsp;&nbsp;
            </span>
          </div>
          <button onClick={() => go('finances')}>View all</button>
        </div>
        <div className="health-grid">
          <HealthCard
            icon="chart"
            tone="sage"
            label="After recurring costs"
            value={money(cashFlow)}
            status="Calculated estimate"
            onClick={() => go('forecast')}
          />
          <HealthCard
            icon="shield"
            tone="peach"
            label="Emergency savings"
            value={money(finance.savings)}
            status="Building a cushion"
            onClick={() => go('finances')}
          />
          <HealthCard
            icon="debt"
            tone="cream"
            label="Bills and debt payments"
            value={`${finance.income > 0 ? Math.round((finance.debt / finance.income) * 100) : 0}%`}
            status="Know your commitments"
            onClick={() => go('finances')}
          />
          <HealthCard
            icon="wallet"
            tone="sage"
            label="Total financial position"
            value={money(snapshot.netPosition)}
            status="Assets minus debt"
            onClick={() => go('finances')}
          />
        </div>
        <article className="obligations card">
          <div className="card-heading">
            <span>Coming up</span>
            <span>Next 2 weeks</span>
          </div>
          {snapshot.obligations.length === 0 ? (
            <div className="api-empty-state">No upcoming obligations were returned.</div>
          ) : (
            snapshot.obligations.map((obligation) => (
              <div className="obligation" key={obligation.id}>
                <span className="date-dot" />
                <div>
                  <strong>{obligation.name}</strong>
                  <span>Due in {obligation.dueInDays} days</span>
                </div>
                <strong>{money(obligation.amount)}</strong>
              </div>
            ))
          )}
        </article>
        <article className="forecast-preview card" onClick={() => go('forecast')}>
          <div className="card-heading">
            <span>Six-month outlook</span>
            <span className="demo-pill">Estimate</span>
          </div>
          <MiniChart values={forecast} />
          <div className="forecast-summary">
            <div>
              <span>Starting</span>
              <strong>{money(finance.savings)}</strong>
            </div>
            <Icon name="arrow" />
            <div>
              <span>Projected</span>
              <strong>{money(forecast[6])}</strong>
            </div>
          </div>
        </article>
        <div className="insight-card dashboard-insight">
          <div className="insight-icon">
            <Icon name="spark" />
          </div>
          <div>
            <strong>Flux explanation</strong>
            <p>{dashboardInsight}</p>
            <button onClick={() => go(understandingFocus === 'saving' ? 'forecast' : 'finances')}>
              Review the numbers <Icon name="arrow" size={15} />
            </button>
          </div>
        </div>
        <button
          className={`dashboard-ripple ${purchaseGoal ? '' : 'secondary-ripple'}`}
          onClick={() => go('simulator')}
        >
          <span className="dashboard-ripple-visual">
            <i />
            <i />
            <i />
            <Icon name="car" size={20} />
          </span>
          <span>
            <span className="eyebrow">
              {purchaseGoal ? 'Your Financial Ripple Effect' : 'Decision example'}
            </span>
            <strong>
              {purchaseGoal
                ? 'See how a major purchase could affect your finances'
                : 'Explore the Ripple Effect with a car purchase'}
            </strong>
            <small>Calculated scenario · User-adjustable assumptions</small>
          </span>
          <Icon name="arrow" />
        </button>
        {purchaseGoal && (
          <button
            className="companion-entry"
            onClick={() => {
              setExtensionStep(1)
              go('extension')
            }}
          >
            <span className="companion-entry-icon">
              <img src={fluxLogo} alt="" />
            </span>
            <span>
              <span className="eyebrow">Optional · Chrome Companion</span>
              <strong>Use the Ripple Effect while browsing</strong>
              <small>Apply your saved profile to an illustrative car listing.</small>
            </span>
            <Icon name="arrow" size={18} />
          </button>
        )}
      </Page>
    )
  }

  if (screen === 'finances') {
    const accountPresentation = {
      checking: { label: 'Checking', icon: 'wallet', tone: 'sage' },
      savings: { label: 'Savings', icon: 'leaf', tone: 'sage' },
      'credit-card': { label: 'Credit card', icon: 'debt', tone: 'peach' },
      loan: { label: 'Existing loan', icon: 'debt', tone: 'cream' },
      investment: { label: 'Long-term savings', icon: 'chart', tone: 'cream' },
    } as const
    const cash = snapshot.availableCash
    const debtTotal = snapshot.totalDebt
    return (
      <Page nav={nav}>
        <Header
          onBack={history.length ? back : undefined}
          title="My Finances"
          action={
            <button className="icon-btn" onClick={() => go('profile')}>
              <Icon name="edit" />
            </button>
          }
        />
        <ApiStatus
          loading={apiLoading}
          error={apiError}
          source={dataSource}
          onRetry={() => void loadApiData()}
        />
        <SectionTitle
          title="Your finances, all in one place."
          body="A clear view of illustrative accounts and obligations."
        />
        <button className="connect-account-button" onClick={() => setConnectOpen((open) => !open)}>
          <span className="connect-account-icon">
            <Icon name="plus" size={20} />
          </span>
          <span>
            <strong>Connect a bank or card</strong>
            <small>Simulate adding another financial account</small>
          </span>
          <Icon name={connectOpen ? 'back' : 'arrow'} size={18} />
        </button>
        {connectOpen && (
          <div className="connect-panel">
            <div className="card-heading">
              <span>Add to your financial picture</span>
              <span className="demo-pill">Demo only</span>
            </div>
            <p>
              No real credentials are requested or stored. Choose an option to simulate how a
              connection would appear in Flux.
            </p>
            <div className="connect-options">
              <button
                onClick={() =>
                  setDemoConnections((items) =>
                    items.includes('Bank account') ? items : [...items, 'Bank account'],
                  )
                }
              >
                <span className="account-icon sage">
                  <Icon name="wallet" />
                </span>
                <span>
                  <strong>Connect a bank</strong>
                  <small>Checking or savings</small>
                </span>
                {demoConnections.includes('Bank account') ? (
                  <span className="connected-status">
                    <Icon name="check" size={14} /> Added
                  </span>
                ) : (
                  <Icon name="arrow" size={16} />
                )}
              </button>
              <button
                onClick={() =>
                  setDemoConnections((items) =>
                    items.includes('Credit card') ? items : [...items, 'Credit card'],
                  )
                }
              >
                <span className="account-icon peach">
                  <Icon name="debt" />
                </span>
                <span>
                  <strong>Connect a card</strong>
                  <small>Credit card activity</small>
                </span>
                {demoConnections.includes('Credit card') ? (
                  <span className="connected-status">
                    <Icon name="check" size={14} /> Added
                  </span>
                ) : (
                  <Icon name="arrow" size={16} />
                )}
              </button>
            </div>
          </div>
        )}
        <div className="overview-card">
          <div className="mini-label">Estimated net position</div>
          <div className="overview-value">{money(snapshot.netPosition)}</div>
          <p>What you have minus what you owe</p>
          <div className="overview-split">
            <div>
              <span>Cash & savings</span>
              <strong>{money(cash)}</strong>
            </div>
            <div>
              <span>Total debt</span>
              <strong>{money(debtTotal)}</strong>
            </div>
          </div>
        </div>
        <article className="budget-breakdown-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Monthly budget</span>
              <h2>Where the example income goes</h2>
            </div>
            <span className="demo-pill">Estimate</span>
          </div>
          <div className="budget-chart-layout">
            <BudgetDonut finance={finance} />
            <div className="budget-legend">
              <div>
                <i className="budget-dot housing" />
                <span>Housing / mortgage</span>
                <strong>{money(finance.housing)}</strong>
              </div>
              <div>
                <i className="budget-dot everyday" />
                <span>Everyday expenses</span>
                <strong>{money(finance.expenses)}</strong>
              </div>
              <div>
                <i className="budget-dot debt" />
                <span>Loan & debt payments</span>
                <strong>{money(finance.debt)}</strong>
              </div>
              <div>
                <i className="budget-dot room" />
                <span>Money left</span>
                <strong>{money(Math.max(cashFlow, 0))}</strong>
              </div>
            </div>
          </div>
          <div className="budget-explanation">
            <Icon name="info" size={17} />
            <p>
              Other expenses exclude loan and debt payments, so those commitments are not counted
              twice. Edit your example numbers to update this chart.
            </p>
          </div>
        </article>
        <div className="section-row">
          <div>
            <span className="eyebrow">Illustrative accounts</span>
            <h2>Accounts</h2>
          </div>
          <span className="demo-pill">Synthetic</span>
        </div>
        <div className="account-list">
          {snapshot.accounts.length === 0 ? (
            <div className="api-empty-state">No accounts were returned by the API.</div>
          ) : (
            snapshot.accounts.map((account) => {
              const presentation = accountPresentation[account.type]
              const isDebt = account.type === 'credit-card' || account.type === 'loan'
              return (
                <article className="account-card" key={account.id}>
                  <span className={`account-icon ${presentation.tone}`}>
                    <Icon name={presentation.icon} />
                  </span>
                  <div>
                    <strong>{account.name}</strong>
                    <span>
                      {presentation.label}
                      {account.monthlyPayment ? ` · ${money(account.monthlyPayment)}/month` : ''}
                    </span>
                  </div>
                  <strong className={isDebt ? 'debt-value' : ''}>
                    {money(Math.abs(account.balance))}
                  </strong>
                  <Icon name="chevron" size={16} />
                </article>
              )
            })
          )}
        </div>
        <div className="plain-note">
          <Icon name="info" />
          <p>
            Seeing everything together can help you understand how your financial decisions connect.
          </p>
        </div>
        <Button onClick={() => go('ai')} icon="spark">
          Ask Flux About My Finances
        </Button>
      </Page>
    )
  }

  if (screen === 'forecast') {
    return (
      <Page nav={nav}>
        <Header onBack={back} title="Forecast" />
        <SectionTitle
          title="See where your money could go."
          body="Adjust the estimates to explore your next six months."
        />
        <div className="forecast-card">
          <div className="card-heading">
            <span>Projected savings</span>
            <span className="demo-pill">Estimate</span>
          </div>
          <div className="forecast-hero">
            <strong>{money(forecast[6])}</strong>
            <span>Projected in 6 months</span>
          </div>
          <MiniChart values={forecast} large />
          <div className="month-labels">
            <span>Now</span>
            <span>May</span>
            <span>Jun</span>
            <span>Jul</span>
            <span>Aug</span>
            <span>Sep</span>
            <span>Oct</span>
          </div>
        </div>
        <div className="forecast-controls card">
          <CurrencyInput
            label="Monthly savings contribution"
            value={Math.round(contribution)}
            onChange={(value) =>
              updateFinance(
                'expenses',
                Math.max(finance.income - finance.housing - finance.debt - value * 4, 0),
              )
            }
          />
          <CurrencyInput
            label="Estimated other expenses"
            value={finance.expenses}
            onChange={(v) => updateFinance('expenses', v)}
          />
          <CurrencyInput
            label="Additional debt payment"
            value={finance.debt}
            onChange={(v) => updateFinance('debt', v)}
          />
          <label className="field">
            <span className="field-label">Goal timeline</span>
            <select value={timeline} onChange={(e) => setTimeline(e.target.value)}>
              {['Within 3 months', 'Within 6 months', 'Within a year'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="plain-note">
          <Icon name="info" />
          <p>
            Your projected balance uses the estimates you shared and includes one $350 upcoming
            expense in month three.
          </p>
        </div>
        <Button onClick={() => go('simulator')} icon="arrow">
          Try a What-If Scenario
        </Button>
      </Page>
    )
  }

  if (screen === 'compare') {
    const scenarios: {
      name: string
      tag: string
      data: SimulatorData
      note: string
      wait: number
    }[] = [
      {
        name: 'Buy now',
        tag: 'Transportation sooner',
        data: { ...sim },
        note: 'Begin the full estimated car cost this month.',
        wait: 0,
      },
      {
        name: 'Wait 3 months',
        tag: 'More time to prepare',
        data: { ...sim, down: sim.down + contribution * 3 },
        note: `Set aside ${money(contribution)} per month, then use the added savings toward the down payment.`,
        wait: 3,
      },
      {
        name: 'Choose a lower-cost car',
        tag: 'Lower commitment',
        data: { ...sim, price: Math.max(sim.price - 3000, 5000) },
        note: 'Keep the same timing and down payment, but borrow less.',
        wait: 0,
      },
    ]
    return (
      <Page>
        <Header onBack={back} title="Compare options" />
        <ApiStatus
          loading={scenarioLoading}
          error={scenarioError}
          source={dataSource}
          onRetry={() => setSim((current) => ({ ...current }))}
        />
        <SectionTitle
          eyebrow="What if I wait?"
          title="One goal. Three different ripples."
          body="Compare how timing and price could affect your whole financial picture—not only the loan."
        />
        <div className="compare-legend">
          <span>
            <i className="legend-dot cash" /> Money left
          </span>
          <span>
            <i className="legend-dot safety" /> Emergency savings
          </span>
          <span>
            <i className="legend-dot debt" /> Bills and debt
          </span>
          <span>
            <i className="legend-dot goal" /> Goal progress
          </span>
        </div>
        <div className="compare-list">
          {comparisonResults.length === 0 && !scenarioLoading ? (
            <div className="api-empty-state">
              <strong>No scenario comparison is available.</strong>
              <span>Adjust the simulator inputs or retry the calculation.</span>
              <button onClick={() => setSim((current) => ({ ...current }))}>Retry</button>
            </div>
          ) : (
            scenarios.map((scenario, i) => {
              const comparison = comparisonResults[i]
              if (!comparison) return null
              const d = comparison.result
              const scenarioSavings = d.savingsAfterUpfront
              const scenarioRemaining = d.remainingAfter
              const sixMonthSavings =
                Math.max(scenarioSavings, 0) +
                Math.max(scenarioRemaining, 0) * Math.max(6 - scenario.wait, 0)
              return (
                <article
                  className={`compare-card ${i === 1 ? 'featured' : ''}`}
                  key={scenario.name}
                >
                  <div className="compare-top">
                    <span>Option {String.fromCharCode(65 + i)}</span>
                    <span className="demo-pill">{scenario.tag}</span>
                  </div>
                  <h2>{scenario.name}</h2>
                  <p>{scenario.note}</p>
                  <div className="compare-payment">
                    <strong>{money(d.totalMonthly)}</strong>
                    <span>total / month</span>
                  </div>
                  <div className="comparison-ripples">
                    <div>
                      <span>
                        <i className="legend-dot cash" /> Monthly room
                      </span>
                      <strong>{money(scenarioRemaining)}</strong>
                    </div>
                    <div>
                      <span>
                        <i className="legend-dot safety" /> Savings after upfront
                      </span>
                      <strong>{money(Math.max(scenarioSavings, 0))}</strong>
                    </div>
                    <div>
                      <span>
                        <i className="legend-dot debt" /> Loan + current debt
                      </span>
                      <strong>{money(d.payment + finance.debt)}/mo</strong>
                    </div>
                    <div>
                      <span>
                        <i className="legend-dot goal" /> 6-month savings
                      </span>
                      <strong>{money(sixMonthSavings)}</strong>
                    </div>
                  </div>
                  <details className="assumption">
                    <summary>View assumptions</summary>
                    <ul>
                      <li>Car price: {money(scenario.data.price)}</li>
                      <li>
                        APR: {scenario.data.apr}% and term: {scenario.data.term} months
                      </li>
                      <li>Current down payment: {money(sim.down)}</li>
                      {scenario.wait > 0 && (
                        <>
                          <li>Monthly savings while waiting: {money(contribution)}</li>
                          <li>Additional savings after 3 months: {money(contribution * 3)}</li>
                          <li>Car price and APR assumed unchanged</li>
                          <li>Down payment includes the additional savings</li>
                        </>
                      )}
                      {i === 2 && <li>Lower-cost car uses the same down payment</li>}
                      <li>No unexpected costs or price changes are included</li>
                    </ul>
                  </details>
                  <div className="dual-actions">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSim(comparison.input)
                        showToast(`${scenario.name} selected`)
                        go('simulator')
                      }}
                    >
                      {i === 2 ? 'Explore Cheaper Options' : 'Review This Path'}
                    </Button>
                    <Button variant="ghost" onClick={() => go('ai')}>
                      Ask Flux to Explain
                    </Button>
                  </div>
                </article>
              )
            })
          )}
        </div>
        <div className="insight-card">
          <div className="insight-icon">
            <Icon name="spark" />
          </div>
          <div>
            <strong>No single right choice</strong>
            <p>
              The best option depends on what you want to prioritize and the room you want to keep
              in your budget.
            </p>
          </div>
        </div>
      </Page>
    )
  }

  if (screen === 'next') {
    const steps = [
      [
        'Review your monthly car budget',
        'See how the total cost fits beside your other priorities.',
        'simulator',
      ],
      [
        'Set aside an amount for upfront costs',
        `Try a manageable monthly contribution toward your ${money(4000)} target.`,
        'forecast',
      ],
      [
        'Compare two or three car options',
        'Look at total cost, interest, and monthly impact side by side.',
        'compare',
      ],
    ] as const
    return (
      <Page footer={<Button onClick={() => go('home')}>Back to My Dashboard</Button>}>
        <Header onBack={back} title="Next steps" />
        <SectionTitle
          title="You don’t have to do everything today."
          body="Small, informed steps can still move you forward."
        />
        <div className="step-progress">
          <div>
            <strong>{completed.filter(Boolean).length} of 3</strong>
            <span>steps complete</span>
          </div>
          <div className="goal-progress">
            <div style={{ width: `${(completed.filter(Boolean).length / 3) * 100}%` }} />
          </div>
        </div>
        <div className="next-list">
          {steps.map(([title, text, target], i) => (
            <article className={`next-card ${completed[i] ? 'done' : ''}`} key={title}>
              <button
                className="check-button"
                onClick={() =>
                  setCompleted((items) => items.map((x, index) => (index === i ? !x : x)))
                }
              >
                {completed[i] ? <Icon name="check" /> : <span>{i + 1}</span>}
              </button>
              <div>
                <div className="status">
                  {completed[i] ? 'Completed' : i === 0 ? 'Start here' : 'Up next'}
                </div>
                <h2>{title}</h2>
                <p>{text}</p>
                <Button variant="secondary" onClick={() => go(target)} icon="arrow">
                  Open tool
                </Button>
              </div>
            </article>
          ))}
        </div>
        <div className="insight-card">
          <div className="insight-icon">
            <Icon name="spark" />
          </div>
          <div>
            <strong>That’s meaningful progress</strong>
            <p>You’re taking time to understand your options before making a big decision.</p>
          </div>
        </div>
      </Page>
    )
  }

  if (screen === 'profile') {
    return (
      <Page
        footer={
          <div className="action-stack">
            <Button onClick={() => void saveProfileChanges()} disabled={apiLoading}>
              {apiLoading ? 'Saving Changes…' : 'Save Changes'}
            </Button>
            <Button variant="ghost" onClick={back}>
              Cancel
            </Button>
            <Button variant="ghost" onClick={() => void logout()}>
              {demoMode ? 'Exit Demo' : 'Log Out'}
            </Button>
          </div>
        }
      >
        <Header onBack={back} title="Edit profile" />
        <ApiStatus
          loading={apiLoading}
          error={apiError}
          source={dataSource}
          onRetry={() => void saveProfileChanges()}
        />
        <SectionTitle
          title="Your goal and preferences"
          body="Changes update your dashboard, forecast, and simulator."
        />
        <div className="profile-section card">
          <div className="section-row simple">
            <h2>Goal</h2>
            <span className="card-icon">
              <Icon name="car" />
            </span>
          </div>
          <label className="field">
            <span className="field-label">Current goal</span>
            <input
              value={goal === 'Buy my first car' ? 'Get a reliable car' : goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">Timeline</span>
            <select value={timeline} onChange={(e) => setTimeline(e.target.value)}>
              {[
                'As soon as possible',
                'Within 3 months',
                'Within 6 months',
                'Within a year',
                "I'm just exploring",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="profile-section card">
          <h2>Financial information</h2>
          <CurrencyInput
            label="Monthly take-home income"
            value={finance.income}
            onChange={(v) => updateFinance('income', v)}
          />
          <CurrencyInput
            label="Housing costs"
            value={finance.housing}
            onChange={(v) => updateFinance('housing', v)}
          />
          <CurrencyInput
            label="Other monthly expenses (excluding debt)"
            value={finance.expenses}
            onChange={(v) => updateFinance('expenses', v)}
          />
          <CurrencyInput
            label="Current savings"
            value={finance.savings}
            onChange={(v) => updateFinance('savings', v)}
          />
          <CurrencyInput
            label="Debt payments"
            value={finance.debt}
            onChange={(v) => updateFinance('debt', v)}
          />
        </div>
        <div className="profile-section card">
          <h2>Preferences</h2>
          <label className="field">
            <span className="field-label">Guidance style</span>
            <select value={guidance} onChange={(e) => setGuidance(e.target.value)}>
              {[
                'Give me small, manageable steps.',
                'Help me understand my options.',
                'Show me a clear plan.',
                'Help me compare different choices.',
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Main concern</span>
            <select value={concern} onChange={(e) => setConcern(e.target.value)}>
              {[
                'Having a payment I can comfortably afford.',
                'Understanding the total cost.',
                'Unexpected expenses.',
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        </div>
      </Page>
    )
  }

  return null
}

function HealthCard({
  icon,
  tone,
  label,
  value,
  status,
  onClick,
}: {
  icon: string
  tone: string
  label: string
  value: string
  status: string
  onClick: () => void
}) {
  return (
    <button className={`health-card ${tone}`} onClick={onClick}>
      <span className="health-icon">
        <Icon name={icon} />
      </span>
      <span className="health-label">{label}</span>
      <strong>{value}</strong>
      <span className="health-status">{status}</span>
      <Icon name="chevron" size={15} />
    </button>
  )
}

function MiniChart({ values, large = false }: { values: number[]; large?: boolean }) {
  const min = Math.min(...values) * 0.96
  const max = Math.max(...values) * 1.04
  const points = values
    .map(
      (v, i) =>
        `${i * (300 / (values.length - 1))},${105 - ((v - min) / Math.max(max - min, 1)) * 85}`,
    )
    .join(' ')
  const area = `0,110 ${points} 300,110`
  return (
    <div className={`mini-chart ${large ? 'large' : ''}`}>
      <svg viewBox="0 0 300 115" preserveAspectRatio="none">
        <defs>
          <linearGradient id={large ? 'chartFillLarge' : 'chartFill'} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7AA88B" stopOpacity=".32" />
            <stop offset="100%" stopColor="#7AA88B" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill={`url(#${large ? 'chartFillLarge' : 'chartFill'})`} />
        <polyline
          points={points}
          fill="none"
          stroke="#345B46"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {values.map((v, i) => (
          <circle
            key={i}
            cx={i * (300 / (values.length - 1))}
            cy={105 - ((v - min) / Math.max(max - min, 1)) * 85}
            r={i === values.length - 1 ? 4 : 2.5}
            fill="#FAF8F3"
            stroke="#345B46"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  )
}

function BudgetDonut({ finance }: { finance: FinanceProfile }) {
  const left = Math.max(finance.income - finance.housing - finance.expenses - finance.debt, 0)
  const total = Math.max(finance.housing + finance.expenses + finance.debt + left, 1)
  const segments = [
    { value: finance.housing, color: '#345B46' },
    { value: finance.expenses, color: '#7AA88B' },
    { value: finance.debt, color: '#D49B7D' },
    { value: left, color: '#DCE9DF' },
  ]
  let offset = 0
  return (
    <div className="budget-donut">
      <svg viewBox="0 0 120 120" role="img" aria-label="Monthly budget breakdown">
        <circle cx="60" cy="60" r="46" fill="none" stroke="#EEECE5" strokeWidth="16" />
        {segments.map((segment, index) => {
          const percent = (segment.value / total) * 100
          const circle = (
            <circle
              key={index}
              cx="60"
              cy="60"
              r="46"
              fill="none"
              stroke={segment.color}
              strokeWidth="16"
              pathLength="100"
              strokeDasharray={`${percent} ${100 - percent}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 60 60)"
            />
          )
          offset += percent
          return circle
        })}
      </svg>
      <span>
        <strong>{money(finance.income)}</strong>
        <small>monthly income</small>
      </span>
    </div>
  )
}

export default App
