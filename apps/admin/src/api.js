/**
 * The API client. Every call carries `x-chqin-admin: 1` — the API refuses
 * /admin without it, which is what stops a sibling site from posting there
 * with our cookie — and `credentials: 'include'` for the httpOnly session.
 */

export const API_BASE = import.meta.env.VITE_API_URL ?? `http://${location.hostname}:8787`

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message)
    this.code = code
    this.status = status
  }
}

const listeners = new Set()
/** Told when any call comes back 401, so the shell can drop to sign-in. */
export const onUnauthorized = (fn) => (listeners.add(fn), () => listeners.delete(fn))

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(`${API_BASE}/admin${path}`, {
      ...options,
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-chqin-admin': '1', ...options.headers },
    })
  } catch {
    throw new ApiError('offline', `Can't reach the API at ${API_BASE}.`, 0)
  }
  if (options.raw && response.ok) return response
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 401) for (const fn of listeners) fn(data.error)
    throw new ApiError(data.error ?? 'error', data.message ?? 'Something went wrong.', response.status)
  }
  return data
}

/** `?a=1&b=2`, skipping empty values. */
export const qs = (params = {}) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  return entries.length ? `?${new URLSearchParams(entries)}` : ''
}

export const api = {
  get: (path, params) => request(path + qs(params)),
  post: (path, body = {}) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  /** Downloads a CSV through the same guarded request, then saves it. */
  download: async (path, params, filename) => {
    const response = await request(path + qs(params), { raw: true })
    const url = URL.createObjectURL(await response.blob())
    const a = Object.assign(document.createElement('a'), { href: url, download: filename })
    a.click()
    URL.revokeObjectURL(url)
  },
}
