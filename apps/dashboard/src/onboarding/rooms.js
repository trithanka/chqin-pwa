const MAX_BATCH = 200

/**
 * The door numbers a range would create, or the reason it can't.
 *
 * Rooms are typed the way they read on the door — 305 to 365 — rather than as
 * a floor plus an offset. Every property already knows its own numbers, and
 * asking for them in a scheme we invented is asking them to translate.
 *
 * Showing the actual numbers beats describing the rule: "305, 306, 307 … 365"
 * is checkable at a glance, where "creates 305 through 365" asks the reader to
 * do the arithmetic and trust us.
 */
export function planRooms({ from, to }) {
  const first = Number(from)
  const last = Number(to)

  if (String(from).trim() === '' || String(to).trim() === '') return { error: null, numbers: [] }
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < 0 || last < 0) {
    return { error: 'Room numbers have to be whole numbers.', numbers: [] }
  }
  if (last < first) {
    return { error: 'The last room has to be the same or higher than the first.', numbers: [] }
  }
  if (last - first + 1 > MAX_BATCH) {
    return { error: `That's over ${MAX_BATCH} rooms. Add them a floor at a time.`, numbers: [] }
  }

  const numbers = []
  for (let n = first; n <= last; n++) numbers.push(String(n))
  return { error: null, numbers }
}
