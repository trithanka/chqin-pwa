import { z } from 'zod'

/**
 * The contract between the PWA and the API.
 *
 * It lives here because both sides need it and neither owns it: the server
 * validates every request body against these schemas, and the client builds
 * its requests from the same definitions. When the shape changes it changes
 * in one commit for both.
 */

/* ------------------------------------------------------------------ */
/* Journeys                                                            */
/* ------------------------------------------------------------------ */

/**
 * The three check-in journeys. The guest never picks one — the server decides
 * from the device's credentials and the booking behind the QR.
 */
export const JOURNEYS = ['returning', 'newDevice', 'firstTime']
export const journeySchema = z.enum(JOURNEYS)

/**
 * Where a check-in can happen. Entry is reservation-led at a hotel,
 * membership-led at an apartment, and open at a temple — the kind is what
 * tells both sides which of those rules apply.
 */
export const VENUE_KINDS = ['hotel', 'apartment', 'temple', 'station', 'office', 'other']
export const venueKindSchema = z.enum(VENUE_KINDS)

/* ------------------------------------------------------------------ */
/* Sessions — what a scanned QR resolves to                            */
/* ------------------------------------------------------------------ */

/** A QR code carries only this token; everything else is looked up server-side. */
export const sessionTokenSchema = z.string().min(16).max(128)

/** What the client is told about a scanned session. Deliberately thin — no
 *  guest identity leaks before anyone has authenticated. */
export const sessionSchema = z.object({
  sessionId: z.uuid(),
  // A venue is anywhere someone arrives — a hotel today, an apartment block,
  // a temple or a station later. `kind` is what tells the client which arrival
  // rules apply.
  venue: z.object({
    name: z.string(),
    kind: z.enum(VENUE_KINDS),
    location: z.string().nullable(),
  }),
  booking: z
    .object({
      reference: z.string(),
      guestName: z.string(), // as booked — a name on a reservation, not an identity
      roomNumber: z.string().nullable(),
      arrivalDate: z.string(),
      departureDate: z.string(),
    })
    .nullable(),
  expiresAt: z.string(),
})

export const resolveSessionRequest = z.object({ token: sessionTokenSchema })

/* ------------------------------------------------------------------ */
/* Detection                                                           */
/* ------------------------------------------------------------------ */

/**
 * The client sends the credential IDs its authenticator hints at (or none),
 * and the server answers with the journey. WebAuthn can't enumerate
 * credentials, so this is a hint the ceremony then has to confirm.
 */
export const detectRequest = z.object({
  sessionId: z.uuid(),
  knownCredentialIds: z.array(z.string()).max(20).default([]),
})

export const detectResponse = z.object({
  journey: journeySchema,
  /** Present only for returning guests — a name to say hello with, nothing more. */
  greetingName: z.string().nullable(),
})

/* ------------------------------------------------------------------ */
/* WebAuthn ceremonies                                                 */
/* ------------------------------------------------------------------ */

export const registrationOptionsRequest = z.object({
  sessionId: z.uuid(),
  /** Proof the guest passed the one-time identity check in this session. */
  verificationId: z.uuid().nullable().default(null),
})

export const registrationVerifyRequest = z.object({
  sessionId: z.uuid(),
  challengeId: z.uuid(),
  credential: z.object({
    id: z.string(),
    rawId: z.string(),
    type: z.literal('public-key'),
    clientExtensionResults: z.record(z.string(), z.unknown()).default({}),
    response: z.object({
      clientDataJSON: z.string(),
      attestationObject: z.string(),
      transports: z.array(z.string()).optional(),
    }),
  }),
  deviceLabel: z.string().max(80).nullable().default(null),
})

export const authenticationOptionsRequest = z.object({
  sessionId: z.uuid(),
})

export const authenticationVerifyRequest = z.object({
  sessionId: z.uuid(),
  challengeId: z.uuid(),
  credential: z.object({
    id: z.string(),
    rawId: z.string(),
    type: z.literal('public-key'),
    clientExtensionResults: z.record(z.string(), z.unknown()).default({}),
    response: z.object({
      clientDataJSON: z.string(),
      authenticatorData: z.string(),
      signature: z.string(),
      userHandle: z.string().nullable().optional(),
    }),
  }),
})

/* ------------------------------------------------------------------ */
/* Check-in                                                            */
/* ------------------------------------------------------------------ */

export const checkinRequest = z.object({
  sessionId: z.uuid(),
  /** Same key on a retry must not produce a second check-in. */
  idempotencyKey: z.string().min(8).max(64),
})

export const checkinResponse = z.object({
  checkinId: z.uuid(),
  journey: journeySchema,
  venueName: z.string(),
  roomNumber: z.string().nullable(),
  checkedInAt: z.string(),
})

/** Every error the API returns has this shape. */
export const apiError = z.object({
  error: z.string(),
  message: z.string(),
})
