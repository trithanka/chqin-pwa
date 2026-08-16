import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '../db/client.js'
import { identityVerifications } from '../db/schema/index.js'
import { lookupHash } from '../lib/crypto.js'
import { ApiError, notFound } from '../lib/errors.js'

/**
 * Aadhaar identity verification.
 *
 * SIMULATED. Real Aadhaar OTP eKYC can only be performed by a UIDAI-licensed
 * AUA/KUA, and the demographic response comes from UIDAI — not from us. What's
 * real here is the *shape*: request an OTP against a number, verify it, and
 * receive name / date of birth / gender back. Swapping in a licensed provider
 * replaces the two functions below and nothing else.
 *
 * What is deliberately never stored, then or now: the Aadhaar number itself.
 * The Aadhaar Act restricts holding it, and a hotel has no need to — a keyed
 * hash recognises a returning guest and the last four digits are all a human
 * ever needs to see. Anything else belongs in a licensed vault, not this table.
 */

const OTP_TTL_MS = 5 * 60 * 1000

/** Verhoeff checksum — the real thing UIDAI numbers carry. */
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]

export function isValidAadhaar(value) {
  const digits = String(value).replace(/\s/g, '')
  if (!/^\d{12}$/.test(digits)) return false

  let c = 0
  ;[...digits].reverse().forEach((d, i) => {
    c = D[c][P[i % 8][Number(d)]]
  })
  return c === 0
}

/**
 * Ask for an OTP.
 *
 * Returns a reference the verify step needs, plus the masked number so the
 * guest can see we read it correctly. A real provider also returns which
 * mobile the OTP went to, masked.
 */
export async function requestAadhaarOtp(session, aadhaar) {
  const digits = aadhaar.replace(/\s/g, '')

  if (!isValidAadhaar(digits)) {
    throw new ApiError('invalid_aadhaar', "That doesn't look like a valid Aadhaar number.", 400)
  }

  const [row] = await db
    .insert(identityVerifications)
    .values({
      sessionId: session.id,
      guestId: session.guestId ?? null,
      method: 'aadhaar_otp',
      provider: 'simulated',
      documentType: 'aadhaar',
      documentHmac: lookupHash(digits),
      documentLast4: digits.slice(-4),
      result: 'manual_review', // becomes 'passed' once the OTP checks out
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    })
    .returning({ id: identityVerifications.id })

  return {
    requestId: row.id,
    maskedAadhaar: `XXXX XXXX ${digits.slice(-4)}`,
    // A licensed provider tells you where it sent the code; we can't know.
    sentTo: 'the mobile registered with Aadhaar',
    expiresInSeconds: OTP_TTL_MS / 1000,
  }
}

/**
 * Check the OTP and return the holder's details.
 *
 * The demographic data is invented, and says so — a name that came from a
 * simulation must never be mistaken for one UIDAI vouched for.
 */
export async function verifyAadhaarOtp(session, { requestId, otp, consent }) {
  if (!/^\d{6}$/.test(otp)) {
    throw new ApiError('invalid_otp', 'Enter the six-digit code.', 400)
  }
  if (!consent?.accepted) {
    throw new ApiError('consent_required', 'Accept the terms to continue.', 400)
  }

  const [pending] = await db
    .select()
    .from(identityVerifications)
    .where(
      and(
        eq(identityVerifications.id, requestId),
        eq(identityVerifications.sessionId, session.id),
        isNull(identityVerifications.verifiedAt),
      ),
    )
    .limit(1)

  if (!pending) throw notFound('That verification has expired. Start again.')
  if (pending.expiresAt && pending.expiresAt < new Date()) {
    throw new ApiError('otp_expired', 'That code expired. Request a new one.', 400)
  }

  // A real provider decides this. Ours accepts any six digits and says so on
  // the screen, so nobody mistakes the prototype for a working check.
  const subject = simulatedHolder(pending.documentLast4, session)

  await db
    .update(identityVerifications)
    .set({
      result: 'passed',
      verifiedAt: new Date(),
      subjectName: subject.name,
      subjectDob: subject.dateOfBirth,
      subjectGender: subject.gender,
      consent: {
        accepted: true,
        version: consent.version ?? 'v1',
        text: consent.text ?? null,
        at: new Date().toISOString(),
      },
    })
    .where(eq(identityVerifications.id, requestId))

  return { verificationId: requestId, subject }
}

/** Stand-in demographics. A provider replaces this entirely. */
function simulatedHolder(last4, session) {
  return {
    name: session.bookingGuestName ?? 'Verified Guest',
    dateOfBirth: '1994-03-12',
    gender: 'undisclosed',
    maskedAadhaar: `XXXX XXXX ${last4}`,
    simulated: true,
  }
}

/** The verified details for a session, if any — used when creating the guest. */
export async function verifiedSubject(sessionId) {
  const [row] = await db
    .select({
      name: identityVerifications.subjectName,
      dateOfBirth: identityVerifications.subjectDob,
      gender: identityVerifications.subjectGender,
    })
    .from(identityVerifications)
    .where(
      and(
        eq(identityVerifications.sessionId, sessionId),
        eq(identityVerifications.result, 'passed'),
      ),
    )
    .orderBy(desc(identityVerifications.verifiedAt))
    .limit(1)

  return row?.name ? row : null
}

/** Records a document photo taken instead of typing the number. */
export async function recordDocumentCapture(session) {
  const [row] = await db
    .insert(identityVerifications)
    .values({
      sessionId: session.id,
      guestId: session.guestId ?? null,
      method: 'document',
      provider: 'simulated',
      documentType: 'aadhaar',
      result: 'manual_review',
      verifiedAt: null,
      // The image is never uploaded: artifactUri stays null until there's a
      // vault to put it in and a reason to keep it.
    })
    .returning({ id: identityVerifications.id })

  return { captureId: row.id }
}
