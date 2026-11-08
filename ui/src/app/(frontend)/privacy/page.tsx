import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-[430px] bg-[#faf8f3] px-6 py-10 text-[#292d2a]">
      <Link href="/" className="text-sm font-semibold text-[#345b46]">
        Back to Flux
      </Link>
      <h1 className="mt-10 text-3xl font-bold tracking-tight">Privacy Policy</h1>
      <div className="mt-6 space-y-5 text-sm leading-7 text-[#747a74]">
        <p>
          Flux app accounts store your name, email address, onboarding progress, financial profile,
          and saved scenarios in Payload. Passwords are handled by Payload authentication and are
          not displayed in the app.
        </p>
        <p>
          The current prototype does not connect to a real bank or import transaction history. Demo
          mode uses shared mock data and should not be used for private information.
        </p>
        <p>
          Payload Admin accounts are separate from Flux app accounts. Creating a Flux account does
          not grant access to the CMS or admin panel.
        </p>
      </div>
    </main>
  )
}
