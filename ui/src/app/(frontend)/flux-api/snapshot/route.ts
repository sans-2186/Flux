import {
  findActiveProfile,
  getPayloadContext,
  jsonError,
  snapshotResponse,
} from '@/lib/flux-server'

export async function GET(request: Request) {
  const { demoMode, payload, user } = await getPayloadContext(request)
  const profile = await findActiveProfile(payload, user, demoMode)
  if (!profile) return jsonError(new Error('A financial profile was not found.'), 404)
  return Response.json(snapshotResponse(profile))
}
