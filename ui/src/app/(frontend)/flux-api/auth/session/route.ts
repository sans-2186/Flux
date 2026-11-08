import { appAuth } from '@/lib/app-auth'

export async function GET() {
  const user = await appAuth.currentUser()
  if (!user) return Response.json({ authenticated: false })
  return Response.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      onboardingStep: user.onboardingStep,
    },
  })
}
