import { and, count, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../shared/db/client.js'
import {
  credentials,
  entitlements,
  entries,
  guests,
  identityVerifications,
} from '../../shared/db/schema.js'
import { notFound } from '../../shared/lib/errors.js'
import { bookingsQuery } from './hotelBookings.js'

/** A hotel's guests and their stays. */

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
      stays: count(entries.id),
      lastStay: sql`max(${entries.enteredAt})`,
    })
    .from(entries)
    .innerJoin(guests, eq(guests.id, entries.guestId))
    .where(eq(entries.venueId, venueId))
    .groupBy(guests.id)
    .orderBy(desc(sql`max(${entries.enteredAt})`))

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
    .innerJoin(entries, eq(entries.guestId, guests.id))
    .where(and(eq(guests.id, id), eq(entries.venueId, venueId)))
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
      extra: identityVerifications.subjectExtra,
      documentLast4: identityVerifications.documentLast4,
    })
    .from(identityVerifications)
    .where(and(eq(identityVerifications.guestId, id), eq(identityVerifications.result, 'passed')))
    .orderBy(desc(identityVerifications.createdAt))
    .limit(1)

  const stays = await bookingsQuery(venueId, eq(entitlements.guestId, id))

  return {
    ...guest,
    devices,
    identityCheckedAt: verification?.verifiedAt ?? null,
    // Null for guests verified before these were stored — the check happened,
    // the address just was not kept. The screen says so rather than implying
    // the guest never gave one.
    address: verification?.address ?? null,
    careOf: verification?.careOf ?? null,
    // Answers to the venue's own questions, when it asked any: { question: answer }.
    extra: verification?.extra ?? null,
    maskedAadhaar: verification?.documentLast4 ? `XXXX XXXX ${verification.documentLast4}` : null,
    stays,
  }
}
