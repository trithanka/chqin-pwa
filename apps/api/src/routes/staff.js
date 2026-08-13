import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import { body } from '../lib/validate.js'
import { unauthorized } from '../lib/errors.js'
import { COOKIE, cookieOptions, issue, read } from '../lib/session.js'
import {
  getBooking,
  getGuest,
  listBookings,
  listGuests,
  login,
  overview,
  profile,
  register,
} from '../services/staff.js'

export const staff = new Hono()

/* ------------------------------------------------------------------ */
/* Contracts                                                           */
/* ------------------------------------------------------------------ */

const registerRequest = z.object({
  account: z.object({
    name: z.string().min(1).max(120),
    email: z.email(),
    password: z.string().min(10).max(200),
    role: z.enum(['owner', 'manager', 'frontdesk']).default('owner'),
  }),
  property: z.object({
    name: z.string().min(1).max(160),
    kind: z.string().default('hotel'),
    city: z.string().min(1).max(120),
    address: z.string().max(240).optional(),
    country: z.string().max(2).optional(),
    timezone: z.string().default('UTC'),
  }),
  rooms: z
    .array(z.object({ number: z.string().min(1).max(16), type: z.string().max(40).optional() }))
    .max(500)
    .default([]),
  // Accepted and ignored — see services/staff.js.
  team: z.array(z.object({ email: z.email(), role: z.string() })).max(100).default([]),
})

const loginRequest = z.object({
  email: z.email(),
  password: z.string().min(1).max(200),
})

/* ------------------------------------------------------------------ */
/* Public                                                             */
/* ------------------------------------------------------------------ */

staff.post('/register', body(registerRequest), async (c) => {
  const result = await register(c.get('body'))
  setCookie(
    c,
    COOKIE,
    issue({ staffId: result.staffId, venueId: result.venueId, role: 'owner' }),
    cookieOptions(),
  )
  return c.json({ name: result.name, venue: { name: result.venueName } })
})

staff.post('/login', body(loginRequest), async (c) => {
  const session = await login(c.get('body'))
  setCookie(c, COOKIE, issue(session), cookieOptions())
  return c.json({ name: session.name, role: session.role })
})

staff.post('/logout', (c) => {
  // Clears the browser's copy. With a signed cookie there is nothing
  // server-side to revoke — see lib/session.js.
  deleteCookie(c, COOKIE, { path: '/' })
  return c.json({ ok: true })
})

/* ------------------------------------------------------------------ */
/* Everything below needs a session                                    */
/* ------------------------------------------------------------------ */

staff.use('/*', async (c, next) => {
  const claims = read(getCookie(c, COOKIE))
  if (!claims) throw unauthorized('no_session', 'Sign in to continue.')
  c.set('session', claims)
  await next()
})

const venueOf = (c) => c.get('session').venueId

staff.get('/me', async (c) => c.json(await profile(c.get('session'))))

staff.get('/overview', async (c) => c.json(await overview(venueOf(c))))

staff.get('/bookings', async (c) => c.json({ bookings: await listBookings(venueOf(c)) }))

staff.get('/bookings/:id', async (c) => c.json(await getBooking(venueOf(c), c.req.param('id'))))

staff.get('/guests', async (c) => c.json({ guests: await listGuests(venueOf(c)) }))

staff.get('/guests/:id', async (c) => c.json(await getGuest(venueOf(c), c.req.param('id'))))
