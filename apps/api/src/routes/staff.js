import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import { guestServiceSchema, phoneSchema } from '@chqin/shared'
import { body } from '../lib/validate.js'
import { unauthorized } from '../lib/errors.js'
import { COOKIE, cookieOptions, issue, read, revoke } from '../lib/session.js'
import {
  requestPasswordReset,
  resetPassword,
  sendVerificationEmail,
  verifyEmail,
} from '../services/staffMail.js'
import {
  checkinCode,
  getBooking,
  getGuest,
  getSettings,
  getProperty,
  saveProperty,
  listRooms,
  addRooms,
  removeRoom,
  assignRoom,
  saveSettings,
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

/**
 * What a property offers, and where each request goes.
 *
 * Shared between registration and the settings screen deliberately: the same
 * three fields, written by two screens. A second hand-written copy is how the
 * dashboard ends up accepting a shape onboarding rejects.
 */
const settingsShape = {
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
}

const settingsRequest = z.object(settingsShape)

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
  // The registration a hotel is legally operating under. Read off the GST
  // certificate in the browser and editable afterwards; nothing here has been
  // checked against the GST registry, so nothing is claimed to be verified.
  business: z
    .object({
      legalName: z.string().max(160).optional(),
      tradeName: z.string().max(160).optional(),
      gstin: z.string().max(20).optional(),
      // Characters 3-12 of the GSTIN, kept on its own because a business
      // without a GST registration still has a PAN.
      pan: z.string().max(10).optional(),
      constitution: z.string().max(80).optional(),
      registrationType: z.string().max(40).optional(),
      // The registered address, which is not always where guests check in.
      address: z.string().max(240).optional(),
      city: z.string().max(80).optional(),
      state: z.string().max(80).optional(),
      pincode: z.string().max(10).optional(),
    })
    .default({}),
  ...settingsShape,
})

/** The property as its owner can change it. Mirrors registration's `property`. */
const propertyRequest = z.object({
  name: z.string().min(1).max(160),
  kind: z.string().max(40).default('hotel'),
  location: z.string().max(160).nullable().default(null),
  timezone: z.string().max(64).default('UTC'),
  address: z.record(z.string(), z.unknown()).default({}),
})

const roomsRequest = z.object({
  rooms: z
    .array(z.object({ number: z.string().min(1).max(16), type: z.string().max(40).optional() }))
    .min(1)
    .max(500),
})

/** The whole list, every time. An empty one takes the rooms back. */
const roomRequest = z.object({ roomIds: z.array(z.uuid()).max(20).default([]) })

const loginRequest = z.object({
  email: z.email(),
  password: z.string().min(1).max(200),
})

const forgotRequest = z.object({ email: z.email() })

const resetRequest = z.object({
  token: z.string().min(20).max(200),
  // Same floor as registration: a reset must not be a way around it.
  password: z.string().min(10).max(200),
})

const verifyRequest = z.object({ token: z.string().min(20).max(200) })

/* ------------------------------------------------------------------ */
/* Public                                                             */
/* ------------------------------------------------------------------ */

staff.post('/register', body(registerRequest), async (c) => {
  const result = await register(c.get('body'))
  setCookie(
    c,
    COOKIE,
    await issue({ staffId: result.staffId, venueId: result.venueId, role: 'owner' }),
    cookieOptions(c),
  )
  // Not awaited into the response: a slow mail provider should not hold up
  // the screen that follows registration, and nothing here is gated on it.
  sendVerificationEmail(result.staffId)
  return c.json({ name: result.name, venue: { name: result.venueName } })
})

staff.post('/login', body(loginRequest), async (c) => {
  const session = await login(c.get('body'))
  setCookie(c, COOKIE, await issue(session), cookieOptions(c))
  return c.json({ name: session.name, role: session.role })
})

staff.post('/logout', async (c) => {
  // Revoked server-side, not merely forgotten by the browser: that is the
  // whole point of the sessions table.
  await revoke(getCookie(c, COOKIE))
  deleteCookie(c, COOKIE, { path: '/' })
  return c.json({ ok: true })
})

/**
 * Reset, in two halves.
 *
 * The first always returns 200, whether or not the address has an account —
 * an honest answer here is an account-enumeration oracle, the same reason
 * `login` gives one message for both failures.
 */
staff.post('/password/forgot', body(forgotRequest), async (c) => {
  await requestPasswordReset(c.get('body').email)
  return c.json({ ok: true })
})

staff.post('/password/reset', body(resetRequest), async (c) => {
  await resetPassword(c.get('body'))
  // No cookie is set: the new password gets used at the sign-in screen, and
  // signing them in from a link would defeat revoking the old sessions.
  return c.json({ ok: true })
})

/** Confirms the address is real. Nothing is gated on it yet. */
staff.post('/email/verify', body(verifyRequest), async (c) => {
  await verifyEmail(c.get('body').token)
  return c.json({ ok: true })
})

/* ------------------------------------------------------------------ */
/* Everything below needs a session                                    */
/* ------------------------------------------------------------------ */

/*
 * Ordering is the authorization boundary: this middleware guards every route
 * registered below it, and the routes above — register, login, logout, and the
 * three password/email link endpoints — are public because they sit above it.
 * A new public route goes above this line, a new private one below.
 */
staff.use('/*', async (c, next) => {
  // One indexed lookup, and the row is the authority — a revoked session is
  // refused here rather than living out its expiry.
  const claims = await read(getCookie(c, COOKIE))
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

staff.get('/property', async (c) => c.json(await getProperty(venueOf(c))))

staff.post('/property', body(propertyRequest), async (c) =>
  c.json(await saveProperty(venueOf(c), c.get('body'))),
)

staff.get('/rooms', async (c) => c.json({ rooms: await listRooms(venueOf(c)) }))

staff.post('/rooms', body(roomsRequest), async (c) =>
  c.json(await addRooms(venueOf(c), c.get('body').rooms)),
)

staff.delete('/rooms/:id', async (c) => c.json(await removeRoom(venueOf(c), c.req.param('id'))))

staff.post('/checkins/:id/room', body(roomRequest), async (c) =>
  c.json(await assignRoom(venueOf(c), c.req.param('id'), c.get('body').roomIds)),
)

staff.get('/settings', async (c) => c.json(await getSettings(venueOf(c))))

// POST rather than PUT: the dashboard client speaks get and post, and one
// verb's worth of REST purity isn't worth a fourth method on it.
staff.post('/settings', body(settingsRequest), async (c) =>
  c.json(await saveSettings(venueOf(c), c.get('body'))),
)
