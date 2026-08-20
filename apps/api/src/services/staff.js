import { and, count, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { db, transaction } from '../db/client.js'
import {
  bookings,
  checkinSessions,
  checkins,
  credentials,
  guests,
  identityVerifications,
  rooms,
  staffMemberships,
  staffUsers,
  venues,
} from '../db/schema/index.js'
import { newSessionToken, lookupHash, tokenHash } from '../lib/crypto.js'
import { hashPassword, verifyPassword } from '../lib/passwords.js'
import { conflict, notFound, unauthorized } from '../lib/errors.js'

/**
 * The staff side: accounts, and reads scoped to the venue they belong to.
 *
 * Every query here filters by `venueId` from the session. An auth check alone
 * is not enough — the moment there are two venues, a missing filter is a
 * cross-tenant leak rather than a bug in someone's dashboard.
 */

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */

/** Creates the owner, the venue and its rooms in one transaction. */
export async function register({
  account,
  property,
  rooms: roomList,
  business,
  services,
  essentials,
  contacts,
}) {
  const emailHmac = lookupHash(account.email)

  const existing = await db.query.staffUsers.findFirst({
    where: (u, { eq: e }) => e(u.emailHmac, emailHmac),
  })
  if (existing) {
    throw conflict('email_taken', 'That email already has an account. Sign in instead.')
  }

  const passwordHash = await hashPassword(account.password)

  return transaction(async (tx) => {
    const [staff] = await tx
      .insert(staffUsers)
      .values({ emailHmac, displayName: account.name, passwordHash })
      .returning({ id: staffUsers.id, displayName: staffUsers.displayName })

    const [venue] = await tx
      .insert(venues)
      .values({
        name: property.name,
        kind: property.kind ?? 'hotel',
        location: [property.address, property.city].filter(Boolean).join(', ') || property.city,
        timezone: property.timezone ?? 'UTC',
        address: { line1: property.address ?? '', city: property.city, country: property.country },
        // One column rather than four tables — nothing reads these by query
        // yet. `verified: false` is the honest state: the owner typed the
        // GSTIN, nobody checked it.
        settings: {
          business: { ...business, verified: false },
          services: services ?? [],
          essentials: essentials ?? {},
          contacts: contacts ?? {},
        },
      })
      .returning({ id: venues.id, name: venues.name })

    await tx
      .insert(staffMemberships)
      .values({ staffId: staff.id, venueId: venue.id, role: account.role ?? 'owner' })

    if (roomList?.length) {
      await tx
        .insert(rooms)
        .values(roomList.map((r) => ({ venueId: venue.id, number: r.number, roomType: r.type })))
    }

    return { staffId: staff.id, venueId: venue.id, venueName: venue.name, name: staff.displayName }
  })
}

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

// A throwaway hash so a missing account costs the same time as a real one.
let decoyHash = null
const unknownUserHash = async () => (decoyHash ??= await hashPassword('no-such-account'))

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

/* ------------------------------------------------------------------ */
/* Reads — every one of these filters by venue                         */
/* ------------------------------------------------------------------ */

const bookingRow = {
  id: bookings.id,
  reference: bookings.bookingRef,
  guestId: bookings.guestId,
  guestName: bookings.guestName,
  room: rooms.number,
  roomType: rooms.roomType,
  arrival: bookings.arrivalDate,
  departure: bookings.departureDate,
  status: bookings.status,
  source: bookings.pmsRef,
  checkedInAt: checkins.checkedInAt,
  journey: checkins.journey,
}

const bookingsQuery = (venueId) =>
  db
    .select(bookingRow)
    .from(bookings)
    .leftJoin(rooms, eq(rooms.id, bookings.roomId))
    .leftJoin(checkins, eq(checkins.bookingId, bookings.id))
    .where(eq(bookings.venueId, venueId))

export const listBookings = (venueId) =>
  bookingsQuery(venueId).orderBy(desc(bookings.arrivalDate), bookings.bookingRef)

export async function getBooking(venueId, id) {
  const [row] = await bookingsQuery(venueId).where(
    and(eq(bookings.venueId, venueId), eq(bookings.id, id)),
  )
  if (!row) throw notFound('No such booking here.')
  return row
}

/**
 * The venue's check-in code — the one printed on the desk card.
 *
 * Created on first ask and returned unchanged after that, because the card is
 * printed: a code that rotated on every visit would invalidate the card
 * already sitting on the counter.
 */
export async function checkinCode(venueId) {
  const [existing] = await db
    .select({ token: checkinSessions.token })
    .from(checkinSessions)
    .where(
      and(
        eq(checkinSessions.venueId, venueId),
        eq(checkinSessions.kind, 'desk'),
        eq(checkinSessions.status, 'open'),
        isNotNull(checkinSessions.token),
      ),
    )
    .limit(1)

  if (existing?.token) return { token: existing.token }

  const token = newSessionToken()
  await db.insert(checkinSessions).values({
    venueId,
    token,
    tokenHash: tokenHash(token),
    kind: 'desk',
    // A printed card doesn't expire on a timer; it's revoked or reprinted.
    expiresAt: new Date(Date.now() + 3650 * 86_400_000),
  })

  return { token }
}

/**
 * Today's arrivals plus the counts a desk actually watches.
 *
 * Two kinds of row: reservations expected today, and people who simply turned
 * up and checked in. A list built only from bookings would show nothing at a
 * venue that doesn't take them.
 */
export async function overview(venueId) {
  const today = new Date().toISOString().slice(0, 10)

  const expected = await bookingsQuery(venueId).where(
    and(eq(bookings.venueId, venueId), eq(bookings.arrivalDate, today)),
  )

  const walkIns = await db
    .select({
      id: checkins.id,
      reference: sql`null`,
      guestId: checkins.guestId,
      guestName: guests.displayName,
      room: rooms.number,
      roomType: sql`null`,
      arrival: sql`${today}`,
      departure: sql`null`,
      status: sql`'checked_in'`,
      source: sql`null`,
      checkedInAt: checkins.checkedInAt,
      journey: checkins.journey,
    })
    .from(checkins)
    .leftJoin(guests, eq(guests.id, checkins.guestId))
    .leftJoin(rooms, eq(rooms.id, checkins.roomId))
    .where(
      and(
        eq(checkins.venueId, venueId),
        isNull(checkins.bookingId),
        sql`${checkins.checkedInAt}::date = CURRENT_DATE`,
      ),
    )

  const arrivals = [...expected, ...walkIns]

  const [inHouse] = await db
    .select({ value: count() })
    .from(checkins)
    .where(and(eq(checkins.venueId, venueId), sql`${checkins.checkedInAt}::date >= CURRENT_DATE - 1`))

  const [roomCount] = await db
    .select({ value: count() })
    .from(rooms)
    .where(eq(rooms.venueId, venueId))

  return {
    date: today,
    arrivals,
    inHouse: inHouse.value,
    rooms: roomCount.value,
  }
}

/**
 * Guests who have checked in *here*.
 *
 * The venue sees its own stays and nothing else — not where else someone uses
 * ChqIn, not a global stay count, never a public key. That boundary is the
 * product's premise, and this query is what makes it true rather than a claim
 * in the copy.
 */
export async function listGuests(venueId) {
  const rows = await db
    .select({
      id: guests.id,
      name: guests.displayName,
      dateOfBirth: guests.dateOfBirth,
      gender: guests.gender,
      memberSince: guests.createdAt,
      stays: count(checkins.id),
      lastStay: sql`max(${checkins.checkedInAt})`,
    })
    .from(checkins)
    .innerJoin(guests, eq(guests.id, checkins.guestId))
    .where(eq(checkins.venueId, venueId))
    .groupBy(guests.id)
    .orderBy(desc(sql`max(${checkins.checkedInAt})`))

  if (!rows.length) return []

  // Device count, not device detail: how many passkeys, never the keys.
  const deviceCounts = await db
    .select({ guestId: credentials.guestId, value: count() })
    .from(credentials)
    .where(inArray(credentials.guestId, rows.map((r) => r.id)))
    .groupBy(credentials.guestId)

  const byGuest = new Map(deviceCounts.map((d) => [d.guestId, d.value]))
  return rows.map((row) => ({ ...row, devices: byGuest.get(row.id) ?? 0 }))
}

export async function getGuest(venueId, id) {
  const [guest] = await db
    .select({
      id: guests.id,
      name: guests.displayName,
      dateOfBirth: guests.dateOfBirth,
      gender: guests.gender,
      memberSince: guests.createdAt,
    })
    .from(guests)
    .innerJoin(checkins, eq(checkins.guestId, guests.id))
    .where(and(eq(guests.id, id), eq(checkins.venueId, venueId)))
    .limit(1)

  // Not "not found" by accident: a guest who has never stayed here is simply
  // not this venue's to look at.
  if (!guest) throw notFound('No such guest here.')

  const devices = await db
    .select({
      label: credentials.deviceLabel,
      addedAt: credentials.createdAt,
      lastUsedAt: credentials.lastUsedAt,
    })
    .from(credentials)
    .where(eq(credentials.guestId, id))
    .orderBy(desc(credentials.createdAt))

  const [verification] = await db
    .select({ verifiedAt: identityVerifications.verifiedAt })
    .from(identityVerifications)
    .where(and(eq(identityVerifications.guestId, id), eq(identityVerifications.result, 'passed')))
    .orderBy(identityVerifications.createdAt)
    .limit(1)

  const stays = await bookingsQuery(venueId).where(
    and(eq(bookings.venueId, venueId), eq(bookings.guestId, id)),
  )

  return { ...guest, devices, identityCheckedAt: verification?.verifiedAt ?? null, stays }
}
