import { randomBytes } from 'node:crypto'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { config, isRemote } from '../../../config.js'
import { db } from '../../../shared/db/client.js'
import {
  entrySessions,
  flowDefinitions,
  gates,
  staffMemberships,
  staffSessions,
  venues,
} from '../../../shared/db/schema.js'
import { decrypt, newSessionToken, tokenHash } from '../../../shared/lib/crypto.js'
import { conflict, forbidden, invalid, notFound } from '../../../shared/lib/errors.js'
import { flowKeyFor } from '../../entry/index.js'
import { register } from '../../venues/index.js'
import { requestPasswordReset } from '../../venues/index.js'
import { listWaiting } from '../../visitors/index.js'
import { camel, like, maskEmail, maskPhone, whereAll } from './util.js'

/**
 * Venues and gates across the platform. Nothing here assumes a venue is a
 * hotel: hotel rooms, visitor hosts and events are each "whatever rows this
 * venue has", and an empty list is a normal answer.
 */

/** Refuses a destructive action against a hosted database unless the deploy opted in. */
export function assertDestructiveAllowed() {
  if (isRemote() && !config.ADMIN_ALLOW_DESTRUCTIVE) {
    throw forbidden(
      'destructive_disabled',
      'Destructive actions are off for this database. Set ADMIN_ALLOW_DESTRUCTIVE=true on the API to allow them.',
    )
  }
}

/* ------------------------------------------------------------------ */
/* Venues                                                              */
/* ------------------------------------------------------------------ */

export async function listVenues({ q, kind, status, cursor, limit }) {
  const { rows } = await db.execute(sql`
    SELECT v.id, v.name, v.kind, v.status, v.created_at, v.location, v.address->>'city' AS city,
      (SELECT count(*)::int FROM gates g WHERE g.venue_id = v.id AND g.status = 'active') AS gates,
      (SELECT max(e.entered_at) FROM entries e WHERE e.venue_id = v.id) AS last_entry_at,
      (SELECT su.email_enc FROM staff_memberships m JOIN staff_users su ON su.id = m.staff_id
         WHERE m.venue_id = v.id AND m.role = 'owner' ORDER BY m.created_at LIMIT 1) AS owner_email_enc
    FROM venues v
    WHERE ${q ? sql`v.name ILIKE ${like(q)}` : sql`true`}
      AND ${kind ? sql`v.kind = ${kind}` : sql`true`}
      AND ${status ? sql`v.status = ${status}` : sql`true`}
      AND ${cursor ? sql`v.id < ${cursor}` : sql`true`}
    ORDER BY v.id DESC
    LIMIT ${limit + 1}
  `)
  return rows.map(({ owner_email_enc: enc, ...row }) => ({ ...camel(row), ownerEmail: maskEmail(decrypt(enc)) }))
}

export async function getVenue(id) {
  const [venue] = await db.select().from(venues).where(eq(venues.id, id))
  if (!venue) throw notFound('That venue was not found.')

  const q = async (query) => (await db.execute(query)).rows.map(camel)
  const [staff, gateRows, hosts, events, rooms, entries, sessions, outbox, totals] = await Promise.all([
    q(sql`
      SELECT m.id AS membership_id, m.role, m.created_at AS member_since, su.id AS staff_id, su.display_name AS name,
        su.email_enc, su.status, su.email_verified_at, su.last_login_at,
        (SELECT count(*)::int FROM staff_sessions s WHERE s.staff_id = su.id AND s.venue_id = m.venue_id
           AND s.revoked_at IS NULL AND s.expires_at > now()) AS active_sessions
      FROM staff_memberships m JOIN staff_users su ON su.id = m.staff_id
      WHERE m.venue_id = ${id} ORDER BY m.created_at`),
    q(gatesQuery(sql`g.venue_id = ${id}`, 100)),
    q(sql`SELECT id, name, phone, active, created_at FROM visit_hosts WHERE venue_id = ${id} ORDER BY name`),
    q(sql`
      SELECT ev.id, ev.name, ev.active, ev.created_at, ev.organizer_id, h.name AS organizer,
        (SELECT count(*)::int FROM event_entry_details d WHERE d.event_id = ev.id) AS attendance
      FROM event_events ev LEFT JOIN visit_hosts h ON h.id = ev.organizer_id
      WHERE ev.venue_id = ${id} ORDER BY ev.created_at DESC`),
    q(sql`SELECT id, number, room_type FROM hotel_rooms WHERE venue_id = ${id} ORDER BY number LIMIT 500`),
    q(sql`
      SELECT e.id, e.entered_at, e.outcome, g.name AS gate, gu.display_name AS guest
      FROM entries e JOIN gates g ON g.id = e.gate_id LEFT JOIN guests gu ON gu.id = e.guest_id
      WHERE e.venue_id = ${id} ORDER BY e.id DESC LIMIT 20`),
    q(sql`
      SELECT s.id, s.status, s.cursor, s.created_at, s.updated_at, f.key AS flow_key, f.version AS flow_version
      FROM entry_sessions s JOIN flow_definitions f ON f.id = s.flow_id
      WHERE s.venue_id = ${id} ORDER BY s.id DESC LIMIT 20`),
    q(sql`
      SELECT id, kind, status, attempts, last_error, created_at, payload->>'to' AS recipient
      FROM outbox WHERE venue_id = ${id} ORDER BY id DESC LIMIT 20`),
    q(sql`
      SELECT (SELECT count(*)::int FROM entries WHERE venue_id = ${id}) AS entries,
             (SELECT count(*)::int FROM entry_sessions WHERE venue_id = ${id}) AS sessions`),
  ])

  return {
    venue,
    totals: totals[0],
    waiting: await listWaiting(id),
    staff: staff.map(({ emailEnc, ...s }) => ({ ...s, email: maskEmail(decrypt(emailEnc)) })),
    gates: gateRows,
    hosts: hosts.map((h) => ({ ...h, phone: maskPhone(h.phone) })),
    events,
    rooms,
    entries,
    sessions,
    outbox: outbox.map((o) => ({ ...o, recipient: maskPhone(o.recipient) })),
  }
}

/**
 * A venue of any kind with its owner and first gate, through the same
 * register() onboarding uses, inside the caller's audited transaction.
 *
 * The owner's password is random and never shown: they get the reset email
 * and choose their own, so no admin ever knows a venue's password.
 */
export async function createVenue(tx, input) {
  const flowKey = input.flowKey ?? flowKeyFor(input.kind)
  const result = await register(
    {
      account: { name: input.owner.name, email: input.owner.email, password: randomBytes(32).toString('base64url'), role: 'owner' },
      property: { name: input.name, kind: input.kind, city: input.city, address: input.address, country: input.country, timezone: input.timezone },
      rooms: [],
      hosts: input.hosts ?? [],
      business: input.business ?? {},
      services: [],
      essentials: {},
      contacts: {},
    },
    { tx, flowKey },
  )
  return { ...result, flowKey }
}

/** After commit: the owner sets a password from their inbox. */
export const sendOwnerInvite = (email) => requestPasswordReset(email).catch((err) => console.error('[admin] owner mail', err))

const PROFILE = ['name', 'kind', 'location', 'timezone', 'address', 'retentionDays']

export async function updateVenue(tx, id, patch) {
  const [before] = await tx.select().from(venues).where(eq(venues.id, id)).for('update')
  if (!before) throw notFound('That venue was not found.')
  const [after] = await tx.update(venues).set(patch).where(eq(venues.id, id)).returning()
  const pick = (v) => Object.fromEntries(PROFILE.map((k) => [k, v[k]]))
  return { before: pick(before), after: pick(after), result: after, venueId: id }
}

/**
 * Give or take away Aadhaar verification for a venue. Off means every guest and
 * visitor there gives a name, date of birth and address instead — hotels too.
 * Kept in settings so the guest path reads it with the session it already loads.
 */
export async function setAadhaarAccess(tx, id, enabled) {
  const [before] = await tx.select({ settings: venues.settings }).from(venues).where(eq(venues.id, id)).for('update')
  if (!before) throw notFound('That venue was not found.')
  const [after] = await tx
    .update(venues)
    .set({ settings: sql`COALESCE(${venues.settings}, '{}'::jsonb) || ${JSON.stringify({ aadhaarAccess: enabled })}::jsonb` })
    .where(eq(venues.id, id))
    .returning({ settings: venues.settings })
  return {
    before: { aadhaarAccess: before.settings?.aadhaarAccess !== false },
    after: { aadhaarAccess: enabled },
    result: { aadhaarAccess: enabled, settings: after.settings },
    venueId: id,
  }
}

/**
 * Whose dashboard a ChqIn view opens: the venue's owner, so support sees
 * exactly what the person who called sees. Any staff member if there's no owner.
 */
export async function viewAsTarget(venueId) {
  const rows = await db
    .select({ staffId: staffMemberships.staffId, role: staffMemberships.role })
    .from(staffMemberships)
    .where(eq(staffMemberships.venueId, venueId))
  if (!rows.length) throw conflict('no_staff', 'This venue has no staff account to view as.')
  return rows.find((r) => r.role === 'owner') ?? rows[0]
}

export async function updateSettings(tx, id, settings) {
  const [before] = await tx.select({ settings: venues.settings }).from(venues).where(eq(venues.id, id)).for('update')
  if (!before) throw notFound('That venue was not found.')
  const [after] = await tx.update(venues).set({ settings }).where(eq(venues.id, id)).returning({ settings: venues.settings })
  return { before: before.settings, after: after.settings, result: after, venueId: id }
}

/** Ends every way in for a venue: staff sessions, and guests mid-journey. */
async function cutOff(tx, id) {
  const now = new Date()
  await tx.update(staffSessions).set({ revokedAt: now }).where(and(eq(staffSessions.venueId, id), isNull(staffSessions.revokedAt)))
  await tx
    .update(entrySessions)
    .set({ status: 'revoked', updatedAt: now })
    .where(and(eq(entrySessions.venueId, id), inArray(entrySessions.status, ['in_progress', 'waiting'])))
}

export async function setVenueStatus(tx, id, status, reason) {
  const [before] = await tx.select().from(venues).where(eq(venues.id, id)).for('update')
  if (!before) throw notFound('That venue was not found.')
  if (before.status === status) throw conflict('unchanged', `The venue is already ${status}.`)
  const [after] = await tx
    .update(venues)
    .set({ status, statusReason: reason, statusChangedAt: new Date() })
    .where(eq(venues.id, id))
    .returning()
  if (status !== 'active') await cutOff(tx, id)
  return { before: { status: before.status }, after: { status: after.status }, result: after, venueId: id }
}

/**
 * The guarded delete. A venue with history (entries, sessions) is closed, not
 * deleted: its entries carry a retention period. A venue with none is deleted,
 * along with staff accounts that belonged to it and nowhere else.
 */
export async function deleteVenue(tx, id, confirm) {
  assertDestructiveAllowed()
  const [venue] = await tx.select().from(venues).where(eq(venues.id, id)).for('update')
  if (!venue) throw notFound('That venue was not found.')
  if (confirm !== venue.name) throw invalid('Type the venue name exactly to confirm.')

  const [{ history }] = (
    await tx.execute(sql`
      SELECT (EXISTS (SELECT 1 FROM entries WHERE venue_id = ${id})
           OR EXISTS (SELECT 1 FROM entry_sessions WHERE venue_id = ${id})) AS history`)
  ).rows

  if (history) {
    await tx.update(venues).set({ status: 'closed', statusReason: 'deleted by admin', statusChangedAt: new Date() }).where(eq(venues.id, id))
    await tx.update(gates).set({ status: 'revoked' }).where(eq(gates.venueId, id))
    await cutOff(tx, id)
    return { changes: { mode: 'closed', name: venue.name, kind: venue.kind }, result: { mode: 'closed' }, venueId: id }
  }

  const staffIds = (await tx.select({ id: staffMemberships.staffId }).from(staffMemberships).where(eq(staffMemberships.venueId, id))).map((r) => r.id)
  await tx.delete(venues).where(eq(venues.id, id))
  if (staffIds.length) {
    await tx.execute(sql`
      DELETE FROM staff_users su WHERE su.id IN ${staffIds}
        AND NOT EXISTS (SELECT 1 FROM staff_memberships m WHERE m.staff_id = su.id)`)
  }
  return { changes: { mode: 'deleted', name: venue.name, kind: venue.kind, staffRemoved: staffIds.length }, result: { mode: 'deleted' }, venueId: id }
}

/* ------------------------------------------------------------------ */
/* Gates                                                               */
/* ------------------------------------------------------------------ */

const gatesQuery = (where, limit) => sql`
  SELECT g.id, g.venue_id, v.name AS venue, v.kind AS venue_kind, g.name, g.kind, g.status, g.config,
    g.created_at, g.flow_id, f.key AS flow_key, f.version AS flow_version,
    (SELECT max(version) FROM flow_definitions WHERE key = f.key) AS flow_latest,
    (SELECT count(*)::int FROM entry_sessions s WHERE s.gate_id = g.id
       AND s.status IN ('in_progress','waiting') AND s.expires_at > now()) AS in_flight
  FROM gates g JOIN venues v ON v.id = g.venue_id JOIN flow_definitions f ON f.id = g.flow_id
  WHERE ${where}
  ORDER BY g.id DESC
  LIMIT ${limit}`

export async function listGates({ venueId, status, q, cursor, limit }) {
  const { rows } = await db.execute(
    gatesQuery(
      whereAll([
        venueId && sql`g.venue_id = ${venueId}`,
        status && sql`g.status = ${status}`,
        q && sql`(g.name ILIKE ${like(q)} OR v.name ILIKE ${like(q)})`,
        cursor && sql`g.id < ${cursor}`,
      ]),
      limit + 1,
    ),
  )
  return rows.map(camel)
}

/** One gate, with the clear token its card is printed from. */
export async function getGate(id) {
  const [row] = (await db.execute(gatesQuery(sql`g.id = ${id}`, 1))).rows.map(camel)
  if (!row) throw notFound('That gate was not found.')
  const [{ token }] = await db.select({ token: gates.token }).from(gates).where(eq(gates.id, id))
  return { ...row, token }
}

async function assertFlow(tx, flowId) {
  const [flow] = await tx.select({ id: flowDefinitions.id }).from(flowDefinitions).where(eq(flowDefinitions.id, flowId))
  if (!flow) throw invalid('That flow version does not exist.')
}

export async function createGate(tx, venueId, { name, kind, flowId, identity }) {
  const [venue] = await tx.select({ id: venues.id, kind: venues.kind }).from(venues).where(eq(venues.id, venueId))
  if (!venue) throw notFound('That venue was not found.')
  await assertFlow(tx, flowId)
  const token = newSessionToken()
  const [gate] = await tx
    .insert(gates)
    .values({
      venueId,
      name,
      kind,
      flowId,
      token,
      tokenHash: tokenHash(token),
      config: { identity: identity ?? (venue.kind === 'hotel' ? 'aadhaar' : 'basic') },
    })
    .returning()
  return { after: { name, kind, flowId, config: gate.config }, result: { id: gate.id }, targetId: gate.id, venueId }
}

const GATE_FIELDS = ['name', 'kind', 'flowId', 'config', 'status']
const pickGate = (g) => Object.fromEntries(GATE_FIELDS.map((k) => [k, g[k]]))

async function lockGate(tx, id) {
  const [gate] = await tx.select().from(gates).where(eq(gates.id, id)).for('update')
  if (!gate) throw notFound('That gate was not found.')
  return gate
}

export async function updateGate(tx, id, patch) {
  const before = await lockGate(tx, id)
  if (patch.flowId) await assertFlow(tx, patch.flowId)
  const [after] = await tx.update(gates).set(patch).where(eq(gates.id, id)).returning()
  return { before: pickGate(before), after: pickGate(after), result: pickGate(after), venueId: before.venueId }
}

export async function setGateStatus(tx, id, status) {
  const before = await lockGate(tx, id)
  if (before.status === status) throw conflict('unchanged', `The gate is already ${status}.`)
  await tx.update(gates).set({ status }).where(eq(gates.id, id))
  return { before: { status: before.status }, after: { status }, result: { status }, venueId: before.venueId }
}

/**
 * A new token for the gate's QR. The printed card stops working at once —
 * that is the point when a card is lost, and the warning when it isn't.
 */
export async function rotateGate(tx, id) {
  const before = await lockGate(tx, id)
  const token = newSessionToken()
  await tx.update(gates).set({ token, tokenHash: tokenHash(token) }).where(eq(gates.id, id))
  // The token itself never goes in the audit log: only that it changed.
  return { changes: { token: { before: 'previous', after: 'rotated' } }, result: { token }, venueId: before.venueId }
}

/** Flow keys and their newest version: the choices for a new venue or gate. */
export async function flowChoices() {
  const { rows } = await db.execute(sql`
    SELECT id, key, version, (version = max(version) OVER (PARTITION BY key)) AS latest
    FROM flow_definitions ORDER BY key, version DESC`)
  return rows
}
