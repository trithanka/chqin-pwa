import { and, eq, isNull, sql } from 'drizzle-orm'
import { config } from '../../config.js'
import { db } from '../../shared/db/client.js'
import {
  entitlements,
  entrySessions,
  flowDefinitions,
  gates,
  hotelBookingRooms,
  hotelBookings,
  hotelRooms,
  venues,
} from '../../shared/db/schema.js'
import { newSessionToken, tokenHash } from '../../shared/lib/crypto.js'
import { conflict, forbidden, notFound } from '../../shared/lib/errors.js'

/**
 * Entry sessions: what a scanned QR resolves to, and the only thing that
 * carries a guest's identity between requests.
 *
 * Property names here (`bookingId`, `bookingGuestId`…) are the ones the guest
 * routes already use, so the rows underneath could move to the entry engine
 * without those routes noticing. `bookingId` is the session's entitlement.
 */

const OPEN = ['in_progress', 'waiting']

/** Every write to a session bumps its version, so a stale save can be refused. */
export const touch = () => ({ version: sql`${entrySessions.version} + 1`, updatedAt: new Date() })

/**
 * How this gate identifies people. ChqIn Admin decides per venue whether Aadhaar
 * is available at all (`settings.aadhaarAccess`, on unless set to false); without
 * it everyone gives a name, date of birth and address. With it, a hotel always
 * uses Aadhaar — its register is a legal record — and any other flow follows the
 * gate's own setting, which unset means basic.
 */
export const aadhaarAllowed = (settings) => settings?.aadhaarAccess !== false

const identityMethodOf = (row) =>
  !aadhaarAllowed(row.venueSettings) ? 'basic'
  : row.flowKey === 'hotel' ? 'aadhaar'
  : (row.gateConfig?.identity ?? 'basic')

/** Session joined to its venue and booking, whatever state it's in. */
export async function loadAny(sessionId) {
  const [row] = await db
    .select({
      id: entrySessions.id,
      venueId: entrySessions.venueId,
      gateId: entrySessions.gateId,
      flowId: entrySessions.flowId,
      flowKey: flowDefinitions.key,
      gateConfig: gates.config,
      bookingId: entrySessions.entitlementId,
      guestId: entrySessions.guestId,
      status: entrySessions.status,
      journey: sql`${entrySessions.state}->>'journey'`,
      expiresAt: entrySessions.expiresAt,
      venueName: venues.name,
      venueKind: venues.kind,
      venueLocation: venues.location,
      // What the property offers, collected at onboarding. Only reaches a
      // guest who has finished checking in — see modules/hotel/checkins.js.
      venueSettings: venues.settings,
      bookingRef: entitlements.ref,
      bookingGuestName: hotelBookings.guestName,
      bookingGuestId: entitlements.guestId,
      arrivalDate: hotelBookings.arrivalDate,
      departureDate: hotelBookings.departureDate,
      roomNumber: hotelRooms.number,
    })
    .from(entrySessions)
    .innerJoin(venues, eq(venues.id, entrySessions.venueId))
    .innerJoin(flowDefinitions, eq(flowDefinitions.id, entrySessions.flowId))
    .innerJoin(gates, eq(gates.id, entrySessions.gateId))
    .leftJoin(entitlements, eq(entitlements.id, entrySessions.entitlementId))
    .leftJoin(hotelBookings, eq(hotelBookings.entitlementId, entitlements.id))
    // Through the join table: a booking can hold more than one room, and the
    // guest looking at their own session wants the one they were given.
    .leftJoin(hotelBookingRooms, eq(hotelBookingRooms.bookingId, hotelBookings.entitlementId))
    .leftJoin(hotelRooms, eq(hotelRooms.id, hotelBookingRooms.roomId))
    .where(eq(entrySessions.id, sessionId))
    .limit(1)

  return row ? { ...row, identityMethod: identityMethodOf(row) } : null
}

export const isOpen = (session) => OPEN.includes(session.status) && session.expiresAt >= new Date()

/** Session that is still open and unexpired, or null. */
export async function loadOpen(sessionId) {
  const session = await loadAny(sessionId)
  return session && isOpen(session) ? session : null
}

/** Same, but throws the 404 every route would otherwise repeat. */
export async function requireOpen(sessionId) {
  const session = await loadOpen(sessionId)
  if (!session) throw notFound()
  return session
}

export const toPayload = (s) => ({
  sessionId: s.id,
  // Which flow the gate runs: the guest app picks its screens from this.
  flow: s.flowKey,
  identity: s.identityMethod,
  venue: { name: s.venueName, kind: s.venueKind, location: s.venueLocation },
  booking: s.bookingId
    ? {
        reference: s.bookingRef,
        guestName: s.bookingGuestName,
        roomNumber: s.roomNumber,
        arrivalDate: s.arrivalDate,
        departureDate: s.departureDate,
      }
    : null,
  expiresAt: s.expiresAt.toISOString(),
})

/**
 * Resolve a scanned token. A gate's QR is long-lived and mints a short-lived
 * session per scan; a session's own token (a booking QR) is single-use and must
 * still be open.
 */
export async function resolveToken(token) {
  const hash = tokenHash(token)

  const [gate] = await db
    .select({ id: gates.id, venueId: gates.venueId, flowId: gates.flowId, venueStatus: venues.status })
    .from(gates)
    .innerJoin(venues, eq(venues.id, gates.venueId))
    .where(and(eq(gates.tokenHash, hash), eq(gates.status, 'active')))
    .limit(1)

  // Suspended or closed by ChqIn Admin: the card still scans, and says why
  // nothing happens rather than looking broken.
  if (gate && gate.venueStatus !== 'active') {
    throw forbidden('venue_suspended', 'This venue is not accepting check-ins right now. Please ask at the desk.')
  }

  if (gate) {
    const [session] = await db
      .insert(entrySessions)
      .values({
        venueId: gate.venueId,
        gateId: gate.id,
        flowId: gate.flowId,
        tokenHash: tokenHash(newSessionToken()),
        expiresAt: new Date(Date.now() + config.SESSION_TTL_MS),
      })
      .returning({ id: entrySessions.id })
    return loadAny(session.id)
  }

  const [own] = await db
    .select({ id: entrySessions.id, status: entrySessions.status, expiresAt: entrySessions.expiresAt })
    .from(entrySessions)
    .where(eq(entrySessions.tokenHash, hash))
    .limit(1)

  if (!own || own.status === 'revoked' || own.expiresAt < new Date()) {
    throw notFound('This QR code is not valid any more.')
  }
  if (!OPEN.includes(own.status)) {
    throw conflict('session_used', 'This QR code has already been used.')
  }
  return loadAny(own.id)
}

/**
 * Attach a reservation to a session that arrived without one.
 *
 * A desk QR identifies the venue, not the guest — so somebody scanning the
 * card has to say which booking is theirs before anything else can happen.
 * Without this the flow enrols a passkey for "Guest" and then can't check
 * anyone in, which is exactly as useless as it sounds.
 *
 * Matching is deliberately narrow: today's confirmed arrivals at this venue
 * only. A booking reference matches exactly; a surname matches the end of the
 * booked name, and an ambiguous surname asks for the reference rather than
 * guessing between two guests.
 */
export async function attachBookingByLookup(session, lookup) {
  const term = lookup.trim()
  if (term.length < 2) throw notFound('Enter your booking reference or last name.')

  const candidates = await db
    .select({
      id: entitlements.id,
      reference: entitlements.ref,
      guestName: hotelBookings.guestName,
      roomNumber: hotelRooms.number,
      arrivalDate: hotelBookings.arrivalDate,
      departureDate: hotelBookings.departureDate,
    })
    .from(entitlements)
    .innerJoin(hotelBookings, eq(hotelBookings.entitlementId, entitlements.id))
    .leftJoin(hotelBookingRooms, eq(hotelBookingRooms.bookingId, hotelBookings.entitlementId))
    .leftJoin(hotelRooms, eq(hotelRooms.id, hotelBookingRooms.roomId))
    .where(
      and(
        eq(entitlements.venueId, session.venueId),
        eq(hotelBookings.status, 'confirmed'),
        sql`${hotelBookings.arrivalDate} = CURRENT_DATE`,
        sql`(lower(${entitlements.ref}) = lower(${term})
             OR lower(${hotelBookings.guestName}) LIKE lower(${'%' + term}))`,
      ),
    )
    .limit(5)

  if (!candidates.length) {
    throw notFound("We couldn't find that booking for today. Check with the desk.")
  }
  if (candidates.length > 1) {
    throw conflict(
      'ambiguous_booking',
      'More than one booking matches that name. Enter your booking reference instead.',
    )
  }

  const booking = candidates[0]
  await db
    .update(entrySessions)
    .set({ entitlementId: booking.id, ...touch() })
    .where(eq(entrySessions.id, session.id))

  return booking
}

/** Records who the session belongs to. Only a verified ceremony may call this. */
export const bindGuest = (tx, sessionId, guestId) =>
  tx.update(entrySessions).set({ guestId, ...touch() }).where(eq(entrySessions.id, sessionId))

/**
 * A desk QR carries no reservation — it identifies the property. Once a
 * ceremony says who the guest is, attach today's booking for them. A guest
 * with no arrival today gets none, and check-in says so rather than inventing
 * one.
 */
export async function attachBooking(tx, session, guestId) {
  if (session.bookingId) return session.bookingId

  const [booking] = await tx
    .select({ id: entitlements.id })
    .from(entitlements)
    .innerJoin(hotelBookings, eq(hotelBookings.entitlementId, entitlements.id))
    .where(
      and(
        eq(entitlements.venueId, session.venueId),
        eq(entitlements.guestId, guestId),
        eq(hotelBookings.status, 'confirmed'),
        sql`${hotelBookings.arrivalDate} = CURRENT_DATE`,
      ),
    )
    .orderBy(entitlements.createdAt)
    .limit(1)

  if (!booking) return null
  await tx
    .update(entrySessions)
    .set({ entitlementId: booking.id, ...touch() })
    .where(and(eq(entrySessions.id, session.id), isNull(entrySessions.entitlementId)))
  return booking.id
}
