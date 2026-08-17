import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/client.js'
import { identityVerifications } from '../db/schema/index.js'
import { ApiError } from '../lib/errors.js'
import { sandboxConfigured } from '../lib/sandbox.js'
import { body } from '../lib/validate.js'
import { logEvent } from '../services/audit.js'
import { requireOpen } from '../services/sessions.js'
import {
  recordDocumentCapture,
  requestAadhaarOtp,
  verifyAadhaarOtp,
} from '../services/identity.js'

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

/** The secondary path: a photo of the card, for the desk to review. */
identity.post('/document', body(request), async (c) => {
  const session = await requireOpen(c.get('body').sessionId)
  return c.json(await recordDocumentCapture(session))
})

/**
 * The stub gate, kept for local work only.
 *
 * It passes for anyone holding the QR, so with a KUA configured it is refused
 * outright rather than left as a way around a check that costs money and that
 * enrolment now depends on.
 */
identity.post('/verifications', body(request), async (c) => {
  if (sandboxConfigured()) {
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
