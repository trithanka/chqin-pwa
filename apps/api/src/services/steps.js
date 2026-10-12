/**
 * The step library. A step looks at the session and says what happens next:
 *
 *   next(patch?)         – done, move on
 *   wait(reason, patch?) – needs something that hasn't happened yet
 *   reject(reason)       – this guest does not come in
 *
 * Steps decide; they don't do I/O themselves. Anything that touches the
 * database arrives through `deps` (see `admit`), which keeps them testable
 * without one. A step runs again each time its session resumes, so it must
 * answer from the session alone.
 *
 * `patch.state` merges into the session's state; `patch.session` can set
 * guestId or entitlementId.
 */

export const next = (patch = {}) => ({ outcome: 'next', ...patch })
export const wait = (waitingFor, patch = {}) => ({ outcome: 'wait', waitingFor, ...patch })
export const reject = (reason) => ({ outcome: 'reject', reason })

export const steps = {
  // Who is this? The routes that verify identity (passkey, Aadhaar) set the
  // session's guest; this step is what holds the flow until they have.
  identify: {
    run: ({ session, step }) => {
      if (session.guestId) return next()
      // Open venues can skip identity entirely and record a count, not a person.
      return step.optional ? next({ note: { skipped: true } }) : wait('identity')
    },
  },

  // A hotel guest's reservation. A walk-in has none, which a hotel allows.
  match_booking: {
    run: ({ session, step }) => {
      if (session.entitlementId) return next()
      return step.optional ? next({ note: { walkIn: true } }) : wait('booking')
    },
  },

  // The last step of every flow: record the entry. What "record" means (the
  // transaction, the idempotency key, marking a booking used) is the caller's,
  // passed in so the engine has one place that writes entries and it isn't here.
  admit: {
    run: async ({ session, deps }) => {
      const entry = await deps.admit(session)
      return next({ state: { entryId: entry.id } })
    },
  },
}

export const knownStepTypes = new Set(Object.keys(steps))
