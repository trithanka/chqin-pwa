import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { entrySessions, eventEvents, gates, guests, venues, visitHosts } from '../db/schema/index.js'
import { notFound } from '../lib/errors.js'

/**
 * What a venue that hosts visitors sees and manages: who is waiting, who came
 * in today, and the hosts and events visitors choose between. Everything is
 * scoped by the caller's venue — the id never comes from the request.
 */

const PURPOSE = { meeting: 'Meeting', office: 'Office work', event: 'Event' }

/** Visitors waiting for a person to decide, oldest first. */
export async function listWaiting(venueId) {
  const rows = await db
    .select({
      sessionId: entrySessions.id,
      visitor: guests.displayName,
      purpose: sql`${entrySessions.state}->>'purpose'`,
      host: visitHosts.name,
      held: sql`${entrySessions.state}->>'approval' = 'holding'`,
      since: entrySessions.updatedAt,
    })
    .from(entrySessions)
    .innerJoin(guests, eq(guests.id, entrySessions.guestId))
    .leftJoin(visitHosts, sql`${visitHosts.id}::text = ${entrySessions.state}->>'host'`)
    .where(
      and(
        eq(entrySessions.venueId, venueId),
        eq(entrySessions.status, 'waiting'),
        sql`${entrySessions.state} ? 'host'`,
        sql`${entrySessions.expiresAt} > now()`,
      ),
    )
    .orderBy(entrySessions.updatedAt)

  return rows.map((r) => ({ ...r, purposeLabel: PURPOSE[r.purpose] ?? r.purpose, since: r.since.toISOString() }))
}

/** Today's arrivals in the venue's own time, with the counts a front desk watches. */
export async function arrivals(venueId) {
  const [venue] = await db.select({ tz: venues.timezone }).from(venues).where(eq(venues.id, venueId))
  if (!venue) throw notFound()
  const today = sql`(now() AT TIME ZONE ${venue.tz})::date`

  const admitted = await db.execute(sql`
    SELECT e.id, g.display_name AS visitor, e.entered_at,
           COALESCE(ev.name, h.name) AS destination,
           CASE WHEN ed.entry_id IS NOT NULL THEN 'event' ELSE vd.purpose END AS purpose,
           ed.company, ed.designation
    FROM entries e
    LEFT JOIN guests g ON g.id = e.guest_id
    LEFT JOIN visit_entry_details vd ON vd.entry_id = e.id
    LEFT JOIN visit_hosts h ON h.id = vd.host_id
    LEFT JOIN event_entry_details ed ON ed.entry_id = e.id
    LEFT JOIN event_events ev ON ev.id = ed.event_id
    WHERE e.venue_id = ${venueId}
      AND (vd.entry_id IS NOT NULL OR ed.entry_id IS NOT NULL)
      AND (e.entered_at AT TIME ZONE ${venue.tz})::date = ${today}
    ORDER BY e.entered_at DESC
    LIMIT 200`)

  const waiting = await listWaiting(venueId)

  const rows = [
    ...waiting.map((w) => ({
      visitor: w.visitor,
      purpose: w.purposeLabel,
      destination: w.host,
      status: w.held ? 'Waiting' : 'Pending',
      at: w.since,
    })),
    ...admitted.rows.map((r) => ({
      visitor: r.visitor ?? 'Unknown',
      purpose: PURPOSE[r.purpose] ?? r.purpose,
      destination: r.destination,
      company: r.company,
      designation: r.designation,
      status: r.purpose === 'event' ? 'Checked in' : 'Confirmed',
      at: new Date(r.entered_at).toISOString(),
    })),
  ]

  return {
    counts: {
      arrivals: rows.length,
      waiting: waiting.length,
      events: admitted.rows.filter((r) => r.purpose === 'event').length,
    },
    rows,
  }
}

/* ------------------------------------------------------------------ */
/* Hosts                                                              */
/* ------------------------------------------------------------------ */

export const listHosts = (venueId) =>
  db.select().from(visitHosts).where(eq(visitHosts.venueId, venueId)).orderBy(visitHosts.name)

export async function addHost(venueId, { name, phone }, exec = db) {
  const [row] = await exec.insert(visitHosts).values({ venueId, name, phone: phone ?? null }).returning()
  return row
}

export async function updateHost(venueId, id, patch, exec = db) {
  const [row] = await exec
    .update(visitHosts)
    .set(patch)
    .where(and(eq(visitHosts.id, id), eq(visitHosts.venueId, venueId)))
    .returning()
  if (!row) throw notFound('That host was not found.')
  return row
}

/* ------------------------------------------------------------------ */
/* Events                                                             */
/* ------------------------------------------------------------------ */

export const listEvents = (venueId) =>
  db
    .select({
      id: eventEvents.id,
      name: eventEvents.name,
      active: eventEvents.active,
      organizerId: eventEvents.organizerId,
      organizer: visitHosts.name,
    })
    .from(eventEvents)
    .leftJoin(visitHosts, eq(visitHosts.id, eventEvents.organizerId))
    .where(eq(eventEvents.venueId, venueId))
    .orderBy(desc(eventEvents.createdAt))

export async function addEvent(venueId, { name, organizerId }, exec = db) {
  if (organizerId) {
    // An organiser from another venue would be a way to message its staff.
    const [host] = await exec
      .select({ id: visitHosts.id })
      .from(visitHosts)
      .where(and(eq(visitHosts.id, organizerId), eq(visitHosts.venueId, venueId)))
    if (!host) throw notFound('That organiser was not found.')
  }
  const [row] = await exec
    .insert(eventEvents)
    .values({ venueId, name, organizerId: organizerId ?? null })
    .returning()
  return row
}

export async function setEventActive(venueId, id, active, exec = db) {
  const [row] = await exec
    .update(eventEvents)
    .set({ active })
    .where(and(eq(eventEvents.id, id), eq(eventEvents.venueId, venueId)))
    .returning()
  if (!row) throw notFound('That event was not found.')
  return row
}

/* ------------------------------------------------------------------ */
/* How visitors are identified                                        */
/* ------------------------------------------------------------------ */

/**
 * A venue's choice, kept on its gates: `basic` (a name and a mobile number) or
 * `aadhaar`. Written to every gate so a venue never runs two standards by
 * accident; a gate added later starts from the venue's current choice.
 */
export async function getEntrySettings(venueId) {
  const [row] = await db
    .select({ identity: sql`COALESCE(${gates.config}->>'identity', 'basic')` })
    .from(gates)
    .where(and(eq(gates.venueId, venueId), eq(gates.status, 'active')))
    .orderBy(gates.createdAt)
    .limit(1)
  return { identity: row?.identity ?? 'basic' }
}

export async function saveEntrySettings(venueId, { identity }) {
  await db
    .update(gates)
    .set({ config: sql`${gates.config} || ${JSON.stringify({ identity })}::jsonb` })
    .where(eq(gates.venueId, venueId))
  return { identity }
}
