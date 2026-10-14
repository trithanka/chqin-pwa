import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { entrySessions } from '../../db/schema/index.js'
import { conflict, notFound } from '../../lib/errors.js'
import { camel, whereAll } from './util.js'

/**
 * Entries and sessions across every venue: the audit trail of who got in, and
 * the journeys still under way. Read-mostly; ending a session is the one write.
 */

const rowsOf = async (query) => (await db.execute(query)).rows.map(camel)

/** Staff ids in a trail (`by`) → names, so "approved by" reads as a person. */
async function staffNames(trail) {
  const ids = [...new Set((trail ?? []).map((t) => t.by).filter(Boolean))]
  if (!ids.length) return {}
  const rows = await rowsOf(sql`SELECT id, display_name FROM staff_users WHERE id IN ${ids}`)
  return Object.fromEntries(rows.map((r) => [r.id, r.displayName]))
}

export async function listEntries({ venueId, gateId, guestId, outcome, from, to, idempotencyKey, cursor, limit }) {
  return rowsOf(sql`
    SELECT e.id, e.entered_at, e.outcome, e.idempotency_key, e.venue_id, v.name AS venue, v.kind AS venue_kind,
      g.name AS gate, e.guest_id, gu.display_name AS guest
    FROM entries e JOIN venues v ON v.id = e.venue_id JOIN gates g ON g.id = e.gate_id
    LEFT JOIN guests gu ON gu.id = e.guest_id
    WHERE ${whereAll([
      venueId && sql`e.venue_id = ${venueId}`,
      gateId && sql`e.gate_id = ${gateId}`,
      guestId && sql`e.guest_id = ${guestId}`,
      outcome && sql`e.outcome = ${outcome}`,
      from && sql`e.entered_at >= ${from}::date`,
      to && sql`e.entered_at < ${to}::date + 1`,
      idempotencyKey && sql`e.idempotency_key = ${idempotencyKey}`,
      cursor && sql`e.id < ${cursor}`,
    ])}
    ORDER BY e.id DESC LIMIT ${limit + 1}`)
}

export async function getEntry(id) {
  const [entry] = await rowsOf(sql`
    SELECT e.*, v.name AS venue, v.kind AS venue_kind, g.name AS gate, g.kind AS gate_kind,
      gu.display_name AS guest, c.device_label AS credential_device,
      s.flow_id, f.key AS flow_key, f.version AS flow_version, s.created_at AS scanned_at
    FROM entries e JOIN venues v ON v.id = e.venue_id JOIN gates g ON g.id = e.gate_id
    LEFT JOIN guests gu ON gu.id = e.guest_id
    LEFT JOIN credentials c ON c.id = e.credential_id
    LEFT JOIN entry_sessions s ON s.id = e.session_id
    LEFT JOIN flow_definitions f ON f.id = s.flow_id
    WHERE e.id = ${id}`)
  if (!entry) throw notFound('That entry was not found.')

  // Whichever vertical rows this entry has. None is a normal answer.
  const [[hotel], [visit], [event]] = await Promise.all([
    rowsOf(sql`
      SELECT h.journey, h.nights, h.party_size, h.rooms_count, r.number AS room, b.guest_name AS booked_as,
        b.arrival_date, b.departure_date, en.ref AS booking_ref
      FROM hotel_entry_details h LEFT JOIN hotel_rooms r ON r.id = h.room_id
      LEFT JOIN entitlements en ON en.id = ${entry.entitlementId}
      LEFT JOIN hotel_bookings b ON b.entitlement_id = en.id
      WHERE h.entry_id = ${id}`),
    rowsOf(sql`
      SELECT d.purpose, h.name AS host FROM visit_entry_details d LEFT JOIN visit_hosts h ON h.id = d.host_id WHERE d.entry_id = ${id}`),
    rowsOf(sql`
      SELECT ev.name AS event, d.company, d.designation FROM event_entry_details d
      LEFT JOIN event_events ev ON ev.id = d.event_id WHERE d.entry_id = ${id}`),
  ])
  const trail = entry.data?.trail ?? []
  return {
    ...entry,
    trail,
    staff: await staffNames(trail),
    detail: { hotel: hotel ?? null, visit: visit ?? null, event: event ?? null },
  }
}

/**
 * Sessions, optionally only the stuck ones: waiting on staff, or in progress
 * and untouched, for longer than `olderThan` minutes while still unexpired.
 */
export async function listSessions({ venueId, status, stuck, olderThan, cursor, limit }) {
  const minutes = Math.max(Number(olderThan) || 15, 1)
  return rowsOf(sql`
    SELECT s.id, s.status, s.cursor, s.version, s.created_at, s.updated_at, s.expires_at,
      s.state->>'purpose' AS purpose, v.id AS venue_id, v.name AS venue, g.name AS gate,
      f.key AS flow_key, f.version AS flow_version, jsonb_array_length(f.steps)::int AS step_count,
      f.steps -> s.cursor ->> 'type' AS step, gu.display_name AS guest
    FROM entry_sessions s JOIN venues v ON v.id = s.venue_id JOIN gates g ON g.id = s.gate_id
    JOIN flow_definitions f ON f.id = s.flow_id LEFT JOIN guests gu ON gu.id = s.guest_id
    WHERE ${whereAll([
      venueId && sql`s.venue_id = ${venueId}`,
      status && sql`s.status = ${status}`,
      stuck === 'waiting' && sql`s.status = 'waiting' AND s.updated_at < now() - ${minutes} * interval '1 minute' AND s.expires_at > now()`,
      stuck === 'idle' && sql`s.status = 'in_progress' AND s.updated_at < now() - ${minutes} * interval '1 minute' AND s.expires_at > now()`,
      cursor && sql`s.id < ${cursor}`,
    ])}
    ORDER BY s.id DESC LIMIT ${limit + 1}`)
}

export async function getSession(id) {
  const [session] = await rowsOf(sql`
    SELECT s.id, s.status, s.cursor, s.version, s.state, s.trail, s.created_at, s.updated_at, s.expires_at,
      s.guest_id, s.entitlement_id, v.id AS venue_id, v.name AS venue, g.id AS gate_id, g.name AS gate,
      f.id AS flow_id, f.key AS flow_key, f.version AS flow_version, f.steps,
      gu.display_name AS guest, (SELECT id FROM entries WHERE session_id = s.id LIMIT 1) AS entry_id
    FROM entry_sessions s JOIN venues v ON v.id = s.venue_id JOIN gates g ON g.id = s.gate_id
    JOIN flow_definitions f ON f.id = s.flow_id LEFT JOIN guests gu ON gu.id = s.guest_id
    WHERE s.id = ${id}`)
  if (!session) throw notFound('That session was not found.')
  return { ...session, staff: await staffNames(session.trail) }
}

/** Expire or revoke an open session. The guest's screen says the QR is no longer valid. */
export async function endSession(tx, id, status) {
  const [s] = await tx.select().from(entrySessions).where(eq(entrySessions.id, id)).for('update')
  if (!s) throw notFound('That session was not found.')
  if (!['in_progress', 'waiting'].includes(s.status)) throw conflict('session_closed', `That session is already ${s.status}.`)
  await tx
    .update(entrySessions)
    .set({ status, updatedAt: new Date(), version: sql`${entrySessions.version} + 1` })
    .where(and(eq(entrySessions.id, id), inArray(entrySessions.status, ['in_progress', 'waiting'])))
  return { before: { status: s.status }, after: { status }, result: { status }, venueId: s.venueId }
}
