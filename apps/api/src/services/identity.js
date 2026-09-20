import { and, desc, eq, isNull } from 'drizzle-orm'
import { db, transaction } from '../db/client.js'
import { bookings, guests, identityVerifications } from '../db/schema/index.js'
import { lookupHash } from '../lib/crypto.js'
import { uuidv7 } from '../lib/ids.js'
import { ApiError, notFound } from '../lib/errors.js'
import { bindGuest } from './sessions.js'
import { PROVIDER, generateOkycOtp, liveAadhaar, verifyOkycOtp } from '../lib/truid.js'

/**
 * Aadhaar identity verification, through TrueID (truid.one) as KUA.
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
 * The number reaches TrueID and this process's memory, and nowhere else.
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
 * `manual_review` record behind. What comes back is our own row id — TrueID's
 * session_id stays server-side in provider_ref.
 */
export async function requestAadhaarOtp(session, aadhaar) {
  const digits = aadhaar.replace(/\s/g, '')

  if (!isValidAadhaar(digits)) {
    throw new ApiError('invalid_aadhaar', "That doesn't look like a valid Aadhaar number.", 400)
  }

  const live = liveAadhaar()
  const providerRef = live ? (await generateOkycOtp(digits)).referenceId : null

  const [row] = await db
    .insert(identityVerifications)
    .values({
      sessionId: session.id,
      guestId: session.guestId ?? null,
      method: 'aadhaar_otp',
      provider: live ? PROVIDER : 'simulated',
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
 * The demographics come from UIDAI via TrueID. In the fallback they're
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

  // Rows written by the previous provider keep its name; only a row from the
  // provider running now can be completed, because only it holds a reference
  // the current API would recognise.
  const live = pending.provider === PROVIDER && pending.providerRef

  // While running live, a row that didn't go through the provider must not be
  // completable — otherwise a request begun while credentials were absent (or
  // while SIMULATE_AADHAAR was on) becomes a simulated pass on a live system.
  if (!live && liveAadhaar()) {
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
      subjectAddress: subject.address ?? null,
      subjectCareOf: subject.careOf ?? null,
      consent: {
        accepted: true,
        version: consent.version ?? 'v1',
        text: consent.text ?? null,
        at: new Date().toISOString(),
      },
    })
    .where(eq(identityVerifications.id, requestId))

  // The guest exists from here, not from the passkey. See ensureSessionGuest.
  await ensureSessionGuest(session, subject)

  return { verificationId: requestId, subject }
}

/**
 * Give the session a guest as soon as the identity check passes.
 *
 * Enrolment used to be what created the guest row, which quietly made a
 * passkey mandatory: a phone that couldn't enrol — an in-app browser, a
 * dismissed sheet, a device with no platform authenticator — had already cost
 * a billed UIDAI call, and the only way on was a rescan that billed another.
 * The identity check is what a hotel register is actually made of; the passkey
 * is how a returning guest skips it next time. So the order is now: verified
 * means checkable-in, enrolled means recognised.
 */
export async function ensureSessionGuest(session, subject) {
  if (session.guestId) return session.guestId

  return transaction(async (tx) => {
    const [guest] = await tx
      .insert(guests)
      .values({
        id: uuidv7(),
        displayName: subject?.name ?? session.bookingGuestName ?? 'Guest',
        dateOfBirth: subject?.dateOfBirth ?? null,
        gender: subject?.gender ?? null,
        emailHmac: lookupHash(null),
      })
      .returning({ id: guests.id })

    if (session.bookingId) {
      await tx
        .update(bookings)
        .set({ guestId: guest.id })
        .where(and(eq(bookings.id, session.bookingId), isNull(bookings.guestId)))
    }

    // The check was recorded against the session, before anyone existed to
    // record it against. Attach it, or the proof an ID was seen points at
    // nobody — which is the one record a regulator asks for.
    await tx
      .update(identityVerifications)
      .set({ guestId: guest.id })
      .where(
        and(eq(identityVerifications.sessionId, session.id), isNull(identityVerifications.guestId)),
      )

    await bindGuest(tx, session.id, guest.id)
    return guest.id
  })
}

/**
 * UIDAI's answer, in this application's shape.
 *
 * The photo is still dropped — nothing reads it. The address and care-of are
 * kept, because a hotel register asks for them by law and the dashboard shows
 * them; storing PII with no reader is the liability, storing what the register
 * requires is the job.
 */
function holderFrom(data, last4) {
  const subject = {
    name: data.name?.trim() || null,
    dateOfBirth: isoDate(data.date_of_birth),
    gender: normalizeGender(data.gender),
    // Whatever parts UIDAI holds, unflattened. Null rather than {} when the
    // record carries none, so "never returned" and "returned empty" stay
    // distinguishable in the column.
    address: data.address && Object.keys(data.address).length ? data.address : null,
    careOf: data.care_of?.trim() || null,
    maskedAadhaar: `XXXX XXXX ${last4}`,
    simulated: false,
  }

  // The two fields whose format had to be assumed from the documentation. A
  // mismatch is otherwise silent — a null date and an "undisclosed" gender both
  // look like a sparse Aadhaar record. Digits are masked: the shape is what's
  // in question here, never the value.
  if (data.date_of_birth && !subject.dateOfBirth) {
    console.warn(
      'truid: unparsed date_of_birth, shape',
      String(data.date_of_birth).replace(/\d/g, 'N'),
    )
  }
  if (data.gender && subject.gender === 'undisclosed') {
    console.warn('truid: unmapped gender code', JSON.stringify(data.gender))
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
    address: null,
    careOf: null,
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
      address: identityVerifications.subjectAddress,
      careOf: identityVerifications.subjectCareOf,
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
