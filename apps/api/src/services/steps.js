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
 * A step that reads `input` (answers from the guest, a decision from staff)
 * sets `takesInput: true`; the runner hands input on past every step that doesn't.
 *
 * `patch.state` merges into the session's state; `patch.session` can set
 * guestId or entitlementId.
 */

export const next = (patch = {}) => ({ outcome: 'next', ...patch })
export const wait = (waitingFor, patch = {}) => ({ outcome: 'wait', waitingFor, ...patch })
export const reject = (reason, note) => ({ outcome: 'reject', reason, note })

import { invalid } from '../lib/errors.js'

const option = (o) => (typeof o === 'string' ? { value: o, label: o } : o)

/** What a choice field offers: written into the flow, or read from the venue. */
const optionsOf = async (field, deps) =>
  (field.options ?? (await deps.options(field.source))).map(option)

export const steps = {
  // Who is this? The routes that verify identity (passkey, Aadhaar) set the
  // session's guest; this step is what holds the flow until they have.
  identify: {
    describe: {
      summary: 'Holds the flow until the guest is known. The identity routes (passkey, Aadhaar OTP, or a name and mobile for gates set to basic) set the guest.',
      options: { optional: 'true lets a guest through without an identity: the entry records a count, not a person (open venues).' },
      input: 'None. Identity arrives through the identity routes, not as step input.',
      waitsFor: ['identity'],
      emits: [],
    },
    run: ({ session, step }) => {
      if (session.guestId) return next()
      // Open venues can skip identity entirely and record a count, not a person.
      return step.optional ? next({ note: { skipped: true } }) : wait('identity')
    },
  },

  // A hotel guest's reservation. A walk-in has none, which a hotel allows.
  match_booking: {
    describe: {
      summary: "Holds the flow until the session has a reservation (an entitlement), found by booking reference or surname among today's arrivals.",
      options: { optional: 'true lets a walk-in through without a booking.' },
      input: 'None. The booking is attached through the booking lookup route.',
      waitsFor: ['booking'],
      emits: [],
    },
    run: ({ session, step }) => {
      if (session.entitlementId) return next()
      return step.optional ? next({ note: { walkIn: true } }) : wait('booking')
    },
  },

  // A short form: some choices, some free text. A field already answered is
  // skipped, so a flow can ask for the same thing in two places safely. The
  // answers land in session state, where later steps' `when` can read them.
  collect_details: {
    takesInput: true,
    describe: {
      summary: 'A short form. Answers land in session state under each field key, where later steps\' `when` can read them. Fields already answered are skipped.',
      options: {
        fields:
          'Required. [{ key, label?, kind: "text" | "choice", options?: [{ value, label }], source?: "hosts" | "events" }]. A choice needs options or a source.',
      },
      input: '{ values: { [key]: string } } from the guest. Text up to 120 characters; a choice must be one of its options.',
      waitsFor: ['details'],
      emits: [],
    },
    run: async ({ session, step, input, deps }) => {
      const missing = step.fields.filter((f) => session.state[f.key] === undefined)
      if (!missing.length) return next()
      if (!input.values) return wait('details')

      const answers = {}
      for (const field of missing) {
        const label = field.label ?? field.key
        const raw = input.values[field.key]
        const value = typeof raw === 'string' ? raw.trim() : ''
        if (!value) throw invalid(`${label} is required.`)
        if (field.kind === 'choice') {
          const options = await optionsOf(field, deps)
          if (!options.some((o) => o.value === value)) throw invalid(`Choose one of the ${label} options.`)
        } else if (value.length > 120) {
          throw invalid(`${label} is too long.`)
        }
        answers[field.key] = value
      }
      return next({ state: answers })
    },
    // What the guest's screen draws while this step is current.
    view: async ({ session, step, deps }) => ({
      fields: await Promise.all(
        step.fields
          .filter((f) => session.state[f.key] === undefined)
          .map(async (f) => ({
            key: f.key,
            label: f.label ?? f.key,
            kind: f.kind ?? 'text',
            ...(f.kind === 'choice' ? { options: await optionsOf(f, deps) } : {}),
          })),
      ),
    }),
  },

  // A person at the venue says yes. Only a staff route passes `approval`, so a
  // guest cannot approve themselves; the guest's own polling just waits.
  staff_approves: {
    takesInput: true,
    describe: {
      summary: 'Waits for a person at the venue to confirm, hold or decline. Only a staff route can pass the decision.',
      options: {},
      input: '{ approval: "confirm" | "hold" | "decline", by } from staff.',
      waitsFor: ['staff'],
      emits: ['visit.arrival (once, when the wait starts): the host is told on WhatsApp'],
    },
    run: ({ session, input }) => {
      if (session.state.approval === 'confirmed' || input.approval === 'confirm') {
        return next({ state: { approval: 'confirmed' }, note: input.by ? { by: input.by } : undefined })
      }
      if (input.approval === 'decline') return reject('declined', { by: input.by })
      if (input.approval === 'hold') {
        return wait('staff', { state: { approval: 'holding' }, note: { held: true, by: input.by } })
      }
      // The host is told once: `emit` is recorded only when the wait is new.
      return wait('staff', { emit: [{ kind: 'visit.arrival' }] })
    },
  },

  // The last step of every flow: record the entry. What "record" means (the
  // transaction, the idempotency key, marking a booking used) is the caller's,
  // passed in so the engine has one place that writes entries and it isn't here.
  admit: {
    describe: {
      summary: 'Records the entry, atomically with the session closing. Always the last step, and never conditional.',
      options: {},
      input: 'None.',
      waitsFor: [],
      emits: ['entry.admitted: for an event, the organiser is told'],
    },
    run: async ({ session, deps }) => {
      const entry = await deps.admit(session)
      return next({ state: { entryId: entry.id }, emit: [{ kind: 'entry.admitted' }] })
    },
  },
}

export const knownStepTypes = new Set(Object.keys(steps))
