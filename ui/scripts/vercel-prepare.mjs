/**
 * Flux ships two ways: locally with the Payload/Figma admin, and on Vercel as the demo-only app.
 * Payload's config needs the Figma platform (FIGMA_EID + content system id) at build time, which CI
 * does not have, so when those are missing we drop the Payload routes and build plain Next.js.
 * The Flux demo flow never calls them — its data comes from the in-browser store and the FastAPI service.
 */
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const uiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const payloadConfigured = Boolean(
  process.env.FIGMA_EID && process.env.FIGMA_CONTENT_API_CONTENT_SYSTEM_ID,
)
const demoOnly = process.env.FLUX_DEMO_ONLY === '1' || !payloadConfigured

if (!demoOnly) {
  console.log('[flux] Payload platform configured — keeping the admin routes.')
  process.exit(0)
}

const removals = ['src/app/(payload)', 'src/app/(frontend)/flux-api']

for (const relative of removals) {
  await rm(path.join(uiRoot, relative), { recursive: true, force: true })
  console.log(`[flux] demo-only build: removed ${relative}`)
}
