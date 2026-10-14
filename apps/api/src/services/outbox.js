import { and, eq, lte, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { outbox } from '../db/schema/index.js'

/**
 * Notifications are written here in the same transaction as what caused them
 * and sent later, so a slow or failing provider never holds a guest at a gate
 * and a rolled-back check-in never sends a message.
 */

/** Rows are { venueId, kind, payload }. Call inside the transaction that caused them. */
export const enqueue = async (tx, rows) => {
  if (rows.length) await tx.insert(outbox).values(rows)
}

const MAX_ATTEMPTS = 5

/**
 * Send what is due. `send(row)` throws to fail a row, which is retried with a
 * growing delay and given up on after MAX_ATTEMPTS. Rows are claimed with
 * SKIP LOCKED so two workers never send the same message.
 */
export async function drain(send, limit = 20) {
  return db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(outbox)
      .where(and(eq(outbox.status, 'pending'), lte(outbox.runAfter, new Date())))
      .orderBy(outbox.runAfter)
      .limit(limit)
      .for('update', { skipLocked: true })

    for (const row of due) {
      try {
        await send(row)
        await tx.update(outbox).set({ status: 'sent', sentAt: new Date() }).where(eq(outbox.id, row.id))
      } catch (err) {
        const attempts = row.attempts + 1
        await tx
          .update(outbox)
          .set({
            attempts,
            lastError: String(err.message ?? err).slice(0, 500),
            status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
            runAfter: sql`now() + ${attempts * 30} * interval '1 second'`,
          })
          .where(eq(outbox.id, row.id))
      }
    }
    return due.length
  })
}

/** For a venue with no provider yet: say what would have been sent. */
export const logSender = async (row) => {
  console.log(`[outbox] ${row.kind} → ${row.payload.to ?? 'no number'}: ${row.payload.text}`)
}
