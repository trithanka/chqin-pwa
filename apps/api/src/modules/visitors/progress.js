import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { transaction } from '../../shared/db/client.js'
import {
  credentials,
  eventEntryDetails,
  eventEvents,
  entries,
  entrySessions,
  visitEntryDetails,
  visitHosts,
} from '../../shared/db/schema.js'
import { conflict, notFound } from '../../shared/lib/errors.js'
import { advance } from '../entry/index.js'
import { loadFlow } from '../entry/index.js'
import { messagesFor } from './notify.js'
import { enqueue } from '../../shared/outbox/outbox.js'
import { touch } from '../entry/index.js'
import { steps as library } from '../entry/index.js'

/**
 * Walking a session that isn't a hotel check-in.
 *
 * The hotel keeps its own path (modules/hotel/checkins.js) because its API predates
 * the engine and must not change. Every other flow comes through here: the
 * guest's screen asks "where am I?" by posting what it has (maybe nothing), and
 * a staff member's decision comes through `respond`. Both lock the session,
 * run the same runner, and save once.
 */

const OPEN = ['in_progress', 'waiting']

/** What a flow's `choice` fields can draw from, always scoped to the venue. */
const optionsFor = (tx, venueId) => async (source) => {
  if (source === 'hosts') {
    const rows = await tx
      .select({ id: visitHosts.id, name: visitHosts.name })
      .from(visitHosts)
      .where(and(eq(visitHosts.venueId, venueId), eq(visitHosts.active, true)))
      .orderBy(visitHosts.name)
    return rows.map((r) => ({ value: r.id, label: r.name }))
  }
  if (source === 'events') {
    const rows = await tx
      .select({ id: eventEvents.id, name: eventEvents.name })
      .from(eventEvents)
      .where(and(eq(eventEvents.venueId, venueId), eq(eventEvents.active, true)))
      .orderBy(eventEvents.name)
    return rows.map((r) => ({ value: r.id, label: r.name }))
  }
  throw new Error(`unknown option source "${source}"`)
}

/** What each kind of flow records about an arrival, beyond the entry itself. */
const writeDetails = {
  'visitor.host_approval': async (tx, entryId, state) => {
    if (state.purpose === 'event') {
      await tx
        .insert(eventEntryDetails)
        .values({
          entryId,
          eventId: state.event,
          company: state.company,
          designation: state.designation,
        })
        .onConflictDoNothing()
    } else {
      await tx
        .insert(visitEntryDetails)
        .values({ entryId, purpose: state.purpose, hostId: state.host })
        .onConflictDoNothing()
    }
  },
}

const admitter = (tx, flow) => async (s) => {
  const [credential] = s.guestId
    ? await tx
        .select({ id: credentials.id })
        .from(credentials)
        .where(and(eq(credentials.guestId, s.guestId), isNull(credentials.revokedAt)))
        .orderBy(sql`${credentials.lastUsedAt} DESC NULLS LAST`)
        .limit(1)
    : []

  // One entry per session, whatever happens: the key is the session itself.
  const [row] = await tx
    .insert(entries)
    .values({
      venueId: s.venueId,
      gateId: s.gateId,
      entitlementId: s.entitlementId,
      guestId: s.guestId,
      sessionId: s.id,
      credentialId: credential?.id ?? null,
      idempotencyKey: `session:${s.id}`,
      data: { trail: s.trail },
    })
    .onConflictDoUpdate({
      target: entries.idempotencyKey,
      targetWhere: sql`idempotency_key IS NOT NULL`,
      set: { outcome: sql`${entries.outcome}` },
    })
    .returning({ id: entries.id })

  await writeDetails[flow.key]?.(tx, row.id, s.state)
  return row
}

const lockSession = async (tx, sessionId) => {
  const [row] = await tx.select().from(entrySessions).where(eq(entrySessions.id, sessionId)).for('update')
  return row ?? null
}

/** Run the session one pass with `input`, save if anything changed, queue its messages. */
async function run(tx, row, input) {
  const flow = await loadFlow(row.flowId)
  const deps = { admit: admitter(tx, flow), options: optionsFor(tx, row.venueId) }

  const out = await advance({
    flow,
    session: {
      id: row.id,
      venueId: row.venueId,
      gateId: row.gateId,
      status: row.status,
      cursor: row.cursor,
      state: row.state,
      trail: row.trail,
      guestId: row.guestId,
      entitlementId: row.entitlementId,
      expiresAt: row.expiresAt,
    },
    input,
    deps,
  })

  const changed =
    out.status !== row.status ||
    out.cursor !== row.cursor ||
    out.guestId !== row.guestId ||
    out.trail.length !== row.trail.length ||
    JSON.stringify(out.state) !== JSON.stringify(row.state)

  if (changed) {
    const saved = await tx
      .update(entrySessions)
      .set({
        status: out.status,
        cursor: out.cursor,
        state: out.state,
        trail: out.trail,
        guestId: out.guestId,
        entitlementId: out.entitlementId,
        ...touch(),
      })
      .where(and(eq(entrySessions.id, row.id), eq(entrySessions.version, row.version)))
      .returning({ id: entrySessions.id })
    if (!saved.length) throw conflict('session_changed', 'Try that again.')
    await enqueue(tx, await messagesFor(tx, row, out.state, out.emits))
  }

  return { flow, out, deps }
}

/** The names behind the ids in a session's state, for the screen to show. */
async function labelsFor(tx, state) {
  const labels = {}
  if (state.host) {
    const [h] = await tx.select({ name: visitHosts.name }).from(visitHosts).where(eq(visitHosts.id, state.host))
    labels.host = h?.name ?? null
  }
  if (state.event) {
    const [e] = await tx.select({ name: eventEvents.name }).from(eventEvents).where(eq(eventEvents.id, state.event))
    labels.event = e?.name ?? null
  }
  return labels
}

async function viewOf(tx, flow, out, deps, row) {
  const current = flow.steps[out.cursor]
  const view = ['in_progress', 'waiting'].includes(out.status)
    ? await library[current.type].view?.({ session: { state: out.state }, step: current, deps })
    : null
  return {
    sessionId: row.id,
    status: out.status,
    waitingFor: out.status === 'waiting' ? out.waitingFor : null,
    step: current && view ? { type: current.type, ...view } : current ? { type: current.type } : null,
    reason: out.status === 'rejected' ? (out.reason ?? out.trail.at(-1)?.reason ?? null) : null,
    purpose: out.state.purpose ?? null,
    // The host asked for more time; the visitor is told to wait at reception.
    held: out.state.approval === 'holding',
    ...(await labelsFor(tx, out.state)),
  }
}

/**
 * The guest's side: post what you have, get back where you are. Posting nothing
 * is how a screen polls, and a poll that changes nothing writes nothing.
 */
export async function submit(sessionId, values) {
  return transaction(async (tx) => {
    const row = await lockSession(tx, sessionId)
    if (!row) throw notFound()
    // A finished session is read back as it stands, not re-run.
    const { flow, out, deps } = await run(tx, row, values ? { values } : {})
    return viewOf(tx, flow, out, deps, row)
  })
}

/**
 * The venue's side: a person decides. `decision` is confirm, hold or decline.
 * The session must belong to this venue and be waiting on a person.
 */
export async function respond(venueId, staffId, sessionId, decision) {
  return transaction(async (tx) => {
    const row = await lockSession(tx, sessionId)
    if (!row || row.venueId !== venueId) throw notFound('That visit was not found.')
    if (row.status !== 'waiting' || !OPEN.includes(row.status)) {
      throw conflict('not_waiting', 'This visit is no longer waiting for a decision.')
    }
    const flow = await loadFlow(row.flowId)
    if (flow.steps[row.cursor]?.type !== 'staff_approves') {
      throw conflict('not_waiting', 'This visit is not waiting for a decision.')
    }
    const { out } = await run(tx, row, { approval: decision, by: staffId })
    return { status: out.status }
  })
}
