import {
  calculateForProfile,
  findActiveProfile,
  getPayloadContext,
  jsonError,
  parseScenarioAssumptions,
  scenarioResponse,
} from '@/lib/flux-server'

export async function GET(request: Request) {
  const { demoMode, payload, user } = await getPayloadContext(request)
  const profile = await findActiveProfile(payload, user, demoMode)
  if (!profile) return jsonError(new Error('A financial profile was not found.'), 404)
  const result = await payload.find({
    collection: 'flux-scenarios',
    overrideAccess: false,
    context: demoMode ? { allowFluxDemoAccess: true } : undefined,
    user: user ?? undefined,
    where: {
      profile: { equals: profile.id },
    },
    sort: '-createdAt',
    limit: 20,
  })
  return Response.json(result.docs.map(scenarioResponse))
}

export async function POST(request: Request) {
  try {
    const { demoMode, payload, user } = await getPayloadContext(request)
    const profile = await findActiveProfile(payload, user, demoMode)
    if (!profile) return jsonError(new Error('A financial profile was not found.'), 404)
    const body = (await request.json()) as {
      name?: unknown
      assumptions?: unknown
      goal?: unknown
    }
    const assumptions = parseScenarioAssumptions(body.assumptions)
    const name =
      typeof body.name === 'string' && body.name.trim()
        ? body.name.trim().slice(0, 100)
        : 'Car scenario'
    const goal =
      typeof body.goal === 'string' && body.goal.trim()
        ? body.goal.trim().slice(0, 160)
        : (profile.goal ?? 'General financial planning')
    const created = await payload.create({
      collection: 'flux-scenarios',
      context: demoMode ? { allowFluxDemoAccess: true } : undefined,
      overrideAccess: false,
      user: user ?? undefined,
      data: {
        name,
        profile: profile.id,
        goal,
        assumptions,
        result: calculateForProfile(assumptions, profile),
      },
    })
    return Response.json(scenarioResponse(created), { status: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
