import { readFileSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import { config, isRemote, simulateAadhaar } from '../../config.js'
import { db } from '../../db/client.js'
import { liveAadhaar } from '../../lib/truid.js'

/**
 * The platform at a glance, and whether it is healthy. Counts are single
 * aggregate queries — nothing here loads rows to count them.
 */

// "Today" for a platform whose venues are in India, until one isn't.
const TZ = 'Asia/Kolkata'

export async function overview() {
  const [counts] = (
    await db.execute(sql`
      SELECT
        (SELECT count(*) FROM gates WHERE status = 'active')::int AS gates,
        (SELECT count(*) FROM gates WHERE status = 'revoked')::int AS gates_revoked,
        (SELECT count(*) FROM entry_sessions
           WHERE status IN ('in_progress','waiting') AND expires_at > now())::int AS active_sessions,
        (SELECT count(*) FROM entry_sessions
           WHERE status = 'waiting' AND expires_at > now())::int AS waiting,
        (SELECT count(*) FROM entries
           WHERE entered_at >= date_trunc('day', now() AT TIME ZONE ${TZ}) AT TIME ZONE ${TZ})::int AS entries_today,
        (SELECT count(*) FROM entries WHERE entered_at >= now() - interval '7 days')::int AS entries_7d,
        (SELECT count(*) FROM entries WHERE entered_at >= now() - interval '30 days')::int AS entries_30d,
        (SELECT count(*) FROM outbox WHERE status = 'pending')::int AS outbox_pending,
        (SELECT count(*) FROM outbox WHERE status = 'failed')::int AS outbox_failed,
        (SELECT min(created_at) FROM outbox WHERE status = 'pending') AS outbox_oldest,
        (SELECT count(*) FROM guests)::int AS guests,
        (SELECT count(*) FROM credentials WHERE revoked_at IS NULL)::int AS passkeys
    `)
  ).rows
  const kinds = (
    await db.execute(sql`SELECT kind, count(*)::int AS count FROM venues GROUP BY kind ORDER BY count DESC`)
  ).rows

  return {
    venues: { total: kinds.reduce((n, k) => n + k.count, 0), byKind: kinds },
    gates: { active: counts.gates, revoked: counts.gates_revoked },
    sessions: { active: counts.active_sessions, waiting: counts.waiting },
    entries: { today: counts.entries_today, last7Days: counts.entries_7d, last30Days: counts.entries_30d },
    outbox: { pending: counts.outbox_pending, failed: counts.outbox_failed, oldestPendingAt: counts.outbox_oldest },
    guests: counts.guests,
    passkeys: counts.passkeys,
  }
}

const journal = () => {
  try {
    return JSON.parse(readFileSync(new URL('../../../drizzle/meta/_journal.json', import.meta.url), 'utf8')).entries
  } catch {
    return []
  }
}

/** Every migration in the repo, and whether this database has applied it. */
export async function migrations() {
  let applied = []
  try {
    applied = (await db.execute(sql`SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`)).rows
  } catch {
    /* never migrated */
  }
  // drizzle records each migration's journal `when` as created_at.
  const done = new Set(applied.map((r) => Number(r.created_at)))
  return journal().map((m) => ({ tag: m.tag, when: m.when, applied: done.has(m.when) }))
}

export async function health() {
  const database = { host: new URL(config.DATABASE_URL).host, remote: isRemote(), connected: false, error: null }
  try {
    await db.execute(sql`select 1`)
    database.connected = true
  } catch (err) {
    database.error = err.cause?.code ?? err.cause?.message ?? err.message
  }

  const list = database.connected ? await migrations() : []
  const applied = list.filter((m) => m.applied)
  const [backlog] = database.connected
    ? (await db.execute(sql`SELECT min(created_at) AS oldest FROM outbox WHERE status = 'pending'`)).rows
    : [{}]

  return {
    ok: database.connected,
    database,
    migrations: { applied: applied.length, total: list.length, last: applied.at(-1)?.tag ?? null },
    outbox: {
      sender: config.OUTBOX_SENDER ?? null,
      oldestPendingAgeSeconds: backlog?.oldest ? Math.round((Date.now() - new Date(backlog.oldest)) / 1000) : null,
    },
    environment: {
      nodeEnv: process.env.NODE_ENV ?? 'development',
      rpId: config.RP_ID,
      aadhaar: liveAadhaar() ? 'live' : 'simulated',
      simulateAadhaar: simulateAadhaar(),
    },
  }
}
