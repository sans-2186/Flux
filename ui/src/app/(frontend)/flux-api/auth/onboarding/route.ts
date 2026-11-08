import config from '@payload-config'
import { getPayload } from 'payload'
import { appAuth } from '@/lib/app-auth'
import { jsonError } from '@/lib/flux-server'

const onboardingSteps = ['overview', 'understanding', 'goal', 'insight', 'complete'] as const

export async function PATCH(request: Request) {
  try {
    const user = await appAuth.currentUser()
    if (!user) return jsonError(new Error('Sign in to save onboarding progress.'), 401)
    const body = (await request.json()) as { step?: unknown }
    if (
      typeof body.step !== 'string' ||
      !onboardingSteps.includes(body.step as (typeof onboardingSteps)[number])
    ) {
      throw new Error('A valid onboarding step is required.')
    }
    const payload = await getPayload({ config })
    const updated = await payload.update({
      collection: 'users',
      id: user.id,
      context: { allowFluxOnboardingUpdate: true },
      data: { onboardingStep: body.step as (typeof onboardingSteps)[number] },
      overrideAccess: false,
      user,
    })
    return Response.json({ onboardingStep: updated.onboardingStep })
  } catch (error) {
    return jsonError(error)
  }
}
