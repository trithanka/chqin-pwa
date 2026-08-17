import { and, eq, isNull, sql } from 'drizzle-orm'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import { cose, decodeCredentialPublicKey } from '@simplewebauthn/server/helpers'
import { config } from '../config.js'
import { db, transaction } from '../db/client.js'
import {
  bookings,
  credentials,
  guests,
  identityVerifications,
  webauthnChallenges,
} from '../db/schema/index.js'
import { lookupHash } from '../lib/crypto.js'
import { uuidv7 } from '../lib/ids.js'
import { ApiError, forbidden, unauthorized } from '../lib/errors.js'
import { sandboxConfigured } from '../lib/sandbox.js'
import { attachBooking, bindGuest } from './sessions.js'
import { verifiedSubject } from './identity.js'

/**
 * The relying party. Challenges are issued and verified here — the client
 * never checks its own proof.
 */

const rp = () => ({ id: config.RP_ID, name: config.RP_NAME })

/**
 * Single-use by construction: the UPDATE that reads a challenge also consumes
 * it, so a replay finds nothing rather than being compared and rejected.
 */
async function consumeChallenge(tx, challengeId, purpose, sessionId) {
  const [row] = await tx
    .update(webauthnChallenges)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(webauthnChallenges.id, challengeId),
        eq(webauthnChallenges.purpose, purpose),
        eq(webauthnChallenges.sessionId, sessionId),
        isNull(webauthnChallenges.consumedAt),
        sql`${webauthnChallenges.expiresAt} > now()`,
      ),
    )
    .returning()

  if (!row) throw new ApiError('challenge', 'Challenge expired. Try again.', 400)
  return row
}

/* ------------------------------------------------------------------ */
/* Registration                                                        */
/* ------------------------------------------------------------------ */

/**
 * A ceremony needs a user handle up front, but a guest who never finishes
 * shouldn't leave a row behind — so an unknown guest gets a handle minted on
 * the challenge and becomes a row only when registration verifies.
 */
async function resolveUserHandle(tx, session) {
  if (session.bookingGuestId) {
    const [guest] = await tx
      .select({ id: guests.id, displayName: guests.displayName })
      .from(guests)
      .where(eq(guests.id, session.bookingGuestId))
      .limit(1)
    if (guest) return { guestId: guest.id, handle: guest.id, name: guest.displayName }
  }
  // What the OS shows in the guest's passkey list, so it has to be the best
  // name available: verified first, then the booking, then nothing useful.
  const subject = await verifiedSubject(session.id)
  return {
    guestId: null,
    handle: uuidv7(),
    name: subject?.name ?? session.bookingGuestName ?? 'Guest',
  }
}

export async function startRegistration(session) {
  // A device may only enrol behind an identity check passed in this session —
  // and once a KUA is configured, only behind one UIDAI actually answered. The
  // simulated paths mint a `passed` row for anyone holding the QR, so accepting
  // any of them would leave the Aadhaar check decorative on a live system.
  const passed = await db.query.identityVerifications.findFirst({
    where: (v, { and: a, eq: e }) =>
      sandboxConfigured()
        ? a(e(v.sessionId, session.id), e(v.result, 'passed'), e(v.provider, 'sandbox'))
        : a(e(v.sessionId, session.id), e(v.result, 'passed')),
  })
  if (!passed) throw forbidden('verification_required', 'Complete the identity check first.')

  return transaction(async (tx) => {
    const user = await resolveUserHandle(tx, session)

    const existing = user.guestId
      ? await tx
          .select({ credentialId: credentials.credentialId, transports: credentials.transports })
          .from(credentials)
          .where(and(eq(credentials.guestId, user.guestId), isNull(credentials.revokedAt)))
      : []

    const options = await generateRegistrationOptions({
      rpName: rp().name,
      rpID: rp().id,
      userID: new TextEncoder().encode(user.handle),
      userName: user.name,
      userDisplayName: user.name,
      attestationType: 'none',
      // Enrolling the same device twice would leave a dead credential behind.
      excludeCredentials: existing.map((row) => ({
        id: row.credentialId,
        transports: row.transports ?? undefined,
      })),
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        // Discoverable: a returning guest authenticates with no username.
        residentKey: 'required',
        userVerification: 'required',
      },
    })

    const [challenge] = await tx
      .insert(webauthnChallenges)
      .values({
        sessionId: session.id,
        guestId: user.guestId,
        pendingUserHandle: user.handle,
        pendingDisplayName: user.name,
        purpose: 'registration',
        challenge: options.challenge,
        expiresAt: new Date(Date.now() + config.CHALLENGE_TTL_MS),
      })
      .returning({ id: webauthnChallenges.id })

    return { challengeId: challenge.id, options }
  })
}

/** Called only after a ceremony verifies — never when options are issued. */
async function materialiseGuest(tx, challenge, session) {
  if (challenge.guestId) return challenge.guestId

  // Prefer what the identity check returned: a verified name beats the name on
  // a reservation, and both beat "Guest".
  const subject = await verifiedSubject(session.id)

  const [guest] = await tx
    .insert(guests)
    .values({
      id: challenge.pendingUserHandle,
      displayName: subject?.name ?? challenge.pendingDisplayName ?? 'Guest',
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

  // The identity check happened before this guest existed — it was recorded
  // against the session. Attach it now, or the proof that an ID was seen
  // points at nobody, which is exactly the record a regulator asks for.
  await tx
    .update(identityVerifications)
    .set({ guestId: guest.id })
    .where(
      and(
        eq(identityVerifications.sessionId, session.id),
        isNull(identityVerifications.guestId),
      ),
    )

  return guest.id
}

export function finishRegistration(session, { challengeId, credential, deviceLabel }) {
  return transaction(async (tx) => {
    const challenge = await consumeChallenge(tx, challengeId, 'registration', session.id)

    // A malformed response is the client's problem, not a server fault:
    // SimpleWebAuthn throws plain Errors, which would surface as a 500.
    let verification
    try {
      verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: challenge.challenge,
        expectedOrigin: config.ORIGINS,
        expectedRPID: config.RP_ID,
        requireUserVerification: true,
      })
    } catch (err) {
      throw new ApiError('unverified', `Passkey could not be verified: ${err.message}`, 400)
    }
    if (!verification.verified) {
      throw new ApiError('unverified', 'Passkey could not be verified.', 400)
    }

    const guestId = await materialiseGuest(tx, challenge, session)
    const { credential: created, aaguid, credentialBackedUp, credentialDeviceType } =
      verification.registrationInfo

    const coseKey = decodeCredentialPublicKey(created.publicKey)
    const [stored] = await tx
      .insert(credentials)
      .values({
        guestId,
        credentialId: created.id,
        publicKey: Buffer.from(created.publicKey),
        alg: coseKey.get(cose.COSEKEYS.alg),
        signCount: created.counter,
        aaguid: aaguid || null,
        transports: created.transports ?? null,
        backupEligible: credentialDeviceType === 'multiDevice',
        backedUp: credentialBackedUp,
        deviceLabel: deviceLabel ?? null,
      })
      .returning({ credentialId: credentials.credentialId })

    // Only now is the session authenticated: a verified ceremony, not a
    // request for options, is what says who the guest is.
    await bindGuest(tx, session.id, guestId)
    await attachBooking(tx, session, guestId)

    return { credentialId: stored.credentialId, guestId }
  })
}

/* ------------------------------------------------------------------ */
/* Authentication                                                      */
/* ------------------------------------------------------------------ */

export async function startAuthentication(session) {
  const options = await generateAuthenticationOptions({
    rpID: config.RP_ID,
    // Empty: any discoverable credential for this site. Naming credentials
    // here would leak which guests have enrolled on this device.
    allowCredentials: [],
    userVerification: 'required',
  })

  const [challenge] = await db
    .insert(webauthnChallenges)
    .values({
      sessionId: session.id,
      purpose: 'authentication',
      challenge: options.challenge,
      expiresAt: new Date(Date.now() + config.CHALLENGE_TTL_MS),
    })
    .returning({ id: webauthnChallenges.id })

  return { challengeId: challenge.id, options }
}

export function finishAuthentication(session, { challengeId, credential }) {
  return transaction(async (tx) => {
    const challenge = await consumeChallenge(tx, challengeId, 'authentication', session.id)

    const [stored] = await tx
      .select({
        id: credentials.id,
        guestId: credentials.guestId,
        credentialId: credentials.credentialId,
        publicKey: credentials.publicKey,
        signCount: credentials.signCount,
        transports: credentials.transports,
        displayName: guests.displayName,
        guestStatus: guests.status,
      })
      .from(credentials)
      .innerJoin(guests, eq(guests.id, credentials.guestId))
      .where(and(eq(credentials.credentialId, credential.id), isNull(credentials.revokedAt)))
      .limit(1)
      .for('update', { of: credentials })

    if (!stored || stored.guestStatus !== 'active') {
      throw unauthorized('unknown_credential', 'This device is not recognised.')
    }

    let verification
    try {
      verification = await verifyAuthenticationResponse({
        response: credential,
        expectedChallenge: challenge.challenge,
        expectedOrigin: config.ORIGINS,
        expectedRPID: config.RP_ID,
        requireUserVerification: true,
        credential: {
          id: stored.credentialId,
          publicKey: new Uint8Array(stored.publicKey),
          counter: Number(stored.signCount),
          transports: stored.transports ?? undefined,
        },
      })
    } catch (err) {
      throw unauthorized('unverified', `Passkey proof rejected: ${err.message}`)
    }
    if (!verification.verified) {
      throw unauthorized('unverified', 'Passkey proof rejected.')
    }

    // A counter that goes backwards means the credential was cloned.
    const newCounter = verification.authenticationInfo.newCounter
    if (newCounter !== 0 && newCounter <= Number(stored.signCount)) {
      throw unauthorized('counter', 'This passkey looks cloned.')
    }

    await tx
      .update(credentials)
      .set({ signCount: newCounter, lastUsedAt: new Date() })
      .where(eq(credentials.id, stored.id))

    await bindGuest(tx, session.id, stored.guestId)
    await attachBooking(tx, session, stored.guestId)

    return {
      guestId: stored.guestId,
      greetingName: stored.displayName,
      credentialId: stored.credentialId,
    }
  })
}
