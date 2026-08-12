import { useSyncExternalStore } from 'react'

/**
 * Stand-in for a staff session.
 *
 * There is no staff auth on the API yet — no `staff_users`, no memberships, no
 * session cookie — so this is a flag in localStorage that gates the routes.
 * When the real thing lands it replaces this module and nothing else: the
 * screens only ever ask "who is signed in", never "is the token valid".
 *
 * One store shared by every component, not per-component state: the sign-in
 * screen and the router have to agree about who is signed in, and useState in
 * each of them means they don't.
 */

const KEY = 'chqin.dashboard.session'

const read = () => {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

let current = read()
const listeners = new Set()

const emit = () => {
  for (const listener of listeners) listener()
}

const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Signing out in one tab signs out the others.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return
    current = read()
    emit()
  })
}

export function signIn(user) {
  current = { ...user, signedInAt: Date.now() }
  localStorage.setItem(KEY, JSON.stringify(current))
  emit()
  return current
}

export function signOut() {
  current = null
  localStorage.removeItem(KEY)
  emit()
}

export function useSession() {
  const session = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  )
  return { session, signIn, signOut }
}
