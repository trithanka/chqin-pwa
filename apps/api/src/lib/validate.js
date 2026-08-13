import { ApiError } from './errors.js'

/**
 * Name the field.
 *
 * Zod's own text — "Too small: expected string to have >=10 characters" — is
 * true and useless: it doesn't say *which* string, so a client sees a 400 with
 * no way to find the offending input.
 */
function describe(issue) {
  const field = issue.path?.join('.') || 'request body'

  if (issue.code === 'invalid_type' && issue.input === undefined) {
    return `${field} is required`
  }
  if (issue.code === 'too_small') {
    return issue.origin === 'string'
      ? `${field} must be at least ${issue.minimum} characters`
      : `${field} must have at least ${issue.minimum} items`
  }
  if (issue.code === 'too_big') {
    return issue.origin === 'string'
      ? `${field} must be at most ${issue.maximum} characters`
      : `${field} must have at most ${issue.maximum} items`
  }
  if (issue.code === 'invalid_format') return `${field} is not a valid ${issue.format ?? 'value'}`
  if (issue.code === 'invalid_value') return `${field} is not one of the allowed values`

  return `${field}: ${issue.message}`
}

/**
 * Validates the body against a shared schema and hands the parsed value to the
 * route. The client builds its requests from these same schemas, so a mismatch
 * is caught here rather than three layers in.
 */
export const body = (schema) => async (c, next) => {
  const raw = await c.req.json().catch(() => null)
  const result = schema.safeParse(raw)
  if (!result.success) {
    throw new ApiError('invalid_request', describe(result.error.issues[0]), 400)
  }
  c.set('body', result.data)
  await next()
}
