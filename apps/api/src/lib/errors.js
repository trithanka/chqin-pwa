/**
 * Every failure the client sees has the same shape: a stable `error` code it
 * can branch on, and a `message` a guest could read without being alarmed.
 */
export class ApiError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

export const notFound = (message = 'Scan the QR code again.') =>
  new ApiError('unknown_session', message, 404)

export const unauthorized = (code, message) => new ApiError(code, message, 401)

export const conflict = (code, message) => new ApiError(code, message, 409)

export const forbidden = (code, message) => new ApiError(code, message, 403)

/** Hono error handler: known failures pass through, unknown ones don't leak. */
export const handleError = (err, c) => {
  if (err instanceof ApiError) {
    return c.json({ error: err.code, message: err.message }, err.status)
  }
  console.error(err)
  return c.json({ error: 'server_error', message: 'Something went wrong.' }, 500)
}
