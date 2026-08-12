import { ApiError } from './errors.js'

/**
 * Validates the body against a shared schema and hands the parsed value to the
 * route. The client builds its requests from these same schemas, so a mismatch
 * is caught here rather than three layers in.
 */
export const body = (schema) => async (c, next) => {
  const raw = await c.req.json().catch(() => null)
  const result = schema.safeParse(raw)
  if (!result.success) {
    throw new ApiError('invalid_request', result.error.issues[0].message, 400)
  }
  c.set('body', result.data)
  await next()
}
