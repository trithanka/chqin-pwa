import { and, count, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { db, transaction } from '../db/client.js'
import {
  bookingRooms,
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
import { newSessionToken, lookupHash, tokenHash, encrypt } from '../lib/crypto.js'
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
  // What this row *is*. A walk-in row is shaped identically but its id keys a
  // different table, and a client that can't tell them apart sends check-in
  // ids to /bookings/:id — which 404s, and looks like missing data.
  kind: sql`'booking'`,
  id: bookings.id,
  reference: bookings.bookingRef,
  guestId: bookings.guestId,
  guestName: bookings.guestName,
  // Every room the booking holds, as one string — "003" or "003, 004". A row
  // per room would repeat the booking once per room in every list.
  room: sql`string_agg(${rooms.number}, ', ' ORDER BY ${rooms.number})`,
  roomIds: sql`coalesce(array_agg(${bookingRooms.roomId}) FILTER (WHERE ${bookingRooms.roomId} IS NOT NULL), '{}')`,
  roomType: sql`min(${rooms.roomType})`,
  arrival: bookings.arrivalDate,
  departure: bookings.departureDate,
  status: bookings.status,
  source: bookings.pmsRef,
  partySize: bookings.partySize,
  roomsCount: bookings.roomsCount,
  checkedInAt: checkins.checkedInAt,
  journey: checkins.journey,
  // Whether a passkey signed this check-in. Identity is what a check-in now
  // rests on, so one can be finished on a phone that never enrolled — and the
  // desk must not be told "Passkey Verified" about a guest who has none.
  passkey: sql`${checkins.credentialId} IS NOT NULL`,
  // The check-in behind the reservation, when there is one. Room changes are
  // addressed by check-in, so a row without this can't be moved from Today.
  checkinId: checkins.id,
}

/**
 * Callers pass their extra condition in rather than chaining a second
 * `.where()`: the rooms are aggregated, so the query ends in a GROUP BY and a
 * later `.where()` would land on the wrong side of it.
 */
const bookingsQuery = (venueId, extra) =>
  db
    .select(bookingRow)
    .from(bookings)
    .leftJoin(bookingRooms, eq(bookingRooms.bookingId, bookings.id))
    .leftJoin(rooms, eq(rooms.id, bookingRooms.roomId))
    .leftJoin(checkins, eq(checkins.bookingId, bookings.id))
    .where(extra ? and(eq(bookings.venueId, venueId), extra) : eq(bookings.venueId, venueId))
    .groupBy(bookings.id, checkins.id)

export const listBookings = (venueId) =>
  bookingsQuery(venueId).orderBy(desc(bookings.arrivalDate), bookings.bookingRef)

export async function getBooking(venueId, id) {
  const [row] = await bookingsQuery(venueId, eq(bookings.id, id))
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

  const expected = await bookingsQuery(venueId, eq(bookings.arrivalDate, today))

  const walkIns = await db
    .select({
      kind: sql`'walkin'`,
      id: checkins.id,
      reference: sql`null`,
      guestId: checkins.guestId,
      guestName: guests.displayName,
      checkinId: checkins.id,
      partySize: checkins.partySize,
      roomsCount: checkins.roomsCount,
      roomId: checkins.roomId,
      roomIds: sql`case when ${checkins.roomId} is null then '{}'::uuid[] else array[${checkins.roomId}] end`,
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

  // The address and care-of come from the check rather than the guest row:
  // they are what UIDAI vouched for at a point in time, and the register wants
  // that, not something edited since. Newest first — a guest who verifies
  // again after moving should show the address they gave most recently.
  const [verification] = await db
    .select({
      verifiedAt: identityVerifications.verifiedAt,
      address: identityVerifications.subjectAddress,
      careOf: identityVerifications.subjectCareOf,
      documentLast4: identityVerifications.documentLast4,
    })
    .from(identityVerifications)
    .where(and(eq(identityVerifications.guestId, id), eq(identityVerifications.result, 'passed')))
    .orderBy(desc(identityVerifications.createdAt))
    .limit(1)

  const stays = await bookingsQuery(venueId).where(
    and(eq(bookings.venueId, venueId), eq(bookings.guestId, id)),
  )

  return {
    ...guest,
    devices,
    identityCheckedAt: verification?.verifiedAt ?? null,
    // Null for guests verified before these were stored — the check happened,
    // the address just was not kept. The screen says so rather than implying
    // the guest never gave one.
    address: verification?.address ?? null,
    careOf: verification?.careOf ?? null,
    maskedAadhaar: verification?.documentLast4 ? `XXXX XXXX ${verification.documentLast4}` : null,
    stays,
  }
}

/* ------------------------------------------------------------------ */
/* Settings — what the property offers                                 */
/* ------------------------------------------------------------------ */

/** The editable slice of `venues.settings`. `business` is not edited here. */
export async function getSettings(venueId) {
  const [venue] = await db
    .select({ settings: venues.settings })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1)

  if (!venue) throw notFound('That property no longer exists.')

  const settings = venue.settings ?? {}
  return {
    services: Array.isArray(settings.services) ? settings.services : [],
    essentials: settings.essentials ?? {},
    contacts: settings.contacts ?? {},
  }
}

/**
 * The three fields the settings screen owns, laid over what is already there.
 *
 * A merge rather than a replacement: the column is one JSON blob that also
 * holds `business` (the GSTIN and the registration name), which no screen here
 * edits and nothing on the guest side reads — so overwriting the column would
 * delete it silently, and stay unnoticed until someone looked for the GSTIN.
 */
export function mergeSettings(existing, { services, essentials, contacts }) {
  // A service with no number behind it is a tile the guest never sees
  // (services/stay.js drops it), so the numbers of services that were turned
  // off are dropped here rather than kept as orphans in the column.
  const kept = Object.fromEntries(
    Object.entries(contacts).filter(([key, number]) => services.includes(key) && number),
  )

  return { ...(existing ?? {}), services, essentials, contacts: kept }
}

export async function saveSettings(venueId, patch) {
  const [venue] = await db
    .select({ settings: venues.settings })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1)

  if (!venue) throw notFound('That property no longer exists.')

  const settings = mergeSettings(venue.settings, patch)

  await db.update(venues).set({ settings }).where(eq(venues.id, venueId))

  const { business: _business, ...editable } = settings
  return editable
}

/* ------------------------------------------------------------------ */
/* Rooms — assigning one to a walk-in                                  */
/* ------------------------------------------------------------------ */

/**
 * The venue's rooms, and which are spoken for right now.
 *
 * "Occupied" means some current stay already points at it. A room the desk
 * assigns today and never clears would otherwise look free tomorrow, so the
 * window matches the one Today's in-house count uses: since yesterday.
 */
export async function listRooms(venueId) {
  const rows = await db
    .select({
      id: rooms.id,
      number: rooms.number,
      roomType: rooms.roomType,
      takenBy: checkins.id,
    })
    .from(rooms)
    .leftJoin(
      checkins,
      and(eq(checkins.roomId, rooms.id), sql`${checkins.checkedInAt}::date >= CURRENT_DATE - 1`),
    )
    .where(eq(rooms.venueId, venueId))
    .orderBy(rooms.number)

  return rows
}

/**
 * Put a walk-in in a room, or take them out of one.
 *
 * A walk-in arrives with no reservation, so nothing has decided a room for
 * them — until now that meant the column stayed null forever and the desk had
 * no way to say where the guest actually is.
 *
 * Both ids are checked against the venue in the same statement rather than
 * read first and trusted: an id from a client is a guess about someone else's
 * property until the `where` says otherwise.
 */
/**
 * Which rooms a stay holds, set by the desk.
 *
 * Takes the whole list rather than one room, because "give them 003 and 004"
 * is one decision and two calls would leave a moment where the guest has half
 * their rooms. An empty list means the desk has taken the rooms back.
 *
 * The booking is written here, on the first assignment: a walk-in exists only
 * as a check-in until the desk agrees to something, and this is that moment.
 * What the guest said on the way in — nights, how many people, how many rooms
 * — is what it is created from, so their answers become the reservation rather
 * than a note nobody reads.
 */
export async function assignRoom(venueId, checkinId, roomIds) {
  const wanted = [...new Set(roomIds ?? [])]

  return transaction(async (tx) => {
    const found = wanted.length
      ? await tx
          .select({ id: rooms.id, number: rooms.number })
          .from(rooms)
          .where(and(inArray(rooms.id, wanted), eq(rooms.venueId, venueId)))
      : []

    if (found.length !== wanted.length) throw notFound('No such room here.')

    const [stay] = await tx
      .select({
        id: checkins.id,
        bookingId: checkins.bookingId,
        guestId: checkins.guestId,
        guestName: guests.displayName,
        checkedInAt: checkins.checkedInAt,
        nights: checkins.nights,
        partySize: checkins.partySize,
        roomsCount: checkins.roomsCount,
      })
      .from(checkins)
      .leftJoin(guests, eq(guests.id, checkins.guestId))
      .where(and(eq(checkins.id, checkinId), eq(checkins.venueId, venueId)))
      .limit(1)

    if (!stay) throw notFound('No such check-in here.')

    let bookingId = stay.bookingId

    if (wanted.length && !bookingId) {
      const arrival = (stay.checkedInAt ?? new Date()).toISOString().slice(0, 10)
      // The guest's own answer decides the departure date. One night only when
      // they weren't asked — every check-in taken before that screen existed.
      const departure = new Date(`${arrival}T00:00:00Z`)
      departure.setUTCDate(departure.getUTCDate() + Math.max(stay.nights ?? 1, 1))

      const [booking] = await tx
        .insert(bookings)
        .values({
          venueId,
          // Not a PMS reference and shouldn't look like one: WI marks a stay
          // this system created, and the check-in's own id keeps it unique
          // per venue without a counter to race on.
          bookingRef: `WI-${stay.id.slice(-6).toUpperCase()}`,
          guestName: stay.guestName ?? 'Walk-in guest',
          guestId: stay.guestId,
          arrivalDate: arrival,
          departureDate: departure.toISOString().slice(0, 10),
          partySize: stay.partySize,
          roomsCount: stay.roomsCount,
          status: 'checked_in',
        })
        .returning({ id: bookings.id })

      bookingId = booking.id
    }

    if (bookingId) {
      // Replaced wholesale: the list the desk sent is the answer, and working
      // out which rows to add and which to remove is the same two statements.
      await tx.delete(bookingRooms).where(eq(bookingRooms.bookingId, bookingId))
      if (wanted.length) {
        await tx.insert(bookingRooms).values(wanted.map((roomId) => ({ bookingId, roomId })))
      }
    }

    await tx
      .update(checkins)
      // checkins.roomId is where *this guest* sleeps; a party with two rooms
      // still has one first room, and the guest's own stay screen shows it.
      .set({ roomId: wanted[0] ?? null, bookingId })
      .where(eq(checkins.id, checkinId))

    return {
      id: checkinId,
      roomIds: wanted,
      rooms: found.map((r) => r.number).sort(),
      bookingId,
    }
  })
}

/* ------------------------------------------------------------------ */
/* The property itself                                                 */
/* ------------------------------------------------------------------ */

/** What the owner can change about the property. */
export async function getProperty(venueId) {
  const [venue] = await db
    .select({
      name: venues.name,
      kind: venues.kind,
      location: venues.location,
      timezone: venues.timezone,
      address: venues.address,
    })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1)

  if (!venue) throw notFound('That property no longer exists.')
  return venue
}

/**
 * `address` is merged rather than replaced, for the same reason
 * `venues.settings` is: it is one JSON column holding fields this screen
 * doesn't show, and a spread of what the form knows about would delete the
 * rest without anything noticing.
 */
export async function saveProperty(venueId, patch) {
  const current = await getProperty(venueId)

  const [row] = await db
    .update(venues)
    .set({
      name: patch.name,
      kind: patch.kind,
      location: patch.location ?? null,
      timezone: patch.timezone,
      address: { ...current.address, ...patch.address },
    })
    .where(eq(venues.id, venueId))
    .returning({ name: venues.name, kind: venues.kind, location: venues.location })

  return row
}

/* ------------------------------------------------------------------ */
/* Rooms                                                               */
/* ------------------------------------------------------------------ */

/**
 * Add rooms, skipping any number the property already has.
 *
 * A duplicate is what happens when someone adds "101-110" twice, and the
 * unique index would turn the whole batch into an error rather than adding the
 * eight that were new. Skipping says what happened instead.
 */
export async function addRooms(venueId, list) {
  const added = await db
    .insert(rooms)
    .values(list.map(({ number, type }) => ({ venueId, number, roomType: type ?? null })))
    .onConflictDoNothing({ target: [rooms.venueId, rooms.number] })
    .returning({ id: rooms.id, number: rooms.number })

  return { added, skipped: list.length - added.length }
}

/**
 * Remove a room, unless someone is in it.
 *
 * A stay points at its room, so deleting one out from under a guest would
 * either fail on the constraint or erase where they are. Refusing with the
 * reason is the only answer that helps the person at the desk.
 */
export async function removeRoom(venueId, roomId) {
  const [room] = await db
    .select({ id: rooms.id })
    .from(rooms)
    .where(and(eq(rooms.id, roomId), eq(rooms.venueId, venueId)))
    .limit(1)

  if (!room) throw notFound('No such room here.')

  const [occupied] = await db
    .select({ id: checkins.id })
    .from(checkins)
    .where(and(eq(checkins.roomId, roomId), sql`${checkins.checkedInAt}::date >= CURRENT_DATE - 1`))
    .limit(1)

  if (occupied) {
    throw conflict('room_occupied', 'Someone is in that room. Move them first.')
  }

  await db.delete(rooms).where(and(eq(rooms.id, roomId), eq(rooms.venueId, venueId)))
  return { id: roomId }
}
