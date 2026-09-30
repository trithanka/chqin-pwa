import { useSyncExternalStore } from 'react'
import { api } from './api'

/**
 * Who is signed in, according to the server.
 *
 * Uses stale-while-revalidate with localStorage caching:
 * - Eliminates the "Loading…" flash on app startup.
 * - If the user was previously signed in, the cached profile renders immediately
 *   while `/staff/me` revalidates silently in the background.
 * - If the user is anonymous, the login/landing screen paints with 0ms latency.
 */

const STORAGE_KEY = 'chqin_staff_session'

function getInitialState() {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && parsed.user) {
        return { status: 'authenticated', user: parsed.user }
      }
    }
  } catch {
    // fallback
  }
  return { status: 'anonymous', user: null }
}

let state = getInitialState()
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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, timestamp: Date.now() }))
    } catch {}
    set({ status: 'authenticated', user })
    return user
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {}
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
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
  await api.post('/staff/logout', {}).catch(() => {})
  set({ status: 'anonymous', user: null })
}

// Revalidate in background without blocking initial paint
refresh()

export function useSession() {
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  )
  return { ...current, signIn, signOut, registerVenue, refresh }
}

