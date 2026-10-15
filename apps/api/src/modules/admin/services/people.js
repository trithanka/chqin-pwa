import { randomBytes } from 'node:crypto'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '../../../shared/db/client.js'
import {
  credentials,
  entitlements,
  entries,
  entrySessions,
  eventEntryDetails,
  guests,
  hotelBookings,
  identityVerifications,
  outbox,
  staffMemberships,
  staffSessions,
  staffUsers,
} from '../../../shared/db/schema.js'
import { decrypt, lookupHash } from '../../../shared/lib/crypto.js'
import { conflict, invalid, notFound } from '../../../shared/lib/errors.js'
import { hashPassword } from '../../../shared/lib/passwords.js'
import { requestPasswordReset } from '../../venues/index.js'
import { camel, maskAadhaar, maskEmail, maskPhone, whereAll } from './util.js'
import { assertDestructiveAllowed } from './venues.js'

/**
 * Venue staff and guests, as the ChqIn team sees them. Contact details are
 * shown masked; the plaintext leaves only through `reveal`, which the route
 * audits first. Lookups by email or phone go through the keyed hash, never a
 * plaintext scan — there is no plaintext to scan.
 */

/* ------------------------------------------------------------------ */
/* Staff                                                               */
/* ------------------------------------------------------------------ */

export async function listStaff({ email, q, cursor, limit }) {
  const { rows } = await db.execute(sql`
    SELECT su.id, su.display_name AS name, su.email_enc, su.status, su.email_verified_at, su.created_at, su.last_login_at,
      (SELECT count(*)::int FROM staff_memberships m WHERE m.staff_id = su.id) AS venues,
      (SELECT string_agg(v.name, ', ') FROM staff_memberships m JOIN venues v ON v.id = m.venue_id WHERE m.staff_id = su.id) AS venue_names
    FROM staff_users su
    WHERE ${whereAll([
      email && sql`su.email_hmac = ${lookupHash(email)}`,
      q && sql`su.display_name ILIKE ${`%${q.replace(/[%_\\]/g, '\\$&')}%`}`,
      cursor && sql`su.id < ${cursor}`,
    ])}
    ORDER BY su.id DESC LIMIT ${limit + 1}`)
  return rows.map(({ email_enc: enc, ...r }) => ({ ...camel(r), email: maskEmail(decrypt(enc)) }))
}

export async function getStaff(id) {
  const [user] = await db.select().from(staffUsers).where(eq(staffUsers.id, id))
  if (!user) throw notFound('That staff account was not found.')
  const q = async (query) => (await db.execute(query)).rows.map(camel)
  const [memberships, sessions] = await Promise.all([
    q(sql`
      SELECT m.id, m.role, m.created_at, v.id AS venue_id, v.name AS venue, v.kind, v.status AS venue_status
      FROM staff_memberships m JOIN venues v ON v.id = m.venue_id WHERE m.staff_id = ${id} ORDER BY m.created_at`),
    q(sql`
      SELECT s.id, s.role, s.created_at, s.last_seen_at, s.expires_at, s.revoked_at, v.name AS venue,
        (s.revoked_at IS NULL AND s.expires_at > now()) AS active
      FROM staff_sessions s JOIN venues v ON v.id = s.venue_id WHERE s.staff_id = ${id} ORDER BY s.id DESC LIMIT 50`),
  ])
  return {
    id: user.id,
    name: user.displayName,
    email: maskEmail(decrypt(user.emailEnc)),
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    memberships,
    sessions,
  }
}

const revokeStaff = (tx, staffId, venueId) =>
  tx
    .update(staffSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(staffSessions.staffId, staffId), isNull(staffSessions.revokedAt), venueId ? eq(staffSessions.venueId, venueId) : undefined))
    .returning({ id: staffSessions.id })

async function lockStaff(tx, id) {
  const [user] = await tx.select().from(staffUsers).where(eq(staffUsers.id, id)).for('update')
  if (!user) throw notFound('That staff account was not found.')
  return user
}

export async function revokeStaffSessions(tx, id) {
  await lockStaff(tx, id)
  const ended = await revokeStaff(tx, id)
  return { changes: { sessionsRevoked: ended.length }, result: { revoked: ended.length } }
}

/**
 * A forced reset: the old password stops working now (replaced with random
 * bytes nobody knows), every session ends, and the owner of the address gets
 * the usual reset link. The mail is sent by the caller after commit.
 */
export async function forceReset(tx, id) {
  const user = await lockStaff(tx, id)
  await tx.update(staffUsers).set({ passwordHash: await hashPassword(randomBytes(32).toString('base64url')) }).where(eq(staffUsers.id, id))
  const ended = await revokeStaff(tx, id)
  return { changes: { password: 'replaced', sessionsRevoked: ended.length }, result: { email: decrypt(user.emailEnc) } }
}

export const sendReset = (email) => email && requestPasswordReset(email).catch((err) => console.error('[admin] reset mail', err))

export async function verifyStaffEmail(tx, id) {
  const user = await lockStaff(tx, id)
  if (user.emailVerifiedAt) throw conflict('unchanged', 'That address is already verified.')
  const now = new Date()
  await tx.update(staffUsers).set({ emailVerifiedAt: now }).where(eq(staffUsers.id, id))
  return { before: { emailVerifiedAt: null }, after: { emailVerifiedAt: now }, result: { ok: true } }
}

export async function setStaffStatus(tx, id, status) {
  const user = await lockStaff(tx, id)
  if (user.status === status) throw conflict('unchanged', `The account is already ${status}.`)
  await tx.update(staffUsers).set({ status }).where(eq(staffUsers.id, id))
  // Sessions don't re-read the account on each request, so deactivating ends them here.
  if (status !== 'active') await revokeStaff(tx, id)
  return { before: { status: user.status }, after: { status }, result: { status } }
}

export async function setMembershipRole(tx, membershipId, role) {
  const [m] = await tx.select().from(staffMemberships).where(eq(staffMemberships.id, membershipId)).for('update')
  if (!m) throw notFound('That membership was not found.')
  if (m.role === role) throw conflict('unchanged', `The role is already ${role}.`)
  await tx.update(staffMemberships).set({ role }).where(eq(staffMemberships.id, membershipId))
  // A session carries the role it was issued with; end those at this venue.
  await revokeStaff(tx, m.staffId, m.venueId)
  return { before: { role: m.role }, after: { role }, result: { role }, venueId: m.venueId, targetId: m.staffId }
}

/* ------------------------------------------------------------------ */
/* Guests                                                              */
/* ------------------------------------------------------------------ */

export async function listGuests({ name, phone, email, cursor, limit }) {
  const { rows } = await db.execute(sql`
    SELECT g.id, g.display_name AS name, g.status, g.created_at, g.email_enc, g.phone_enc,
      (SELECT count(*)::int FROM credentials c WHERE c.guest_id = g.id AND c.revoked_at IS NULL) AS passkeys,
      (SELECT count(*)::int FROM entries e WHERE e.guest_id = g.id) AS entries,
      (SELECT max(e.entered_at) FROM entries e WHERE e.guest_id = g.id) AS last_entry_at
    FROM guests g
    WHERE ${whereAll([
      // A prefix match, so the lower(display_name) index serves it.
      name && sql`lower(g.display_name) LIKE ${`${name.toLowerCase().replace(/[%_\\]/g, '\\$&')}%`}`,
      phone && sql`g.phone_hmac = ${lookupHash(phone.replace(/[^\d+]/g, ''))}`,
      email && sql`g.email_hmac = ${lookupHash(email)}`,
      cursor && sql`g.id < ${cursor}`,
    ])}
    ORDER BY g.id DESC LIMIT ${limit + 1}`)
  return rows.map(({ email_enc: e, phone_enc: p, ...r }) => ({ ...camel(r), email: maskEmail(decrypt(e)), phone: maskPhone(decrypt(p)) }))
}

export async function getGuest(id) {
  const [guest] = await db.select().from(guests).where(eq(guests.id, id))
  if (!guest) throw notFound('That guest was not found.')
  const q = async (query) => (await db.execute(query)).rows.map(camel)
  const [creds, checks, history] = await Promise.all([
    q(sql`
      SELECT id, device_label, created_at, last_used_at, revoked_at, backed_up, sign_count
      FROM credentials WHERE guest_id = ${id} ORDER BY created_at DESC`),
    q(sql`
      SELECT id, method, provider, result, document_type, document_last4, verified_at, created_at, consent
      FROM identity_verifications WHERE guest_id = ${id} ORDER BY created_at DESC LIMIT 50`),
    q(sql`
      SELECT e.id, e.entered_at, e.outcome, v.id AS venue_id, v.name AS venue, v.kind, g.name AS gate,
        h.journey, vd.purpose, ed.company
      FROM entries e JOIN venues v ON v.id = e.venue_id JOIN gates g ON g.id = e.gate_id
      LEFT JOIN hotel_entry_details h ON h.entry_id = e.id
      LEFT JOIN visit_entry_details vd ON vd.entry_id = e.id
      LEFT JOIN event_entry_details ed ON ed.entry_id = e.id
      WHERE e.guest_id = ${id} ORDER BY e.id DESC LIMIT 50`),
  ])
  return {
    id: guest.id,
    name: guest.displayName,
    status: guest.status,
    email: maskEmail(decrypt(guest.emailEnc)),
    phone: maskPhone(decrypt(guest.phoneEnc)),
    // Year only: enough to tell two people apart, not enough to be the date.
    birthYear: guest.dateOfBirth ? String(guest.dateOfBirth).slice(0, 4) : null,
    gender: guest.gender,
    createdAt: guest.createdAt,
    credentials: creds,
    verifications: checks.map(({ documentLast4, ...v }) => ({ ...v, document: maskAadhaar(documentLast4) })),
    entries: history,
  }
}

/** The plaintext of one field. The route has already written the audit row. */
export async function revealGuest(id, field) {
  const [guest] = await db.select({ emailEnc: guests.emailEnc, phoneEnc: guests.phoneEnc }).from(guests).where(eq(guests.id, id))
  if (!guest) throw notFound('That guest was not found.')
  return { [field]: decrypt(field === 'email' ? guest.emailEnc : guest.phoneEnc) }
}

export async function revokeCredential(tx, credentialId) {
  const [cred] = await tx.select().from(credentials).where(eq(credentials.id, credentialId)).for('update')
  if (!cred) throw notFound('That passkey was not found.')
  if (cred.revokedAt) throw conflict('unchanged', 'That passkey is already revoked.')
  const now = new Date()
  await tx.update(credentials).set({ revokedAt: now }).where(eq(credentials.id, credentialId))
  return { before: { revokedAt: null }, after: { revokedAt: now }, result: { ok: true }, targetId: cred.guestId }
}

export async function setGuestStatus(tx, id, status) {
  const [guest] = await tx.select({ status: guests.status }).from(guests).where(eq(guests.id, id)).for('update')
  if (!guest) throw notFound('That guest was not found.')
  if (guest.status === status) throw conflict('unchanged', `The guest is already ${status}.`)
  await tx.update(guests).set({ status, updatedAt: new Date() }).where(eq(guests.id, id))
  return { before: { status: guest.status }, after: { status }, result: { status } }
}

/** Session state keys that hold what a guest typed about themselves. */
const PERSONAL_STATE_KEYS = ['company', 'designation', 'name', 'phone', 'email']

/**
 * Erasure: personal data goes, the record that someone entered stays.
 *
 * Entries carry a retention period, so they are kept with the guest link set
 * to null (a tombstone). Everything that says who the person was — contact
 * details, the identity check's demographics, what they typed into forms, the
 * name on messages about them — is cleared. See docs/admin-panel.md for the
 * table-by-table list.
 */
export async function eraseGuest(tx, id, confirm) {
  assertDestructiveAllowed()
  const [guest] = await tx.select().from(guests).where(eq(guests.id, id)).for('update')
  if (!guest) throw notFound('That guest was not found.')
  if (confirm !== guest.displayName) throw invalid("Type the guest's name exactly to confirm.")

  const sessionIds = (await tx.select({ id: entrySessions.id }).from(entrySessions).where(eq(entrySessions.guestId, id))).map((r) => r.id)
  const entryIds = (await tx.select({ id: entries.id }).from(entries).where(eq(entries.guestId, id))).map((r) => r.id)
  const bookingIds = (await tx.select({ id: entitlements.id }).from(entitlements).where(eq(entitlements.guestId, id))).map((r) => r.id)

  // The check's result and consent stay as proof it happened; who it was about goes.
  const checks = await tx
    .update(identityVerifications)
    .set({
      guestId: null,
      subjectName: null,
      subjectDob: null,
      subjectGender: null,
      subjectAddress: null,
      subjectCareOf: null,
      documentHmac: null,
      providerRef: null,
      artifactUri: null,
    })
    .where(sessionIds.length ? sql`${identityVerifications.guestId} = ${id} OR ${identityVerifications.sessionId} IN ${sessionIds}` : eq(identityVerifications.guestId, id))
    .returning({ id: identityVerifications.id })

  if (sessionIds.length) {
    await tx
      .update(entrySessions)
      .set({ guestId: null, state: sql`${entrySessions.state} - ${sql.raw(`'{${PERSONAL_STATE_KEYS.join(',')}}'::text[]`)}` })
      .where(inArray(entrySessions.id, sessionIds))
    // The message text and template parameters name the guest. One not yet
    // sent is cancelled rather than sent without them.
    await tx
      .update(outbox)
      .set({
        payload: sql`(${outbox.payload} - 'template' - 'text') || '{"text":"[erased]"}'::jsonb`,
        status: sql`CASE WHEN ${outbox.status} = 'pending' THEN 'cancelled' ELSE ${outbox.status} END`,
      })
      .where(sql`${outbox.payload}->>'sessionId' IN ${sessionIds}`)
  }
  if (bookingIds.length) {
    await tx.update(hotelBookings).set({ guestName: 'Erased guest' }).where(inArray(hotelBookings.entitlementId, bookingIds))
    await tx.update(entitlements).set({ guestId: null }).where(inArray(entitlements.id, bookingIds))
  }
  if (entryIds.length) {
    await tx.update(eventEntryDetails).set({ company: '[erased]', designation: '[erased]' }).where(inArray(eventEntryDetails.entryId, entryIds))
    await tx.update(entries).set({ guestId: null }).where(inArray(entries.id, entryIds))
  }
  // Credentials and pending challenges cascade with the row.
  await tx.delete(guests).where(eq(guests.id, id))

  return {
    changes: { erased: { entriesKept: entryIds.length, sessions: sessionIds.length, verificationsScrubbed: checks.length, bookings: bookingIds.length } },
    result: { entriesKept: entryIds.length },
  }
}
