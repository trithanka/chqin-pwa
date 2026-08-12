import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '../db/client.js'
import { checkinSessions, credentials, guests } from '../db/schema/index.js'

/**
 * Which journey the guest is in. The guest never picks — this decides, from
 * the credentials the device claims and the booking behind the QR.
 *
 * The device's list is a *hint*: WebAuthn gives no way to enumerate
 * credentials without a user gesture and a biometric prompt, so a client-held
 * record is how any real app guesses. The ceremony that follows is what
 * confirms it, and a failed one falls back to the new-device path.
 */
export async function decideJourney(session, knownCredentialIds) {
  if (knownCredentialIds.length) {
    const [match] = await db
      .select({ id: guests.id, displayName: guests.displayName })
      .from(credentials)
      .innerJoin(guests, eq(guests.id, credentials.guestId))
      .where(
        and(
          inArray(credentials.credentialId, knownCredentialIds),
          isNull(credentials.revokedAt),
          eq(guests.status, 'active'),
        ),
      )
      .limit(1)

    if (match) return { journey: 'returning', greetingName: match.displayName }
  }

  // No usable passkey here. The booking behind the QR is what makes recovery
  // possible without a phone number or an OTP.
  if (session.bookingGuestId) {
    const [guest] = await db
      .select({ displayName: guests.displayName })
      .from(guests)
      .where(eq(guests.id, session.bookingGuestId))
      .limit(1)
    return { journey: 'newDevice', greetingName: guest?.displayName ?? null }
  }

  return { journey: 'firstTime', greetingName: null }
}

/**
 * Recorded on the session, because enrolment sets `bookings.guestId` — so
 * recomputing at check-in time would report a first-time guest as returning.
 */
export const recordJourney = (sessionId, journey) =>
  db.update(checkinSessions).set({ journey }).where(eq(checkinSessions.id, sessionId))
