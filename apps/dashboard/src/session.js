import { useSyncExternalStore } from 'react'
import { api } from './api'

/**
 * Who is signed in, according to the server.
 *
 * The session itself is an httpOnly cookie the browser can't read, so this
 * holds only the profile `/staff/me` returns. `status` matters: 'checking'
 * means we haven't asked yet, and rendering the sign-in screen during that
 * moment would bounce a signed-in user out on every refresh.
 */

let state = { status: 'checking', user: null }
const listeners = new Set()

const set = (next) => {
  state = next
  for (const listener of listeners) listener()
}

const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Ask the server who we are. Called once at startup, and after signing in. */
export async function refresh() {
  try {
    const user = await api.get('/staff/me')
    set({ status: 'authenticated', user })
    return user
  } catch {
    set({ status: 'anonymous', user: null })
    return null
  }
}

export async function signIn({ email, password }) {
  await api.post('/staff/login', { email, password })
  return refresh()
}

export async function registerVenue(payload) {
  await api.post('/staff/register', payload)
  return refresh()
}

export async function signOut() {
  await api.post('/staff/logout', {}).catch(() => {})
  set({ status: 'anonymous', user: null })
}

refresh()

export function useSession() {
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  )
  return { ...current, signIn, signOut, registerVenue, refresh }
}
