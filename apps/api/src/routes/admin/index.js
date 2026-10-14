import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import { body } from '../../lib/validate.js'
import {
  COOKIE,
  acceptLink,
  confirmTotp,
  linkInfo,
  login,
  revoke,
} from '../../services/admin/auth.js'
import { health, overview } from '../../services/admin/overview.js'
import { adminCookie, csrf, ipGate, meta, mfa, session } from './guard.js'
import { venueRoutes } from './venues.js'
import { flowRoutes } from './flows.js'
import { peopleRoutes } from './people.js'
import { logRoutes } from './logs.js'
import { opsRoutes } from './ops.js'

/**
 * ChqIn Admin's API. Mounted at /admin by app.js.
 *
 * Ordering is the authorization boundary, as in routes/staff.js: each `use`
 * guards every route registered after it. Read top to bottom:
 *
 *   network gate → admin client header → [public sign-in routes]
 *   → session → [TOTP step, /me] → second factor → [everything else]
 */

export const admin = new Hono()

admin.use('/*', ipGate)
admin.use('/*', csrf)

/* ------------------------------------------------------------------ */
/* Public: signing in and accepting a link                            */
/* ------------------------------------------------------------------ */

const loginRequest = z.object({ email: z.email(), password: z.string().min(1).max(200) })
const acceptRequest = z.object({
  token: z.string().min(20).max(200),
  password: z.string().max(200).optional(),
  code: z.string().regex(/^\d{6}$/),
})

admin.post('/auth/login', body(loginRequest), async (c) => {
  const token = await login(c.get('body'), meta(c))
  setCookie(c, COOKIE, token, adminCookie(c, 5 * 60))
  return c.json({ next: 'totp' })
})

admin.get('/auth/link', async (c) => c.json(await linkInfo(c.req.query('token'))))

admin.post('/auth/accept', body(acceptRequest), async (c) => {
  await acceptLink(c.get('body'), meta(c))
  return c.json({ ok: true })
})

admin.post('/auth/logout', async (c) => {
  await revoke(getCookie(c, COOKIE))
  deleteCookie(c, COOKIE, { path: '/admin' })
  return c.json({ ok: true })
})

/* ------------------------------------------------------------------ */
/* A session, before or after the second factor                        */
/* ------------------------------------------------------------------ */

admin.use('/*', session)

admin.post('/auth/totp', body(z.object({ code: z.string().regex(/^\d{6}$/) })), async (c) => {
  await confirmTotp(c.get('admin'), c.get('body').code, meta(c))
  // Re-set with the full lifetime; the password-only cookie had five minutes.
  setCookie(c, COOKIE, getCookie(c, COOKIE), adminCookie(c, 8 * 60 * 60))
  return c.json({ ok: true })
})

admin.get('/me', (c) => c.json(c.get('admin')))

/* ------------------------------------------------------------------ */
/* Everything below needs the second factor                            */
/* ------------------------------------------------------------------ */

admin.use('/*', mfa)

admin.get('/overview', async (c) => c.json(await overview()))
admin.get('/health', async (c) => c.json(await health()))

admin.route('/', venueRoutes)
admin.route('/', flowRoutes)
admin.route('/', peopleRoutes)
admin.route('/', logRoutes)
admin.route('/', opsRoutes)
