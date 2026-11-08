import { appAuth } from '@/lib/app-auth'
import { jsonError } from '@/lib/flux-server'

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: unknown; password?: unknown }
    if (typeof body.email !== 'string' || !body.email.trim()) {
      throw new Error('Enter your email address.')
    }
    if (typeof body.password !== 'string' || !body.password) {
      throw new Error('Enter your password.')
    }
    const user = await appAuth.login(body.email.trim().toLowerCase(), body.password)
    return Response.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        onboardingStep: user.onboardingStep,
      },
    })
  } catch (error) {
    return jsonError(new Error('The email or password is incorrect.'), 401)
  }
}
