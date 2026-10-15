import { randomBytes } from 'node:crypto'

/**
 * UUIDv7 — a random UUID with a millisecond timestamp in the high bits, so ids
 * sort by creation millisecond and B-tree inserts stay append-only. v4
 * scatters writes across the index instead. (Ordering within a single
 * millisecond is random; the spec's optional monotonic counter isn't
 * implemented because nothing here depends on intra-millisecond order.)
 *
 * Generated in Node rather than by a Postgres function: it keeps the schema
 * portable and Drizzle as the single source of truth, with nothing to install
 * in the database first.
 */
export function uuidv7() {
  const bytes = randomBytes(16)
  const ms = BigInt(Date.now())

  // 48-bit big-endian timestamp
  bytes[0] = Number((ms >> 40n) & 0xffn)
  bytes[1] = Number((ms >> 32n) & 0xffn)
  bytes[2] = Number((ms >> 24n) & 0xffn)
  bytes[3] = Number((ms >> 16n) & 0xffn)
  bytes[4] = Number((ms >> 8n) & 0xffn)
  bytes[5] = Number(ms & 0xffn)

  bytes[6] = (bytes[6] & 0x0f) | 0x70 // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant 10xx

  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
