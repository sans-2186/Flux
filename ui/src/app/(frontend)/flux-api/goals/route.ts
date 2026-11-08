import { getPayloadContext } from '@/lib/flux-server'

export async function GET(request: Request) {
  const { payload, user } = await getPayloadContext(request)
  const result = await payload.find({
    collection: 'flux-goals',
    overrideAccess: false,
    user: user ?? undefined,
    sort: 'sortOrder',
    limit: 100,
  })
  return Response.json(
    result.docs.map((goal) => ({
      id: goal.goalKey,
      label: goal.label,
      targetAmount: goal.targetAmount ?? undefined,
      timeline: goal.timeline ?? undefined,
    })),
  )
}
