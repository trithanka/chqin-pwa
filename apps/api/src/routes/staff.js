import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import { guestServiceSchema, phoneSchema } from '@chqin/shared'
import { body } from '../lib/validate.js'
import { unauthorized } from '../lib/errors.js'
import { COOKIE, cookieOptions, issue, read } from '../lib/session.js'
import {
  checkinCode,
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
    // Present when the property was picked from place search rather than
    // typed. Kept so a map pin never has to be geocoded from a string later.
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  }),
  rooms: z
    .array(z.object({ number: z.string().min(1).max(16), type: z.string().max(40).optional() }))
    .max(500)
    .default([]),
  // The registration a hotel is legally operating under. Typed by the owner;
  // the document upload behind it isn't read yet, so nothing here is claimed
  // to be verified.
  business: z
    .object({
      legalName: z.string().max(160).optional(),
      gstin: z.string().max(20).optional(),
    })
    .default({}),
  // Which request tiles the guest sees in their room.
  services: z.array(guestServiceSchema).max(20).default([]),
  // The questions every guest asks the desk, answered once.
  essentials: z
    .object({
      wifiSsid: z.string().max(64).optional(),
      wifiPassword: z.string().max(64).optional(),
      breakfastFrom: z.string().max(8).optional(),
      breakfastTo: z.string().max(8).optional(),
      checkoutTime: z.string().max(8).optional(),
      notes: z.string().max(500).optional(),
    })
    .default({}),
  // Where each service's requests go. Keyed by service so a property can send
  // food to the kitchen and laundry somewhere else without a second concept.
  contacts: z.partialRecord(guestServiceSchema, phoneSchema).default({}),
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

staff.get('/checkin-code', async (c) => c.json(await checkinCode(venueOf(c))))

staff.get('/bookings', async (c) => c.json({ bookings: await listBookings(venueOf(c)) }))

staff.get('/bookings/:id', async (c) => c.json(await getBooking(venueOf(c), c.req.param('id'))))

staff.get('/guests', async (c) => c.json({ guests: await listGuests(venueOf(c)) }))

staff.get('/guests/:id', async (c) => c.json(await getGuest(venueOf(c), c.req.param('id'))))
