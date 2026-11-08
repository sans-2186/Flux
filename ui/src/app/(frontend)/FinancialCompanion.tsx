'use client'

import {
  FormEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  useRef,
  useState,
} from 'react'
import {
  calculateMockScenario,
  type FinancialProfile,
  type FinancialSnapshot,
  type ScenarioInput,
} from './flux-api-client'
import { askCoach } from './flux-backend'

const fluxLogo = '/flux-logo.png'
const carImage = '/toyota-corolla.jpg'

const money = (value: number, digits = 0) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: digits,
  }).format(value || 0)

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    spark: <path d="M12 3v4M12 17v4M4.9 6.5l2.8 2.8M16.3 14.7l2.8 2.8M3 12h4M17 12h4M4.9 17.5l2.8-2.8M16.3 9.3l2.8-2.8" />,
    leaf: (
      <>
        <path d="M5 19c8 0 12-7 12-14-7 0-14 4-14 12Z" />
        <path d="M5 19c3-3 6-6 9-7" />
      </>
    ),
    chart: (
      <>
        <path d="M4 19h16" />
        <path d="M7 16V9M12 16V5M17 16v-5" />
      </>
    ),
    back: <path d="M14 6 8 12l6 6" />,
    chevron: <path d="M8 10l4 4 4-4" />,
    send: <path d="M4 12 20 4l-6 16-2-6-6-2Z" />,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths[name] || paths.spark}
    </svg>
  )
}

type VehicleOption = {
  name: string
  price: number
  label: string
  mileage: string
  color: string
}

const VEHICLES: VehicleOption[] = [
  {
    name: '2026 Toyota Corolla LE',
    price: 24500,
    label: 'Current listing',
    mileage: '8 miles',
    color: 'Ice Cap',
  },
  {
    name: '2025 Toyota Corolla L',
    price: 21900,
    label: 'Lower-price match',
    mileage: '4,210 miles',
    color: 'Classic Silver',
  },
  {
    name: '2026 Toyota Camry SE',
    price: 28900,
    label: 'Higher-price match',
    mileage: '12 miles',
    color: 'Wind Chill Pearl',
  },
]

export function FinancialCompanion({
  finance,
  snapshot,
  baseScenario,
  startVehicleIndex = 1,
  onClose,
  onApplyScenario,
}: {
  finance: FinancialProfile
  snapshot: FinancialSnapshot
  baseScenario: ScenarioInput
  /** 1 = cheaper option (default when arriving from Compare → Explore cheaper). */
  startVehicleIndex?: number
  onClose: () => void
  onApplyScenario?: (scenario: ScenarioInput) => void
}) {
  const [vehicleIndex, setVehicleIndex] = useState(
    Math.min(Math.max(startVehicleIndex, 0), VEHICLES.length - 1),
  )
  const [collapsed, setCollapsed] = useState(false)
  const [mobileSheetExpanded, setMobileSheetExpanded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [snapshotExpanded, setSnapshotExpanded] = useState(true)
  const [breakdownExpanded, setBreakdownExpanded] = useState(false)
  const [companionChatOpen, setCompanionChatOpen] = useState(true)
  const [companionChatInput, setCompanionChatInput] = useState('')
  const [companionChat, setCompanionChat] = useState<{ from: 'ai' | 'user'; text: string; pending?: boolean }[]>([])
  const [chatBusy, setChatBusy] = useState(false)
  const [assumptions, setAssumptions] = useState({
    down: baseScenario.down,
    apr: baseScenario.apr,
    term: baseScenario.term,
    insurance: baseScenario.insurance,
    running: baseScenario.running,
    fees: baseScenario.fees,
  })
  const companionPanelRef = useRef<HTMLElement>(null)
  const sheetDragRef = useRef<{
    startY: number
    startHeight: number
    currentHeight: number
    moved: boolean
  } | null>(null)

  const vehicle = VEHICLES[vehicleIndex]
  const scenario: ScenarioInput = {
    ...baseScenario,
    price: vehicle.price,
    down: assumptions.down,
    apr: assumptions.apr,
    term: assumptions.term,
    insurance: assumptions.insurance,
    running: assumptions.running,
    fees: assumptions.fees,
    profile: finance,
  }
  const estimate = calculateMockScenario(scenario)
  const availableBeforeCar = finance.income - finance.housing - finance.expenses - finance.debt
  const remainingMonthly = availableBeforeCar - estimate.totalMonthly
  const savingsRemaining = Math.max(finance.savings - estimate.upfront, 0)
  const essentialMonthly = finance.housing + finance.expenses + finance.debt
  const cushionMonths = essentialMonthly ? savingsRemaining / essentialMonthly : 0
  const fuel = Math.min(105, assumptions.running)
  const maintenance = Math.max(assumptions.running - fuel, 0)
  const cheaperDelta = Math.max(
    estimate.totalMonthly -
      calculateMockScenario({ ...scenario, price: VEHICLES[1].price }).totalMonthly,
    0,
  )
  const higherDelta = Math.max(
    calculateMockScenario({ ...scenario, price: VEHICLES[2].price }).totalMonthly -
      estimate.totalMonthly,
    0,
  )

  const selectVehicle = (index: number) => {
    setVehicleIndex(index)
    setSnapshotExpanded(true)
    const next = {
      ...scenario,
      price: VEHICLES[index].price,
    }
    onApplyScenario?.(next)
  }

  const carContext = () =>
    `(Shopping companion: looking at ${vehicle.name} priced ${money(vehicle.price)}. ` +
    `Loan assumptions: down ${money(assumptions.down)}, ${assumptions.term} mo at ${assumptions.apr}% APR, ` +
    `insurance ${money(assumptions.insurance)}/mo, fuel+maintenance ${money(assumptions.running)}/mo. ` +
    `Estimated payment ${money(estimate.payment)}, total monthly car cost ${money(estimate.totalMonthly)}, ` +
    `monthly room after car ${money(remainingMonthly)}, savings after upfront ${money(savingsRemaining)}. ` +
    `Checking ${money(snapshot.accounts.find((a) => a.type === 'checking')?.balance ?? 0)}, ` +
    `savings ${money(finance.savings)}. Guide loan options and purchase impact only with tool numbers.)`

  const sendCompanionMessage = async (question: string) => {
    const prompt = question.trim()
    if (!prompt || chatBusy) return
    setCompanionChatOpen(true)
    setCompanionChatInput('')
    setChatBusy(true)
    const id = companionChat.length
    setCompanionChat((messages) => [
      ...messages,
      { from: 'user', text: prompt },
      { from: 'ai', text: 'Flux is thinking…', pending: true },
    ])
    let text: string
    try {
      const answer = await askCoach(`${prompt}\n\n${carContext()}`, finance, snapshot)
      text = answer.reply
    } catch {
      text =
        `This ${vehicle.name} is estimated at ${money(estimate.totalMonthly)}/mo including payment, insurance, fuel, and maintenance. ` +
        `That could leave about ${money(remainingMonthly)} after the recurring expenses in your profile. ` +
        `Not financial advice — just education to help you decide.`
      if (prompt.toLowerCase().includes('cheaper')) {
        text = `The lower-price Corolla cuts the estimated total by about ${money(cheaperDelta)}/mo versus the current listing. Pick “Explore cheaper” to refresh the snapshot.`
      } else if (prompt.toLowerCase().includes('wait')) {
        text = `Waiting three months and setting aside about ${money(Math.min(Math.max(availableBeforeCar * 0.25, 0), 250))}/mo could grow your down payment, though price and rate may change.`
      } else if (prompt.toLowerCase().includes('afford')) {
        text = `I can’t decide affordability for you. This estimate uses ${money(estimate.totalMonthly)} of your ${money(availableBeforeCar)} monthly room before other spending.`
      }
    }
    setCompanionChat((messages) =>
      messages.map((message, index) =>
        index === id + 1 ? { from: 'ai', text } : message,
      ),
    )
    setChatBusy(false)
  }

  const submitCompanionChat = (event: FormEvent) => {
    event.preventDefault()
    void sendCompanionMessage(companionChatInput)
  }

  const toggleCompanionPanel = () => {
    if (window.matchMedia('(max-width: 900px)').matches) {
      setMobileSheetExpanded((value) => !value)
      return
    }
    setCollapsed((value) => !value)
  }

  const startSheetDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const panel = companionPanelRef.current
    if (!panel || !window.matchMedia('(max-width: 900px)').matches) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const startHeight = panel.getBoundingClientRect().height
    sheetDragRef.current = {
      startY: event.clientY,
      startHeight,
      currentHeight: startHeight,
      moved: false,
    }
    panel.classList.add('dragging')
  }

  const moveSheetDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const panel = companionPanelRef.current
    const drag = sheetDragRef.current
    if (!panel || !drag) return
    const delta = drag.startY - event.clientY
    const nextHeight = Math.min(
      window.innerHeight * 0.92,
      Math.max(window.innerHeight * 0.2, drag.startHeight + delta),
    )
    drag.currentHeight = nextHeight
    drag.moved = drag.moved || Math.abs(delta) > 5
    panel.style.height = `${nextHeight}px`
  }

  const finishSheetDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const panel = companionPanelRef.current
    const drag = sheetDragRef.current
    if (!panel || !drag) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const shouldExpand = drag.moved
      ? drag.currentHeight > window.innerHeight * 0.45
      : !mobileSheetExpanded
    panel.style.height = ''
    panel.classList.remove('dragging')
    sheetDragRef.current = null
    setMobileSheetExpanded(shouldExpand)
  }

  return (
    <div
      className={`shopping-extension-host companion-only ${collapsed ? 'companion-collapsed' : ''} ${
        mobileSheetExpanded ? 'mobile-sheet-expanded' : ''
      }`}
    >
      <div className="companion-page-bar">
        <strong>Flux shopping companion</strong>
        <button type="button" onClick={onClose}>
          ← Back to compare
        </button>
      </div>

      <aside
        ref={companionPanelRef}
        className="financial-companion-panel"
        aria-label="Flux Financial Companion"
      >
        <button
          className="companion-drag-handle"
          aria-label={
            mobileSheetExpanded ? 'Collapse financial summary' : 'Expand financial details'
          }
          onPointerDown={startSheetDrag}
          onPointerMove={moveSheetDrag}
          onPointerUp={finishSheetDrag}
          onPointerCancel={finishSheetDrag}
        >
          <span />
        </button>
        <header className="companion-panel-header">
          <div className="companion-panel-brand">
            <span>
              <img src={fluxLogo} alt="" />
            </span>
            <div>
              <strong>Financial Companion</strong>
              <small>
                <i /> Analyzing this car
              </small>
            </div>
          </div>
          <div className="companion-panel-controls">
            <button
              onClick={toggleCompanionPanel}
              aria-label="Toggle Financial Companion"
              title={collapsed ? 'Expand panel' : 'Collapse panel'}
            >
              <Icon name={collapsed ? 'back' : 'chevron'} size={17} />
            </button>
            <button
              onClick={() => setMenuOpen((value) => !value)}
              aria-label="Open companion menu"
              aria-expanded={menuOpen}
            >
              <span className="companion-more">•••</span>
            </button>
          </div>
          {menuOpen && !collapsed && (
            <div className="companion-menu">
              <button onClick={() => setBreakdownExpanded(true)}>Edit assumptions</button>
              <button onClick={() => setCompanionChatOpen(true)}>Open AI chat</button>
              <button onClick={onClose}>Close companion</button>
            </div>
          )}
        </header>

        {!collapsed && (
          <section className="mobile-companion-summary" aria-label="Financial snapshot summary">
            <div>
              <span>{vehicle.name}</span>
              <strong>
                {money(estimate.totalMonthly)}
                <small>/month estimated</small>
              </strong>
            </div>
            <div>
              <span>Remaining</span>
              <strong>{money(remainingMonthly)}</strong>
            </div>
          </section>
        )}

        {!collapsed && (
          <div className="companion-scroll">
            <section className="companion-vehicle-card">
              <img src={carImage} alt="" />
              <div>
                <span>{vehicle.label}</span>
                <strong>{vehicle.name}</strong>
                <b>{money(vehicle.price)}</b>
                <small>
                  <i /> Demo listing · not a live dealer site
                </small>
              </div>
            </section>

            <section className="companion-section companion-snapshot">
              <button
                className="companion-section-heading"
                onClick={() => setSnapshotExpanded((value) => !value)}
                aria-expanded={snapshotExpanded}
              >
                <span>
                  <small>Financial snapshot</small>
                  <strong>How this car could affect your finances</strong>
                </span>
                <Icon name="chevron" size={17} />
              </button>
              {snapshotExpanded && (
                <>
                  <div className="companion-primary-metric">
                    <span>Total estimated monthly car cost</span>
                    <strong>{money(estimate.totalMonthly)}</strong>
                    <small>Payment + insurance + fuel + maintenance</small>
                  </div>
                  <div className="companion-metric-grid">
                    <div>
                      <span>Car payment</span>
                      <strong>{money(estimate.payment)}</strong>
                    </div>
                    <div>
                      <span>Insurance</span>
                      <strong>{money(assumptions.insurance)}</strong>
                    </div>
                    <div>
                      <span>Fuel + maintenance</span>
                      <strong>{money(assumptions.running)}</strong>
                    </div>
                    <div className="accent">
                      <span>Monthly money remaining</span>
                      <strong>{money(remainingMonthly)}</strong>
                    </div>
                    <div>
                      <span>Savings after purchase</span>
                      <strong>{money(savingsRemaining)}</strong>
                    </div>
                    <div>
                      <span>Emergency cushion</span>
                      <strong>{cushionMonths.toFixed(1)} months</strong>
                    </div>
                  </div>
                  <div className="companion-ai-insight">
                    <Icon name="spark" size={17} />
                    <p>
                      This estimate uses your Flux profile (income {money(finance.income)}, housing{' '}
                      {money(finance.housing)}). Ask Flux below about loan tradeoffs or a cheaper
                      option.
                    </p>
                  </div>
                  <p className="companion-estimate-note">
                    Illustrative estimates only—not guaranteed loan terms or financial advice.
                  </p>
                </>
              )}
            </section>

            <section className="companion-section companion-options">
              <div className="companion-copy-heading">
                <span>Want to explore other options?</span>
                <small>The snapshot updates when you choose.</small>
              </div>
              <button
                className={vehicleIndex === 1 ? 'selected' : ''}
                onClick={() => selectVehicle(1)}
              >
                <span className="companion-option-icon cheaper">
                  <Icon name="leaf" size={18} />
                </span>
                <span>
                  <strong>Explore a cheaper car</strong>
                  <small>
                    {vehicleIndex === 1
                      ? 'Showing the lower-price match'
                      : `Save about ${money(cheaperDelta)}/month`}
                  </small>
                </span>
                <b>Explore cheaper</b>
              </button>
              <button
                className={vehicleIndex === 2 ? 'selected' : ''}
                onClick={() => selectVehicle(2)}
              >
                <span className="companion-option-icon higher">
                  <Icon name="chart" size={18} />
                </span>
                <span>
                  <strong>Explore a more expensive car</strong>
                  <small>
                    {vehicleIndex === 2
                      ? 'Showing the higher-price match'
                      : `Costs about ${money(higherDelta)} more/month`}
                  </small>
                </span>
                <b>Explore higher</b>
              </button>
              <button
                className={vehicleIndex === 0 ? 'selected' : ''}
                onClick={() => selectVehicle(0)}
              >
                <span className="companion-option-icon cheaper">
                  <Icon name="spark" size={18} />
                </span>
                <span>
                  <strong>Back to current listing</strong>
                  <small>{VEHICLES[0].name}</small>
                </span>
                <b>Current</b>
              </button>
            </section>

            <section className="companion-section companion-breakdown">
              <button
                className="companion-section-heading"
                onClick={() => setBreakdownExpanded((value) => !value)}
                aria-expanded={breakdownExpanded}
              >
                <span>
                  <small>Assumptions &amp; details</small>
                  <strong>View full financial breakdown</strong>
                </span>
                <Icon name="chevron" size={17} />
              </button>
              {breakdownExpanded && (
                <div className="companion-breakdown-content">
                  <dl>
                    <div>
                      <dt>Vehicle price</dt>
                      <dd>{money(vehicle.price)}</dd>
                    </div>
                    <div>
                      <dt>Estimated loan amount</dt>
                      <dd>{money(Math.max(vehicle.price - assumptions.down, 0))}</dd>
                    </div>
                    <div>
                      <dt>Estimated monthly payment</dt>
                      <dd>{money(estimate.payment)}</dd>
                    </div>
                    <div>
                      <dt>Estimated insurance</dt>
                      <dd>{money(assumptions.insurance)}</dd>
                    </div>
                    <div>
                      <dt>Fuel and maintenance</dt>
                      <dd>
                        {money(fuel)} + {money(maintenance)}
                      </dd>
                    </div>
                    <div>
                      <dt>Total monthly cost</dt>
                      <dd>{money(estimate.totalMonthly)}</dd>
                    </div>
                    <div>
                      <dt>Remaining monthly cash flow</dt>
                      <dd>{money(remainingMonthly)}</dd>
                    </div>
                    <div>
                      <dt>Savings impact</dt>
                      <dd>−{money(estimate.upfront)}</dd>
                    </div>
                  </dl>
                  <div className="companion-assumption-fields">
                    {(
                      [
                        ['down', 'Down payment', 0],
                        ['apr', 'APR %', 0.1],
                        ['term', 'Term (months)', 1],
                        ['insurance', 'Insurance / month', 0],
                        ['running', 'Fuel + maintenance', 0],
                        ['fees', 'Fees', 0],
                      ] as const
                    ).map(([key, label, step]) => (
                      <label key={key}>
                        {label}
                        <input
                          type="number"
                          min={key === 'term' ? 12 : 0}
                          step={step}
                          value={assumptions[key]}
                          onChange={(event) =>
                            setAssumptions((values) => ({
                              ...values,
                              [key]: Number(event.target.value),
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <p>
                    Assumptions use a fixed-rate estimate and your Flux profile. Taxes, dealer
                    charges, rate changes, and unexpected costs may change the result.
                  </p>
                </div>
              )}
            </section>

            <section
              className={`companion-section companion-chat ${companionChatOpen ? 'open' : ''}`}
            >
              <div className="companion-chat-heading">
                <span className="companion-chat-avatar">
                  <Icon name="spark" size={16} />
                </span>
                <p>Ask Flux how this car fits your loan options and monthly picture.</p>
                {!companionChatOpen && (
                  <button onClick={() => setCompanionChatOpen(true)}>Open chat</button>
                )}
              </div>
              {companionChatOpen && (
                <>
                  {companionChat.length > 0 && (
                    <div className="companion-chat-thread">
                      {companionChat.map((message, index) => (
                        <p key={`${message.from}-${index}`} className={message.from}>
                          {message.text}
                        </p>
                      ))}
                    </div>
                  )}
                  <div className="companion-question-chips">
                    {[
                      'Can I afford this car?',
                      'What if I wait 3 months?',
                      'Show me a cheaper option',
                      'How does this loan change my budget?',
                    ].map((question) => (
                      <button
                        key={question}
                        type="button"
                        disabled={chatBusy}
                        onClick={() => void sendCompanionMessage(question)}
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                  <form onSubmit={submitCompanionChat}>
                    <input
                      value={companionChatInput}
                      onChange={(event) => setCompanionChatInput(event.target.value)}
                      placeholder="Ask Flux about this car…"
                      aria-label="Ask Flux about this car"
                      disabled={chatBusy}
                    />
                    <button aria-label="Send message" disabled={chatBusy}>
                      <Icon name="send" size={17} />
                    </button>
                  </form>
                </>
              )}
            </section>
          </div>
        )}
      </aside>
    </div>
  )
}
