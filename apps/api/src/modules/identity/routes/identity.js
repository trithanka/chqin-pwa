import { Hono } from 'hono'
import { z } from 'zod'
import { identityFormOf } from '@chqin/shared'
import { db } from '../../../shared/db/client.js'
import { identityVerifications } from '../../../shared/db/schema.js'
import { ApiError } from '../../../shared/lib/errors.js'
import { liveAadhaar } from '../truid.js'
import { body } from '../../../shared/lib/validate.js'
import { logEvent } from '../audit.js'
import { requireOpen } from '../../entry/index.js'
import {
  recordBasicIdentity,
  recordDocumentCapture,
  requestAadhaarOtp,
  verifyAadhaarOtp,
} from '../identity.js'

export const identity = new Hono()

const request = z.object({ sessionId: z.uuid() })

const otpRequest = z.object({
  sessionId: z.uuid(),
  // Spaces allowed: people type Aadhaar in groups of four.
  aadhaar: z.string().regex(/^[\d\s]{12,14}$/, 'Enter the 12-digit Aadhaar number'),
})

const otpVerify = z.object({
  sessionId: z.uuid(),
  requestId: z.uuid(),
  otp: z.string().regex(/^\d{6}$/, 'Enter the six-digit code'),
  consent: z.object({
    accepted: z.literal(true),
    version: z.string().max(20).default('v1'),
    text: z.string().max(500).optional(),
  }),
})

/**
 * Records that the one-time check happened.
 *
 * This is an authorization gate, not a flow step: it is the only thing between
 * a scanned QR and enrolling a passkey against that reservation. Wiring a KYC
 * provider replaces the body of this route, not its contract — and until that
 * happens, anyone who can call it can pass it.
 */
/** Step one: an OTP is sent to the mobile registered with the Aadhaar number. */
identity.post('/aadhaar/otp', body(otpRequest), async (c) => {
  const { sessionId, aadhaar } = c.get('body')
  const session = await requireOpen(sessionId)

  // A refused number leaves no verification row on purpose, so the audit event
  // is the only trace it was tried — worth having when the desk is asked why.
  try {
    const result = await requestAadhaarOtp(session, aadhaar)

    await logEvent(c, {
      venueId: session.venueId,
      sessionId: session.id,
      event: 'aadhaar_otp_requested',
      outcome: 'ok',
      detail: { last4: result.maskedAadhaar.slice(-4), simulated: result.simulated },
    })

    return c.json(result)
  } catch (err) {
    await logEvent(c, {
      venueId: session.venueId,
      sessionId: session.id,
      event: 'aadhaar_otp_requested',
      outcome: 'failed',
      detail: { last4: aadhaar.replace(/\s/g, '').slice(-4), reason: err.message },
    })
    throw err
  }
})

/** Step two: the code, the consent, and the holder's details come back. */
identity.post('/aadhaar/verify', body(otpVerify), async (c) => {
  const data = c.get('body')
  const session = await requireOpen(data.sessionId)

  try {
    const result = await verifyAadhaarOtp(session, data)
    await logEvent(c, {
      venueId: session.venueId,
      sessionId: session.id,
      event: 'identity_verified',
      outcome: 'ok',
      detail: { method: 'aadhaar_otp', simulated: result.subject.simulated },
    })
    return c.json(result)
  } catch (err) {
    await logEvent(c, {
      venueId: session.venueId,
      sessionId: session.id,
      event: 'identity_verified',
      outcome: 'failed',
      detail: { method: 'aadhaar_otp', reason: err.message },
    })
    throw err
  }
})

const today = () => new Date().toISOString().slice(0, 10)

// Shapes only. Which fields must be there is the venue's choice, checked below.
const basicRequest = z.object({
  sessionId: z.uuid(),
  name: z.string().trim().min(2, 'Enter your name').max(120),
  dateOfBirth: z.iso
    .date('Enter your date of birth')
    .refine((d) => d >= '1900-01-01' && d <= today(), 'Enter your date of birth')
    .optional()
    .or(z.literal('')),
  address: z.string().trim().max(300).optional(),
  phone: z
    .string()
    .regex(/^[\d\s+()-]{10,16}$/, 'Enter a valid mobile number')
    .optional()
    .or(z.literal('')),
  // The venue's own questions, by key.
  extra: z.record(z.string(), z.string().trim().max(200)).default({}),
})

/** The answers this venue's form wants, in the shape they are stored. */
function answersFor(form, input) {
  const missing = (message) => {
    throw new ApiError('invalid_input', message, 400)
  }
  const pick = (mode, value, message) => {
    if (mode === 'off') return null
    if (!value && mode === 'required') missing(message)
    return value || null
  }
  const dateOfBirth = pick(form.dateOfBirth, input.dateOfBirth, 'Enter your date of birth')
  const address = pick(form.address, input.address?.length >= 5 ? input.address : '', 'Enter your address')
  const phone = pick(form.phone, input.phone?.trim(), 'Enter your mobile number')

  // Stored by question, not key: the record reads the same after the venue
  // renames or removes a question.
  const extra = {}
  for (const field of form.extra) {
    const value = input.extra[field.key]?.trim()
    if (!value) {
      if (field.required) missing(`Answer “${field.label}”`)
      continue
    }
    if (field.kind === 'choice' && !field.options.includes(value)) missing(`Pick one of the options for “${field.label}”`)
    extra[field.label] = value
  }
  return { dateOfBirth, address, phone, extra: Object.keys(extra).length ? extra : null }
}

/** For a venue without Aadhaar: the name, and whatever else the venue's form asks. */
identity.post('/basic', body(basicRequest), async (c) => {
  const input = c.get('body')
  const session = await requireOpen(input.sessionId)
  const answers = answersFor(identityFormOf(session.venueSettings), input)
  const result = await recordBasicIdentity(session, { name: input.name, ...answers })
  await logEvent(c, {
    venueId: session.venueId,
    sessionId: session.id,
    event: 'identity_verified',
    outcome: 'ok',
    detail: { method: 'basic' },
  })
  return c.json(result)
})

/** The secondary path: a photo of the card, for the desk to review. */
identity.post('/document', body(request), async (c) => {
  const session = await requireOpen(c.get('body').sessionId)
  return c.json(await recordDocumentCapture(session))
})

/**
 * The stub gate, kept for local work only.
 *
 * It passes for anyone holding the QR, so while running live it is refused
 * outright rather than left as a way around a check that costs money and that
 * enrolment now depends on. `SIMULATE_AADHAAR` opens it again deliberately,
 * and production refuses to boot with that on.
 */
identity.post('/verifications', body(request), async (c) => {
  if (liveAadhaar()) {
    throw new ApiError(
      'verification_required',
      'Complete the Aadhaar check to continue.',
      403,
    )
  }

  const session = await requireOpen(c.get('body').sessionId)

  const [verification] = await db
    .insert(identityVerifications)
    .values({
      guestId: session.bookingGuestId ?? null,
      sessionId: session.id,
      method: 'simulated',
      result: 'passed',
      verifiedAt: new Date(),
    })
    .returning({ id: identityVerifications.id })

  await logEvent(c, {
    venueId: session.venueId,
    sessionId: session.id,
    event: 'identity_verified',
    outcome: 'ok',
    detail: { method: 'simulated' },
  })

  return c.json({ verificationId: verification.id })
})
