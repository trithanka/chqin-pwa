import { Hono } from 'hono'
import { z } from 'zod'
import { ApiError } from '../lib/errors.js'
import { searchPlaces } from '../services/places.js'

export const places = new Hono()

const query = z.object({
  q: z.string().min(1).max(120),
  country: z.string().length(2).optional(),
})

/**
 * Public on purpose: this is used on the first screen of registration, before
 * anyone has an account. It reads nothing of ours — it's a thin, throttled,
 * cached pass-through to Nominatim, which is what keeps our User-Agent and the
 * one-request-a-second budget under our control instead of the browser's.
 */
places.get('/', async (c) => {
  const parsed = query.safeParse(c.req.query())
  if (!parsed.success) throw new ApiError('invalid_request', 'Search for a place by name.', 400)

  return c.json({ places: await searchPlaces(parsed.data) })
})
