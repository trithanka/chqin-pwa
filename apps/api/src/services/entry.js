import { steps as library } from './steps.js'

/**
 * The runner: walks a session through its flow until it has to wait, is
 * rejected, or is let in.
 *
 * Pure with respect to the database. It takes the session as loaded and
 * returns what the session should become; the caller saves that in one write.
 * That is the point: steps that finish instantly are saved together, so a guest
 * with nothing to wait for costs one write and a guest who waits costs two.
 */

const FINISHED = new Set(['done', 'rejected', 'expired', 'revoked'])

const applies = (step, state) =>
  !step.when || Object.entries(step.when).every(([key, value]) => state[key] === value)

/**
 * @param flow     { steps } as returned by loadFlow
 * @param session  { status, cursor, state, trail, guestId, entitlementId, expiresAt }
 * @param input    what the guest just supplied; only the step that is current sees it
 * @param deps     I/O the steps need, e.g. { admit(session) → { id } }
 * @returns        { status, cursor, state, trail, guestId, entitlementId, waitingFor?, reason? }
 */
export async function advance({ flow, session, input = {}, deps = {}, registry = library, now = () => new Date() }) {
  let { cursor, state, trail, guestId, entitlementId } = session
  const result = () => ({ cursor, state, trail, guestId, entitlementId })

  if (FINISHED.has(session.status)) return { ...result(), status: session.status }
  if (session.expiresAt && session.expiresAt < now()) return { ...result(), status: 'expired' }

  trail = [...trail]
  const log = (step, outcome, extra) => trail.push({ step: step.type, outcome, at: now().toISOString(), ...extra })

  while (cursor < flow.steps.length) {
    const step = flow.steps[cursor]
    if (!applies(step, state)) {
      cursor += 1
      continue
    }

    const impl = registry[step.type]
    if (!impl) throw new Error(`no implementation for step "${step.type}"`)

    const r = await impl.run({
      // `trail` too: admit copies it into the entry, and the steps before it in
      // this same pass are not yet on the stored session.
      session: { ...session, cursor, state, guestId, entitlementId, trail },
      step,
      input,
      deps,
    })

    state = { ...state, ...r.state }
    guestId = r.session?.guestId ?? guestId
    entitlementId = r.session?.entitlementId ?? entitlementId

    if (r.outcome === 'next') {
      log(step, 'next', r.note)
      cursor += 1
      input = {} // consumed by the step it was for
      continue
    }

    if (r.outcome === 'wait') {
      // A guest polling a waiting session shouldn't grow the trail.
      const last = trail.at(-1)
      if (!(last?.step === step.type && last.outcome === 'wait' && last.waitingFor === r.waitingFor)) {
        log(step, 'wait', { waitingFor: r.waitingFor })
      }
      return { ...result(), status: 'waiting', waitingFor: r.waitingFor }
    }

    if (r.outcome === 'reject') {
      log(step, 'reject', { reason: r.reason })
      return { ...result(), status: 'rejected', reason: r.reason }
    }

    throw new Error(`step "${step.type}" returned unknown outcome "${r.outcome}"`)
  }

  return { ...result(), status: 'done' }
}
