import {
  calculateForProfile,
  findActiveProfile,
  getPayloadContext,
  jsonError,
  parseScenarioAssumptions,
} from '@/lib/flux-server'

type ComparisonItem = {
  id?: unknown
  name?: unknown
  input?: unknown
  assumptions?: unknown
}

export async function POST(request: Request) {
  try {
    const { demoMode, payload, user } = await getPayloadContext(request)
    const profile = await findActiveProfile(payload, user, demoMode)
    if (!profile) return jsonError(new Error('A financial profile was not found.'), 404)
    const body = (await request.json()) as { scenarios?: unknown }
    if (!Array.isArray(body.scenarios) || body.scenarios.length === 0) {
      throw new Error('At least one scenario is required.')
    }
    if (body.scenarios.length > 10) {
      throw new Error('A maximum of 10 scenarios can be compared.')
    }
    const results = body.scenarios.map((raw: ComparisonItem, index) => {
      const input = parseScenarioAssumptions(raw.input)
      return {
        id: typeof raw.id === 'string' ? raw.id : `scenario-${index + 1}`,
        name: typeof raw.name === 'string' ? raw.name : `Scenario ${index + 1}`,
        input,
        assumptions: Array.isArray(raw.assumptions)
          ? raw.assumptions.filter((item): item is string => typeof item === 'string')
          : [],
        result: calculateForProfile(input, profile),
      }
    })
    return Response.json(results)
  } catch (error) {
    return jsonError(error)
  }
}
