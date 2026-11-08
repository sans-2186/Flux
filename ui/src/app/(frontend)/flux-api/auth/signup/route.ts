import config from '@payload-config'
import { getPayload } from 'payload'
import { appAuth } from '@/lib/app-auth'
import { jsonError } from '@/lib/flux-server'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      fullName?: unknown
      email?: unknown
      password?: unknown
      confirmPassword?: unknown
    }
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (fullName.length < 2 || fullName.length > 120) {
      throw new Error('Enter your full name.')
    }
    if (!emailPattern.test(email)) throw new Error('Enter a valid email address.')
    if (password.length < 8) throw new Error('Use at least 8 characters for your password.')
    if (password !== body.confirmPassword) throw new Error('Passwords do not match.')

    const payload = await getPayload({ config })
    const created = await payload.create({
      collection: 'users',
      data: { email, fullName, onboardingStep: 'overview', password },
      overrideAccess: false,
    })
    const appUser = { ...created, collection: 'users' as const }
    await payload.create({
      collection: 'flux-profiles',
      data: {
        owner: created.id,
        name: fullName,
        profileKey: `user-${created.id}`,
        isDemo: false,
        income: 0,
        housing: 0,
        expenses: 0,
        savings: 0,
        debt: 0,
        timeline: 'Exploring',
        accounts: [],
        obligations: [],
      },
      overrideAccess: false,
      user: appUser,
    })

    const user = await appAuth.login(email, password)
    return Response.json(
      {
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          onboardingStep: user.onboardingStep,
        },
      },
      { status: 201 },
    )
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Unable to create your Flux account.'
    return jsonError(new Error(message), 400)
  }
}
