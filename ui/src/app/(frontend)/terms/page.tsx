import Link from 'next/link'

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-[430px] bg-[#faf8f3] px-6 py-10 text-[#292d2a]">
      <Link href="/" className="text-sm font-semibold text-[#345b46]">
        Back to Flux
      </Link>
      <h1 className="mt-10 text-3xl font-bold tracking-tight">Terms of Service</h1>
      <div className="mt-6 space-y-5 text-sm leading-7 text-[#747a74]">
        <p>
          Flux is a financial-planning prototype. Its account data, forecasts, scenarios, and
          explanations may be illustrative and are not financial, lending, tax, or legal advice.
        </p>
        <p>
          Review all assumptions before making a financial decision. Flux does not guarantee loan
          approval, rates, savings outcomes, or future account balances.
        </p>
        <p>
          Demo mode does not create a secure account and uses shared mock financial information.
        </p>
      </div>
    </main>
  )
}
