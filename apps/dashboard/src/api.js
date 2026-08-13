/**
 * The API client.
 *
 * `credentials: 'include'` on every call because the staff session is an
 * httpOnly cookie, and the dashboard (5174) and API (8787) are different
 * origins in dev — without it the cookie is never sent and every read 401s
 * while login looks fine.
 */

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'

/**
 * VITE_API_URL is baked in at build time. Deploying without it leaves the
 * built app calling localhost, where every request fails in a way that looks
 * like the API is down rather than misconfigured — so name it.
 */
const misconfigured =
  typeof location !== 'undefined' &&
  location.protocol === 'https:' &&
  /localhost|127\.0\.0\.1/.test(BASE)

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message)
    this.code = code
    this.status = status
  }
}

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(BASE + path, {
      ...options,
      credentials: 'include',
      headers: { 'content-type': 'application/json', ...options.headers },
    })
  } catch {
    // A dead API and a rejected request are different problems, and the fix
    // for this one is "start the server", so say that.
    throw new ApiError(
      'offline',
      misconfigured
        ? 'This build has no API address. Set VITE_API_URL and redeploy.'
        : "Can't reach the server. Is the API running?",
      0,
    )
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new ApiError(data.error ?? 'error', data.message ?? 'Something went wrong.', response.status)
  }
  return data
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
}
