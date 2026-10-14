import { sql } from 'drizzle-orm'
import { config, isRemote, simulateAadhaar, simulateAadhaarSource } from '../../config.js'
import { db } from '../../db/client.js'
import { liveAadhaar, truidConfigured } from '../../lib/truid.js'
import { migrations } from './overview.js'
import { camel, whereAll } from './util.js'

/**
 * Reports (read-only aggregates) and platform operations (environment, the
 * migration ledger, and clearing out rows that can never be used again).
 */

const TZ = 'Asia/Kolkata'
const rowsOf = async (query) => (await db.execute(query)).rows.map(camel)

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

/** Inclusive dates; the last 30 days when not given. */
const range = ({ from, to }) => ({
  from: from || new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10),
  to: to || new Date().toISOString().slice(0, 10),
})

const inRange = (column, { from, to }) =>
  sql`${column} >= (${from}::date AT TIME ZONE ${TZ}) AND ${column} < ((${to}::date + 1) AT TIME ZONE ${TZ})`

export async function reports(params) {
  const r = range(params)
  const venue = (column) => (params.venueId ? sql`${column} = ${params.venueId}` : null)

  const [daily, venues, approvals, journeys, identity] = await Promise.all([
    rowsOf(sql`
      SELECT (e.entered_at AT TIME ZONE ${TZ})::date::text AS day, v.name AS venue, count(*)::int AS entries
      FROM entries e JOIN venues v ON v.id = e.venue_id
      WHERE ${whereAll([inRange(sql`e.entered_at`, r), venue(sql`e.venue_id`)])}
      GROUP BY 1, 2 ORDER BY 1, 2`),
    // Scan to admit: from the session's creation (the scan) to the entry.
    rowsOf(sql`
      SELECT v.id AS venue_id, v.name AS venue, v.kind, count(e.id)::int AS entries,
        round(avg(extract(epoch FROM e.entered_at - s.created_at)))::int AS avg_scan_to_admit_seconds,
        count(*) FILTER (WHERE e.guest_id IS NULL)::int AS without_guest
      FROM entries e JOIN venues v ON v.id = e.venue_id LEFT JOIN entry_sessions s ON s.id = e.session_id
      WHERE ${whereAll([inRange(sql`e.entered_at`, r), venue(sql`e.venue_id`)])}
      GROUP BY v.id, v.name, v.kind ORDER BY entries DESC`),
    // Host approval, read from the trail: the first wait for staff to the decision.
    rowsOf(sql`
      SELECT v.name AS venue,
        count(*) FILTER (WHERE d.outcome = 'next')::int AS approved,
        count(*) FILTER (WHERE d.outcome = 'reject')::int AS declined,
        count(*) FILTER (WHERE d.outcome IS NULL)::int AS undecided,
        round(avg(extract(epoch FROM d.at - w.at)) FILTER (WHERE d.at IS NOT NULL))::int AS avg_wait_seconds
      FROM entry_sessions s JOIN venues v ON v.id = s.venue_id
      CROSS JOIN LATERAL (
        SELECT min((t->>'at')::timestamptz) AS at FROM jsonb_array_elements(s.trail) t
        WHERE t->>'step' = 'staff_approves' AND t->>'outcome' = 'wait') w
      LEFT JOIN LATERAL (
        SELECT t->>'outcome' AS outcome, (t->>'at')::timestamptz AS at FROM jsonb_array_elements(s.trail) t
        WHERE t->>'step' = 'staff_approves' AND t->>'outcome' IN ('next','reject') LIMIT 1) d ON true
      WHERE w.at IS NOT NULL AND ${whereAll([inRange(sql`s.created_at`, r), venue(sql`s.venue_id`)])}
      GROUP BY v.name ORDER BY v.name`),
    rowsOf(sql`
      SELECT h.journey, count(*)::int AS entries
      FROM hotel_entry_details h JOIN entries e ON e.id = h.entry_id
      WHERE ${whereAll([inRange(sql`e.entered_at`, r), venue(sql`e.venue_id`)])}
      GROUP BY h.journey ORDER BY entries DESC`),
    rowsOf(sql`
      SELECT iv.method, iv.result, count(*)::int AS checks
      FROM identity_verifications iv
      LEFT JOIN entry_sessions s ON s.id = iv.session_id
      WHERE ${whereAll([inRange(sql`iv.created_at`, r), venue(sql`s.venue_id`)])}
      GROUP BY iv.method, iv.result ORDER BY checks DESC`),
  ])
  return { range: r, daily, venues, approvals, journeys, identity }
}

/* ------------------------------------------------------------------ */
/* Operations                                                          */
/* ------------------------------------------------------------------ */

const DEAD_AFTER = sql`now() - interval '7 days'`

/** What a purge would remove, counted the same way purge() removes it. */
async function deadRows() {
  const [row] = (
    await db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM entry_sessions WHERE status IN ('in_progress','waiting') AND expires_at < now()) AS sessions_to_expire,
        (SELECT count(*)::int FROM webauthn_challenges WHERE consumed_at IS NOT NULL OR expires_at < now()) AS challenges,
        (SELECT count(*)::int FROM staff_sessions WHERE (revoked_at IS NOT NULL OR expires_at < now()) AND created_at < ${DEAD_AFTER}) AS staff_sessions,
        (SELECT count(*)::int FROM admin_sessions WHERE (revoked_at IS NOT NULL OR expires_at < now()) AND created_at < ${DEAD_AFTER}) AS admin_sessions,
        (SELECT count(*)::int FROM staff_tokens WHERE (used_at IS NOT NULL OR expires_at < now()) AND created_at < ${DEAD_AFTER}) AS staff_tokens,
        (SELECT count(*)::int FROM admin_tokens WHERE (used_at IS NOT NULL OR expires_at < now()) AND created_at < ${DEAD_AFTER}) AS admin_tokens`)
  ).rows
  return camel(row)
}

export async function opsInfo() {
  const remote = isRemote()
  return {
    migrations: await migrations(),
    environment: {
      nodeEnv: process.env.NODE_ENV ?? 'development',
      database: new URL(config.DATABASE_URL).host,
      remote,
      rpId: config.RP_ID,
      outboxSender: config.OUTBOX_SENDER ?? null,
      simulateAadhaar: simulateAadhaar(),
      simulateAadhaarSource: simulateAadhaarSource(),
      adminAllowDestructive: config.ADMIN_ALLOW_DESTRUCTIVE,
      adminIpAllowlist: config.ADMIN_IP_ALLOWLIST.length,
      adminClientIpHeader: config.ADMIN_CLIENT_IP_HEADER ?? null,
    },
    aadhaar: {
      mode: liveAadhaar() ? 'live' : 'simulated',
      provider: 'truid',
      credentials: truidConfigured(),
      baseUrl: config.TRUID_BASE_URL,
    },
    warnings: [
      remote && simulateAadhaar() && 'Aadhaar simulation is ON against a hosted database: any six-digit code passes and the records look verified.',
      remote && config.ADMIN_ALLOW_DESTRUCTIVE && 'Destructive admin actions are allowed on this hosted database.',
      remote && !config.ADMIN_IP_ALLOWLIST.length && '/admin has no IP allow-list on a hosted database.',
      remote && config.OUTBOX_SENDER === 'log' && 'The outbox sender is "log" on a hosted database: messages are marked sent without going anywhere.',
    ].filter(Boolean),
    cleanup: await deadRows(),
  }
}

/**
 * Clears rows that can never be used again. Open sessions past their expiry
 * are marked expired, not deleted (they are journeys, and an entry may point
 * at one). Dead auth rows older than a week are deleted.
 */
export async function purge(tx) {
  const count = async (query) => (await tx.execute(query)).rowCount ?? 0
  const removed = {
    sessionsExpired: await count(sql`
      UPDATE entry_sessions SET status = 'expired', updated_at = now()
      WHERE status IN ('in_progress','waiting') AND expires_at < now()`),
    challenges: await count(sql`DELETE FROM webauthn_challenges WHERE consumed_at IS NOT NULL OR expires_at < now()`),
    staffSessions: await count(sql`DELETE FROM staff_sessions WHERE (revoked_at IS NOT NULL OR expires_at < now()) AND created_at < ${DEAD_AFTER}`),
    adminSessions: await count(sql`DELETE FROM admin_sessions WHERE (revoked_at IS NOT NULL OR expires_at < now()) AND created_at < ${DEAD_AFTER}`),
    staffTokens: await count(sql`DELETE FROM staff_tokens WHERE (used_at IS NOT NULL OR expires_at < now()) AND created_at < ${DEAD_AFTER}`),
    adminTokens: await count(sql`DELETE FROM admin_tokens WHERE (used_at IS NOT NULL OR expires_at < now()) AND created_at < ${DEAD_AFTER}`),
  }
  return { changes: { purged: removed }, result: removed }
}
