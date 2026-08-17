import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '../db/client.js'
import { identityVerifications } from '../db/schema/index.js'
import { lookupHash } from '../lib/crypto.js'
import { ApiError, notFound } from '../lib/errors.js'
import { generateOkycOtp, sandboxConfigured, verifyOkycOtp } from '../lib/sandbox.js'

/**
 * Aadhaar identity verification, through Sandbox (sandbox.co.in) as KUA.
 *
 * Aadhaar OTP eKYC can only be performed by a UIDAI-licensed AUA/KUA, and the
 * demographic response comes from UIDAI — never from us. With credentials
 * configured, both functions below are real calls. Without them they fall back
 * to a simulation for local work, and every response says `simulated: true` so
 * an invented name can't be mistaken for one UIDAI vouched for. config.js
 * refuses to boot production in that state.
 *
 * What is deliberately never stored: the Aadhaar number itself. The Aadhaar Act
 * restricts holding it, and a hotel has no need to — a keyed hash recognises a
 * returning guest and the last four digits are all a human ever needs to see.
 * The number reaches Sandbox and this process's memory, and nowhere else.
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
 * Verhoeff first, then the provider, then the row: a typo shouldn't cost a
 * billed transaction, and a refused number shouldn't leave a dangling
 * `manual_review` record behind. What comes back is our own row id — Sandbox's
 * reference_id stays server-side in provider_ref.
 */
export async function requestAadhaarOtp(session, aadhaar) {
  const digits = aadhaar.replace(/\s/g, '')

  if (!isValidAadhaar(digits)) {
    throw new ApiError('invalid_aadhaar', "That doesn't look like a valid Aadhaar number.", 400)
  }

  const live = sandboxConfigured()
  const providerRef = live ? (await generateOkycOtp(digits)).referenceId : null

  const [row] = await db
    .insert(identityVerifications)
    .values({
      sessionId: session.id,
      guestId: session.guestId ?? null,
      method: 'aadhaar_otp',
      provider: live ? 'sandbox' : 'simulated',
      providerRef,
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
    // UIDAI doesn't tell the KUA which mobile it sent the code to.
    sentTo: 'the mobile registered with Aadhaar',
    expiresInSeconds: OTP_TTL_MS / 1000,
    simulated: !live,
  }
}

/**
 * Check the OTP and return the holder's details.
 *
 * The demographics come from UIDAI via Sandbox. In the fallback they're
 * invented and flagged as such.
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

  const live = pending.provider === 'sandbox' && pending.providerRef

  // With credentials configured, a row that didn't go through the provider must
  // not be completable — otherwise a request begun while they were absent
  // becomes a simulated pass on a live system.
  if (!live && sandboxConfigured()) {
    throw new ApiError('provider_mismatch', 'That verification is stale. Start again.', 409)
  }

  // UIDAI decides this. A wrong code throws, and the row stays pending so the
  // guest can use their remaining attempts without starting over.
  const subject = live
    ? holderFrom(await verifyOkycOtp(pending.providerRef, otp), pending.documentLast4)
    : simulatedHolder(pending.documentLast4, session)

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

/**
 * UIDAI's answer, in this application's shape.
 *
 * The photo, address and hashed contact details Sandbox also returns are
 * dropped here rather than stored: a guest register needs a name, a date of
 * birth and a gender, and everything beyond that is a liability with no reader.
 */
function holderFrom(data, last4) {
  const subject = {
    name: data.name?.trim() || null,
    dateOfBirth: isoDate(data.date_of_birth),
    gender: normalizeGender(data.gender),
    maskedAadhaar: `XXXX XXXX ${last4}`,
    simulated: false,
  }

  // The two fields whose format had to be assumed from the documentation. A
  // mismatch is otherwise silent — a null date and an "undisclosed" gender both
  // look like a sparse Aadhaar record. Digits are masked: the shape is what's
  // in question here, never the value.
  if (data.date_of_birth && !subject.dateOfBirth) {
    console.warn(
      'sandbox: unparsed date_of_birth, shape',
      String(data.date_of_birth).replace(/\d/g, 'N'),
    )
  }
  if (data.gender && subject.gender === 'undisclosed') {
    console.warn('sandbox: unmapped gender code', JSON.stringify(data.gender))
  }

  return subject
}

/**
 * A `date` column takes YYYY-MM-DD; UIDAI records are usually DD-MM-YYYY.
 *
 * An unrecognised shape returns null. A partial Aadhaar record carries only a
 * year of birth, and writing "1994" into a date column is an error at the far
 * end of the request, long after the cause.
 */
function isoDate(value) {
  const text = String(value ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text

  const dmy = text.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/)
  return dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : null
}

/**
 * UIDAI says M / F / T; `guests_gender` accepts four specific words.
 *
 * Mapping here rather than at guest creation keeps the failure next to its
 * cause — an unmapped value otherwise passes this table's unconstrained column
 * and trips the check on `guests` several steps later.
 */
function normalizeGender(value) {
  switch (String(value ?? '').trim().toUpperCase()) {
    case 'F':
    case 'FEMALE':
      return 'female'
    case 'M':
    case 'MALE':
      return 'male'
    case 'T':
    case 'O':
    case 'TRANSGENDER':
    case 'OTHER':
      return 'other'
    default:
      return 'undisclosed'
  }
}

/** Stand-in demographics for local work, when no credentials are configured. */
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
