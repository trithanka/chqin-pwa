import { BlockList, isIPv6 } from 'node:net'
import { getCookie } from 'hono/cookie'
import { config } from '../../../config.js'
import { forbidden, unauthorized } from '../../../shared/lib/errors.js'
import { cookieOptions } from '../../../shared/lib/session.js'
import { COOKIE, readSession } from '../services/auth.js'
import { clientIp } from '../services/util.js'

/**
 * The middleware in front of /admin, in the order routes/admin/index.js mounts
 * it. Each layer assumes nothing about the ones after it.
 */

const allow = new BlockList()
for (const entry of config.ADMIN_IP_ALLOWLIST) {
  if (entry === '*') continue // the deliberate "any address" switch; see ipGate
  const [address, prefix] = entry.split('/')
  const type = isIPv6(address) ? 'ipv6' : 'ipv4'
  if (prefix) allow.addSubnet(address, Number(prefix), type)
  else allow.addAddress(address, type)
}

/**
 * 1. The network gate. An empty list means no gate in development, and no
 * /admin at all in production: it fails closed rather than open. Reaching
 * /admin from any address has to be chosen: `ADMIN_IP_ALLOWLIST=*`. Then only
 * the password, the second factor and the lockout stand in front of it.
 */
export const ipGate = async (c, next) => {
  const open = config.ADMIN_IP_ALLOWLIST.includes('*')
  if (!config.ADMIN_IP_ALLOWLIST.length && process.env.NODE_ENV === 'production') {
    return c.json({ error: 'not_found', message: 'Not found.' }, 404)
  }
  if (config.ADMIN_IP_ALLOWLIST.length && !open) {
    const ip = clientIp(c)
    if (!ip || !allow.check(ip, isIPv6(ip) ? 'ipv6' : 'ipv4')) {
      // 404 rather than 403: from outside the list, /admin is not there.
      return c.json({ error: 'not_found', message: 'Not found.' }, 404)
    }
  }
  await next()
}

/**
 * 2. A header only our own client sends.
 *
 * The admin, business and guest sites are all same-site with the API, so
 * SameSite does not stop business.chqin.in from posting here with the admin
 * cookie attached. A custom header can't be set cross-origin without a CORS
 * preflight, and preflight for /admin only passes from ADMIN_ORIGINS.
 */
export const csrf = async (c, next) => {
  if (c.req.header('x-chqin-admin') !== '1') throw forbidden('admin_client_only', 'Use the ChqIn Admin app.')
  await next()
}

/** 3. Who is calling. Reads chqin_admin and nothing else — a staff cookie means nothing here. */
export const session = async (c, next) => {
  const claims = await readSession(getCookie(c, COOKIE))
  if (!claims) throw unauthorized('no_admin_session', 'Sign in to continue.')
  c.set('admin', claims)
  await next()
}

/** 4. The second factor. Before it, only the TOTP step, /me and sign-out are reachable. */
export const mfa = async (c, next) => {
  if (!c.get('admin').mfa) throw unauthorized('mfa_required', 'Enter the code from your authenticator app.')
  await next()
}

/** 5. Per route. */
export const can =
  (...roles) =>
  async (c, next) => {
    if (!roles.includes(c.get('admin').role)) {
      throw forbidden('role', `This needs the ${roles.join(' or ')} role.`)
    }
    await next()
  }

export const WRITE = can('owner', 'support')
export const OWNER = can('owner')

/**
 * Path-scoped and Strict: the browser sends it only to /admin, never to a
 * staff or guest route, and never on a request another site started.
 */
export const adminCookie = (c, maxAge) => ({
  ...cookieOptions(c),
  path: '/admin',
  sameSite: 'Strict',
  maxAge,
})

export const meta = (c) => ({ ip: clientIp(c), userAgent: c.req.header('user-agent')?.slice(0, 300) ?? null })
