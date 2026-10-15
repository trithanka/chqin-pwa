import { and, eq } from 'drizzle-orm'
import { db, transaction } from '../../shared/db/client.js'
import {
  gates,
  guests,
  hotelRooms,
  staffMemberships,
  staffUsers,
  venues,
  visitHosts,
} from '../../shared/db/schema.js'
import { flowKeyFor, latestFlowId } from '../entry/index.js'
import { newSessionToken, lookupHash, tokenHash, encrypt } from '../../shared/lib/crypto.js'
import { hashPassword, verifyPassword } from '../../shared/lib/passwords.js'
import { conflict, forbidden, unauthorized } from '../../shared/lib/errors.js'

/** Staff accounts: registering a venue with its owner, signing in, and who is signed in. */

/**
 * Creates the owner, the venue and its rooms in one transaction.
 *
 * `tx` lets ChqIn Admin run this inside its own audited transaction, and
 * `flowKey` lets it pick the first gate's flow rather than take the kind's
 * default.
 */
export async function register(
  { account, property, rooms: roomList, hosts: hostList, business, services, essentials, contacts, reception },
  { tx: outer, flowKey } = {},
) {
  const emailHmac = lookupHash(account.email)

  const existing = await db.query.staffUsers.findFirst({
    where: (u, { eq: e }) => e(u.emailHmac, emailHmac),
  })
  if (existing) {
    throw conflict('email_taken', 'That email already has an account. Sign in instead.')
  }

  const passwordHash = await hashPassword(account.password)

  return (outer ? (fn) => fn(outer) : transaction)(async (tx) => {
    const [staff] = await tx
      .insert(staffUsers)
      // The address is stored twice on purpose: hashed to find the account at
      // login, encrypted so password reset has somewhere to send to. Only the
      // hash existed before, which meant a locked-out owner was locked out
      // permanently — nothing in the system knew their email.
      .values({ emailHmac, emailEnc: encrypt(account.email), displayName: account.name, passwordHash })
      .returning({ id: staffUsers.id, displayName: staffUsers.displayName })

    const [venue] = await tx
      .insert(venues)
      .values({
        name: property.name,
        kind: property.kind ?? 'hotel',
        location: [property.address, property.city].filter(Boolean).join(', ') || property.city,
        timezone: property.timezone ?? 'UTC',
        address: {
          line1: property.address ?? '',
          city: property.city,
          country: property.country,
          ...(property.lat != null && property.lng != null
            ? { lat: property.lat, lng: property.lng }
            : {}),
        },
        // One column rather than four tables — nothing reads these by query
        // yet. `verified: false` is the honest state: the owner typed the
        // GSTIN, nobody checked it.
        settings: {
          business: { ...business, verified: false },
          services: services ?? [],
          essentials: essentials ?? {},
          contacts: contacts ?? {},
          // Where a guest's check-in is announced (WhatsApp). Never sent to guests.
          reception: reception ?? null,
        },
      })
      .returning({ id: venues.id, name: venues.name, kind: venues.kind })

    await tx
      .insert(staffMemberships)
      .values({ staffId: staff.id, venueId: venue.id, role: account.role ?? 'owner' })

    if (roomList?.length) {
      await tx
        .insert(hotelRooms)
        .values(roomList.map((r) => ({ venueId: venue.id, number: r.number, roomType: r.type })))
    }

    if (hostList?.length) {
      await tx
        .insert(visitHosts)
        .values(hostList.map((h) => ({ venueId: venue.id, name: h.name, phone: h.phone ?? null })))
    }

    // The way in. Made here rather than on first ask so every venue has one
    // from the moment it exists; the card is printed from it.
    const token = newSessionToken()
    await tx.insert(gates).values({
      venueId: venue.id,
      name: 'Front desk',
      kind: 'desk',
      flowId: await latestFlowId(flowKey ?? flowKeyFor(venue.kind), tx),
      token,
      tokenHash: tokenHash(token),
    })

    return { staffId: staff.id, venueId: venue.id, venueName: venue.name, name: staff.displayName }
  })
}

// A throwaway hash so a missing account costs the same time as a real one.
let decoyHash = null

const unknownUserHash = async () => (decoyHash ??= await hashPassword('no-such-account'))

export async function login({ email, password }) {
  const staff = await db.query.staffUsers.findFirst({
    where: (u, { eq: e }) => e(u.emailHmac, lookupHash(email)),
  })

  // One message for a wrong email and a wrong password: distinct answers turn
  // a login form into a way to find out who has an account. The hash is still
  // computed when the user is missing, so the timing doesn't answer either.
  const ok = await verifyPassword(password, staff?.passwordHash ?? (await unknownUserHash()))
  if (!staff || !ok || staff.status !== 'active') {
    throw unauthorized('invalid_credentials', "That email and password don't match.")
  }

  const membership = await db.query.staffMemberships.findFirst({
    where: (m, { eq: e }) => e(m.staffId, staff.id),
  })
  if (!membership) throw unauthorized('no_venue', 'This account has no property yet.')

  // Set by ChqIn Admin. Suspending also revoked every open session, so this
  // is the only check a suspended venue needs on the staff side.
  const [venue] = await db.select({ status: venues.status }).from(venues).where(eq(venues.id, membership.venueId))
  if (venue?.status !== 'active') {
    throw forbidden('venue_suspended', 'This property is not active on ChqIn right now. Contact ChqIn support.')
  }

  await db
    .update(staffUsers)
    .set({ lastLoginAt: new Date() })
    .where(eq(staffUsers.id, staff.id))

  return {
    staffId: staff.id,
    venueId: membership.venueId,
    role: membership.role,
    name: staff.displayName,
  }
}

export async function profile({ staffId, venueId }) {
  const [row] = await db
    .select({
      name: staffUsers.displayName,
      role: staffMemberships.role,
      venueName: venues.name,
      venueKind: venues.kind,
      venueLocation: venues.location,
    })
    .from(staffUsers)
    .innerJoin(staffMemberships, eq(staffMemberships.staffId, staffUsers.id))
    .innerJoin(venues, eq(venues.id, staffMemberships.venueId))
    .where(and(eq(staffUsers.id, staffId), eq(staffMemberships.venueId, venueId)))
    .limit(1)

  if (!row) throw unauthorized('no_session', 'Sign in again.')
  return {
    name: row.name,
    role: row.role,
    venue: { name: row.venueName, kind: row.venueKind, location: row.venueLocation },
  }
}
