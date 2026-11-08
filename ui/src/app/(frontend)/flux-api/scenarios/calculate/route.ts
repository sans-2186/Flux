import {
  calculateForProfile,
  findActiveProfile,
  getPayloadContext,
  jsonError,
  parseScenarioAssumptions,
} from '@/lib/flux-server'

export async function POST(request: Request) {
  try {
    const { demoMode, payload, user } = await getPayloadContext(request)
    const profile = await findActiveProfile(payload, user, demoMode)
    if (!profile) return jsonError(new Error('A financial profile was not found.'), 404)
    const body = (await request.json()) as { assumptions?: unknown }
    const assumptions = parseScenarioAssumptions(body.assumptions)
    return Response.json(calculateForProfile(assumptions, profile))
  } catch (error) {
    return jsonError(error)
  }
}
