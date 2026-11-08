import 'server-only'

import config from '@payload-config'
import { cookies } from 'next/headers'
import { getPayload } from 'payload'
import type { User } from '@/payload-types'

const APP_SESSION_COOKIE = 'app-session'

export function createAppAuth(collection: 'users') {
  const currentUser = async (): Promise<User | null> => {
    const token = (await cookies()).get(APP_SESSION_COOKIE)?.value
    if (!token) return null

    const payload = await getPayload({ config })
    const authHeaders = new Headers({ Authorization: `JWT ${token}` })
    const { user } = await payload.auth({ headers: authHeaders })
    if (!user || user.collection !== collection) return null
    return user
  }

  const login = async (email: string, password: string) => {
    const payload = await getPayload({ config })
    const result = await payload.login({
      collection,
      data: { email, password },
      overrideAccess: false,
    })
    if (!result.token || !result.user) throw new Error('Unable to establish a Flux session.')

    const maxAge = result.exp ? Math.max(result.exp - Math.floor(Date.now() / 1000), 0) : undefined
    ;(await cookies()).set(APP_SESSION_COOKIE, result.token, {
      httpOnly: true,
      maxAge,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
    return result.user
  }

  const logout = async () => {
    ;(await cookies()).delete(APP_SESSION_COOKIE)
  }

  return { currentUser, login, logout }
}

export const appAuth = createAppAuth('users')
