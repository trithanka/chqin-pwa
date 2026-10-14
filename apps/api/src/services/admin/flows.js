import { sql } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { flowDefinitions } from '../../db/schema/index.js'
import { invalid, notFound } from '../../lib/errors.js'
import { advance } from '../entry.js'
import { validateFlow } from '../flows.js'
import { steps as library } from '../steps.js'
import { camel } from './util.js'

/**
 * Flows from the admin side: every published version, publishing the next one,
 * the step library as documentation, and a dry run of the runner.
 *
 * Published versions are never edited. "Edit" is always "publish N+1", and a
 * gate moves to it only when someone repoints the gate.
 */

/** Keys whose newest version is what register() hands every new venue. */
export const DEFAULT_KEYS = ['hotel', 'visitor.host_approval']

export async function listFlows() {
  const { rows } = await db.execute(sql`
    SELECT f.id, f.key, f.version, f.published_at, jsonb_array_length(f.steps)::int AS step_count,
      (SELECT count(*)::int FROM gates g WHERE g.flow_id = f.id AND g.status = 'active') AS gates,
      (SELECT count(*)::int FROM entry_sessions s WHERE s.flow_id = f.id
         AND s.status IN ('in_progress','waiting') AND s.expires_at > now()) AS in_flight
    FROM flow_definitions f ORDER BY f.key, f.version DESC`)
  const byKey = new Map()
  for (const row of rows.map(camel)) {
    if (!byKey.has(row.key)) byKey.set(row.key, { key: row.key, default: DEFAULT_KEYS.includes(row.key), versions: [] })
    byKey.get(row.key).versions.push(row)
  }
  return [...byKey.values()]
}

export async function getFlow(id) {
  const { rows } = await db.execute(sql`
    SELECT f.*, (SELECT max(version) FROM flow_definitions WHERE key = f.key) AS latest
    FROM flow_definitions f WHERE f.id = ${id}`)
  if (!rows.length) throw notFound('That flow version was not found.')
  const gates = (
    await db.execute(sql`
      SELECT g.id, g.name, g.status, v.id AS venue_id, v.name AS venue,
        (SELECT count(*)::int FROM entry_sessions s WHERE s.gate_id = g.id AND s.flow_id = ${id}
           AND s.status IN ('in_progress','waiting') AND s.expires_at > now()) AS in_flight
      FROM gates g JOIN venues v ON v.id = g.venue_id WHERE g.flow_id = ${id} ORDER BY v.name, g.name`)
  ).rows.map(camel)
  return { ...camel(rows[0]), gates }
}

/** Either the steps are publishable, or the reason they aren't. */
export function check(steps) {
  try {
    validateFlow(steps)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

/**
 * The next version of a key, or version 1 of a new one. Inside the caller's
 * audited transaction; the (key, version) unique index turns a race between two
 * publishers into a clean conflict rather than two version 4s.
 */
export async function publish(tx, { key, steps }) {
  const result = check(steps)
  if (!result.ok) throw invalid(`Not published: ${result.error}.`)
  const [{ next }] = (
    await tx.execute(sql`SELECT coalesce(max(version), 0) + 1 AS next FROM flow_definitions WHERE key = ${key}`)
  ).rows
  const [row] = await tx
    .insert(flowDefinitions)
    .values({ key, version: Number(next), steps })
    .returning({ id: flowDefinitions.id, key: flowDefinitions.key, version: flowDefinitions.version })
  return { result: row, targetId: row.id, changes: { published: { key, version: row.version, steps: steps.length } } }
}

/** The step library, generated from the code that runs it. */
export const stepLibrary = () =>
  Object.entries(library).map(([type, impl]) => ({
    type,
    takesInput: Boolean(impl.takesInput),
    hasView: Boolean(impl.view),
    ...(impl.describe ?? { summary: 'Not described yet.' }),
  }))

/**
 * A dry run of the real runner with no database: admit returns a fake entry,
 * and a choice read from the venue gets sample options (or the venue's real
 * ones when given). Feeds each input in turn and reports what the session
 * became after each — the same thing a guest and the desk would see.
 */
export async function simulate({ steps, state = {}, guest = true, booking = false, inputs = [], options = {} }) {
  const valid = check(steps)
  if (!valid.ok) return { ok: false, error: valid.error, frames: [] }

  const flow = { steps }
  const deps = {
    admit: async () => ({ id: 'simulated-entry' }),
    options: async (source) =>
      options[source] ?? [1, 2].map((n) => ({ value: `${source}-${n}`, label: `Sample ${source} ${n}` })),
  }
  let session = {
    id: 'simulated-session',
    status: 'in_progress',
    cursor: 0,
    state,
    trail: [],
    guestId: guest ? 'simulated-guest' : null,
    entitlementId: booking ? 'simulated-booking' : null,
    expiresAt: null,
  }

  const frames = []
  for (const input of [null, ...inputs]) {
    try {
      const r = await advance({ flow, session, input: input ?? {}, deps })
      session = { ...session, ...r }
      const step = steps[r.cursor]
      const view = r.status === 'waiting' && library[step?.type]?.view ? await library[step.type].view({ session, step, deps }) : null
      frames.push({ input, status: r.status, cursor: r.cursor, step: step?.type ?? null, waitingFor: r.waitingFor ?? null, reason: r.reason ?? null, state: r.state, emits: r.emits, view })
    } catch (err) {
      // A step refusing an answer (a missing field, a choice not offered) is
      // what the guest would see; the session is unchanged.
      frames.push({ input, error: err.message, status: session.status, cursor: session.cursor, state: session.state })
    }
    if (['done', 'rejected'].includes(session.status)) break
  }
  return { ok: true, frames, trail: session.trail }
}
