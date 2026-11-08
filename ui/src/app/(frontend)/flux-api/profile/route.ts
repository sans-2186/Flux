import {
  findActiveProfile,
  getPayloadContext,
  jsonError,
  parseProfilePatch,
  profileResponse,
} from '@/lib/flux-server'

export async function GET(request: Request) {
  const { demoMode, payload, user } = await getPayloadContext(request)
  const profile = await findActiveProfile(payload, user, demoMode)
  if (!profile) return jsonError(new Error('A financial profile was not found.'), 404)
  return Response.json(profileResponse(profile))
}

export async function PATCH(request: Request) {
  try {
    const { demoMode, payload, user } = await getPayloadContext(request)
    const profile = await findActiveProfile(payload, user, demoMode)
    if (!profile) return jsonError(new Error('A financial profile was not found.'), 404)
    const patch = parseProfilePatch(await request.json())
    const accounts = (profile.accounts ?? []).map((account) =>
      account.type === 'savings' && patch.savings != null
        ? { ...account, balance: patch.savings }
        : account,
    )
    const updated = await payload.update({
      collection: 'flux-profiles',
      id: profile.id,
      data: { ...patch, accounts },
      context: demoMode ? { allowFluxDemoAccess: true } : undefined,
      overrideAccess: false,
      user: user ?? undefined,
    })
    return Response.json(profileResponse(updated))
  } catch (error) {
    return jsonError(error)
  }
}
