import { useSyncExternalStore } from 'react'
import { api, onUnauthorized } from './api'

/**
 * Who is signed in, according to the server. Nothing is cached in
 * localStorage: an admin session should not outlive the server's opinion of it
 * even for the length of a paint.
 *
 * status: checking → anonymous | totp (password given, code pending) | ready
 */
let state = { status: 'checking', admin: null }
const listeners = new Set()
const set = (next) => {
  state = next
  for (const fn of listeners) fn()
}

export async function refresh() {
  try {
    const admin = await api.get('/me')
    set({ status: admin.mfa ? 'ready' : 'totp', admin })
  } catch {
    set({ status: 'anonymous', admin: null })
  }
}

export async function signIn(email, password) {
  await api.post('/auth/login', { email, password })
  set({ status: 'totp', admin: null })
}

export async function confirmCode(code) {
  await api.post('/auth/totp', { code })
  await refresh()
}

export async function signOut() {
  await api.post('/auth/logout').catch(() => {})
  set({ status: 'anonymous', admin: null })
}

onUnauthorized(() => state.status === 'ready' && set({ status: 'anonymous', admin: null }))
refresh()

export function useSession() {
  return useSyncExternalStore(
    (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    () => state,
  )
}

/** read_only can look at everything and change nothing. */
export const canWrite = (admin) => admin?.role === 'owner' || admin?.role === 'support'
export const isOwner = (admin) => admin?.role === 'owner'
