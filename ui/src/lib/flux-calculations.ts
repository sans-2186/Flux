export type FinancialProfileValues = {
  income: number
  housing: number
  expenses: number
  savings: number
  debt: number
}

export type ScenarioAssumptions = {
  price: number
  down: number
  term: number
  apr: number
  insurance: number
  running: number
  fees: number
  purchaseTiming: 'now' | 'wait-3-months'
}

export type ScenarioResultValues = {
  payment: number
  interest: number
  totalRepayment: number
  totalMonthly: number
  upfront: number
  cashFlowBefore: number
  remainingAfter: number
  savingsAfterUpfront: number
}

export function calculateScenario(
  assumptions: ScenarioAssumptions,
  profile: FinancialProfileValues,
): ScenarioResultValues {
  const principal = Math.max(assumptions.price - assumptions.down, 0)
  const monthlyRate = assumptions.apr / 100 / 12
  const payment =
    monthlyRate === 0
      ? principal / assumptions.term
      : (principal * monthlyRate * Math.pow(1 + monthlyRate, assumptions.term)) /
        (Math.pow(1 + monthlyRate, assumptions.term) - 1)
  const totalRepayment = payment * assumptions.term
  const cashFlowBefore = profile.income - profile.housing - profile.expenses - profile.debt
  const totalMonthly = payment + assumptions.insurance + assumptions.running
  const upfront = assumptions.down + assumptions.fees
  const monthlyContribution = Math.max(Math.min(cashFlowBefore * 0.25, 250), 0)
  const availableSavings =
    profile.savings + (assumptions.purchaseTiming === 'wait-3-months' ? monthlyContribution * 3 : 0)

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
