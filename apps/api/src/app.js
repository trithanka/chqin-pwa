import { Hono } from 'hono'
import { cors } from 'hono/cors'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import { cose, decodeCredentialPublicKey } from '@simplewebauthn/server/helpers'
import {
  authenticationOptionsRequest,
  authenticationVerifyRequest,
  checkinRequest,
  detectRequest,
  registrationOptionsRequest,
  registrationVerifyRequest,
  resolveSessionRequest,
} from '@chqin/shared'
import { lookupHash, newSessionToken, query, tokenHash, transaction } from './db.js'

/**
 * ChqIn API — the WebAuthn relying party and the check-in state machine.
 *
 * The rule this file exists to enforce: the *server* decides the journey and
 * the *server* verifies the passkey. The client holds hints and renders; it
 * never asserts who the guest is.
 */

const RP_NAME = process.env.RP_NAME ?? 'ChqIn'
const RP_ID = process.env.RP_ID ?? 'localhost'
// Several origins in dev (Vite picks a free port); exactly one in production.
const ORIGINS = (process.env.ORIGINS ?? 'http://localhost:5173,http://localhost:5175')
  .split(',')
  .map((o) => o.trim())

const CHALLENGE_TTL_MS = 120_000
const SESSION_TTL_MS = 300_000

export const app = new Hono()

app.use('/*', cors({ origin: ORIGINS, credentials: true }))

/** Validate a body against a shared schema, or 400 with the reason. */
const parse = async (c, schema) => {
  const body = await c.req.json().catch(() => null)
  const result = schema.safeParse(body)
  if (!result.success) {
    return { error: c.json({ error: 'invalid_request', message: result.error.issues[0].message }, 400) }
  }
  return { data: result.data }
}

/** Append-only, best-effort: an audit write must never fail a check-in. */
const logEvent = (c, fields) =>
  query(
    `INSERT INTO auth_events (guest_id, credential_id, hotel_id, session_id, event, outcome, detail, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      fields.guestId ?? null,
      fields.credentialId ?? null,
      fields.hotelId ?? null,
      fields.sessionId ?? null,
      fields.event,
      fields.outcome,
      fields.detail ?? {},
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      c.req.header('user-agent') ?? null,
    ],
  ).catch((err) => console.error('auth_event write failed:', err.message))

/** Load a session regardless of state — callers decide what's acceptable. */
async function loadAnySession(sessionId) {
  const { rows } = await query(
    `SELECT s.id, s.hotel_id, s.booking_id, s.guest_id, s.status, s.expires_at, s.journey,
            h.name AS hotel_name, h.location AS hotel_location,
            b.booking_ref, b.guest_name, b.guest_id AS booking_guest_id,
            b.arrival_date, b.departure_date, r.number AS room_number
       FROM checkin_sessions s
       JOIN hotels h ON h.id = s.hotel_id
       LEFT JOIN bookings b ON b.id = s.booking_id
       LEFT JOIN rooms r ON r.id = b.room_id
      WHERE s.id = $1`,
    [sessionId],
  )
  return rows[0] ?? null
}

/** Load a session that is still open and unexpired, or null. */
async function loadSession(sessionId) {
  const session = await loadAnySession(sessionId)
  if (!session) return null
  if (session.status !== 'open' || new Date(session.expires_at) < new Date()) return null
  return session
}

const sessionPayload = (s) => ({
  sessionId: s.id,
  hotel: { name: s.hotel_name, location: s.hotel_location },
  booking: s.booking_id
    ? {
        reference: s.booking_ref,
        guestName: s.guest_name,
        roomNumber: s.room_number,
        arrivalDate: s.arrival_date.toISOString().slice(0, 10),
        departureDate: s.departure_date.toISOString().slice(0, 10),
      }
    : null,
  expiresAt: s.expires_at.toISOString(),
})

app.get('/health', async (c) => {
  const { rows } = await query('SELECT 1 AS ok')
  return c.json({ ok: rows[0].ok === 1, rpId: RP_ID })
})

/* ------------------------------------------------------------------ */
/* Sessions — what the QR resolves to                                  */
/* ------------------------------------------------------------------ */

/**
 * A printed desk QR is a long-lived 'desk' row. Scanning it mints a
 * short-lived child session, so the card on the counter identifies the
 * property while each guest gets their own single-use check-in.
 */
app.post('/sessions/resolve', async (c) => {
  const { data, error } = await parse(c, resolveSessionRequest)
  if (error) return error

  const { rows } = await query(
    `SELECT s.*, h.name AS hotel_name FROM checkin_sessions s
       JOIN hotels h ON h.id = s.hotel_id
      WHERE s.token_hash = $1`,
    [tokenHash(data.token)],
  )
  const parent = rows[0]
  if (!parent || parent.status === 'revoked' || new Date(parent.expires_at) < new Date()) {
    return c.json({ error: 'unknown_session', message: 'This QR code is not valid any more.' }, 404)
  }

  if (parent.kind !== 'desk') {
    if (parent.status !== 'open') {
      return c.json({ error: 'session_used', message: 'This QR code has already been used.' }, 409)
    }
    return c.json(sessionPayload(await loadSession(parent.id)))
  }

  const { rows: created } = await query(
    `INSERT INTO checkin_sessions (hotel_id, booking_id, parent_id, token_hash, kind, expires_at)
     VALUES ($1, $2, $3, $4, 'kiosk', now() + ($5 || ' milliseconds')::interval)
     RETURNING id`,
    [parent.hotel_id, parent.booking_id, parent.id, tokenHash(newSessionToken()), SESSION_TTL_MS],
  )
  return c.json(sessionPayload(await loadSession(created[0].id)))
})

/* ------------------------------------------------------------------ */
/* Detection — the server picks the journey, never the guest           */
/* ------------------------------------------------------------------ */

app.post('/detect', async (c) => {
  const { data, error } = await parse(c, detectRequest)
  if (error) return error

  const session = await loadSession(data.sessionId)
  if (!session) return c.json({ error: 'unknown_session', message: 'Scan the QR code again.' }, 404)

  const decide = async () => {
    // The device's hint: credential IDs it believes it holds. Only credentials
    // the server still trusts count, and the ceremony still has to confirm.
    if (data.knownCredentialIds.length) {
      const { rows } = await query(
        `SELECT g.id, g.display_name FROM credentials c
           JOIN guests g ON g.id = c.guest_id
          WHERE c.credential_id = ANY($1) AND c.revoked_at IS NULL AND g.status = 'active'
          LIMIT 1`,
        [data.knownCredentialIds],
      )
      if (rows[0]) return { journey: 'returning', greetingName: rows[0].display_name }
    }

    // No usable passkey here. The booking behind the QR is what makes recovery
    // possible without a phone number or an OTP.
    if (session.booking_guest_id) {
      const { rows } = await query('SELECT display_name FROM guests WHERE id = $1', [
        session.booking_guest_id,
      ])
      return { journey: 'newDevice', greetingName: rows[0]?.display_name ?? null }
    }

    return { journey: 'firstTime', greetingName: null }
  }

  const decision = await decide()
  // Recorded now, because enrolment changes the state this was decided from.
  await query('UPDATE checkin_sessions SET journey = $1 WHERE id = $2', [
    decision.journey,
    session.id,
  ])
  return c.json(decision)
})

/* ------------------------------------------------------------------ */
/* Identity check — one-time, before a device may enrol                */
/* ------------------------------------------------------------------ */

/**
 * Records that the one-time check happened. The document itself is not sent
 * here and not stored — wiring a KYC provider replaces the body of this route,
 * not its contract.
 */
app.post('/identity/verifications', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const session = await loadSession(body.sessionId)
  if (!session) return c.json({ error: 'unknown_session', message: 'Scan the QR code again.' }, 404)

  const { rows } = await query(
    `INSERT INTO identity_verifications (guest_id, session_id, method, result, verified_at)
     VALUES ($1, $2, 'simulated', 'passed', now()) RETURNING id`,
    [session.booking_guest_id ?? null, session.id],
  )
  await logEvent(c, {
    hotelId: session.hotel_id,
    sessionId: session.id,
    event: 'identity_verified',
    outcome: 'ok',
    detail: { method: 'simulated' },
  })
  return c.json({ verificationId: rows[0].id })
})

/* ------------------------------------------------------------------ */
/* WebAuthn: registration                                              */
/* ------------------------------------------------------------------ */

/** The identity has to exist before the ceremony, because it is the user handle. */
async function ensureGuest(client, session) {
  if (session.booking_guest_id) {
    const { rows } = await query('SELECT * FROM guests WHERE id = $1', [session.booking_guest_id])
    if (rows[0]) return rows[0]
  }

  const { rows } = await client.query(
    `INSERT INTO guests (display_name, email_hmac) VALUES ($1, $2) RETURNING *`,
    [session.guest_name ?? 'Guest', lookupHash(null)],
  )
  const guest = rows[0]
  if (session.booking_id) {
    await client.query('UPDATE bookings SET guest_id = $1 WHERE id = $2 AND guest_id IS NULL', [
      guest.id,
      session.booking_id,
    ])
  }
  return guest
}

app.post('/webauthn/registration/options', async (c) => {
  const { data, error } = await parse(c, registrationOptionsRequest)
  if (error) return error

  const session = await loadSession(data.sessionId)
  if (!session) return c.json({ error: 'unknown_session', message: 'Scan the QR code again.' }, 404)

  // A device may only enrol behind a passed identity check in this session.
  const { rows: checks } = await query(
    `SELECT id FROM identity_verifications
      WHERE session_id = $1 AND result = 'passed'
      ORDER BY created_at DESC LIMIT 1`,
    [session.id],
  )
  if (!checks[0]) {
    return c.json(
      { error: 'verification_required', message: 'Complete the identity check first.' },
      403,
    )
  }

  const result = await transaction(async (client) => {
    const guest = await ensureGuest(client, session)

    const { rows: existing } = await client.query(
      `SELECT credential_id, transports FROM credentials
        WHERE guest_id = $1 AND revoked_at IS NULL`,
      [guest.id],
    )

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: new TextEncoder().encode(guest.id),
      userName: guest.display_name,
      userDisplayName: guest.display_name,
      attestationType: 'none',
      // Enrolling the same device twice would leave a dead credential behind.
      excludeCredentials: existing.map((row) => ({
        id: row.credential_id,
        transports: row.transports ?? undefined,
      })),
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        // Discoverable: a returning guest authenticates with no username.
        residentKey: 'required',
        userVerification: 'required',
      },
    })

    const { rows: challenge } = await client.query(
      `INSERT INTO webauthn_challenges (session_id, guest_id, purpose, challenge, expires_at)
       VALUES ($1, $2, 'registration', $3, now() + ($4 || ' milliseconds')::interval)
       RETURNING id`,
      [session.id, guest.id, options.challenge, CHALLENGE_TTL_MS],
    )
    await client.query('UPDATE checkin_sessions SET guest_id = $1 WHERE id = $2', [
      guest.id,
      session.id,
    ])
    return { options, challengeId: challenge[0].id }
  })

  return c.json({ challengeId: result.challengeId, options: result.options })
})

/**
 * A desk QR carries no reservation — it identifies the property. Once a
 * ceremony says who the guest is, find today's booking for them and attach it.
 * A guest with no arrival today gets no booking, and check-in tells them so
 * rather than inventing one.
 */
async function attachBooking(client, session, guestId) {
  if (session.booking_id) return session.booking_id
  const { rows } = await client.query(
    `SELECT id FROM bookings
      WHERE hotel_id = $1 AND guest_id = $2 AND status = 'confirmed'
        AND arrival_date = CURRENT_DATE
      ORDER BY created_at LIMIT 1`,
    [session.hotel_id, guestId],
  )
  if (!rows[0]) return null
  await client.query('UPDATE checkin_sessions SET booking_id = $1 WHERE id = $2', [
    rows[0].id,
    session.id,
  ])
  return rows[0].id
}

/** Single-use: consumed on read, so a replayed challenge is simply not found. */
async function consumeChallenge(client, challengeId, purpose, sessionId) {
  const { rows } = await client.query(
    `UPDATE webauthn_challenges
        SET consumed_at = now()
      WHERE id = $1 AND purpose = $2 AND session_id = $3
        AND consumed_at IS NULL AND expires_at > now()
      RETURNING *`,
    [challengeId, purpose, sessionId],
  )
  return rows[0] ?? null
}

app.post('/webauthn/registration/verify', async (c) => {
  const { data, error } = await parse(c, registrationVerifyRequest)
  if (error) return error

  const session = await loadSession(data.sessionId)
  if (!session) return c.json({ error: 'unknown_session', message: 'Scan the QR code again.' }, 404)

  try {
    const stored = await transaction(async (client) => {
      const challenge = await consumeChallenge(client, data.challengeId, 'registration', session.id)
      if (!challenge) throw Object.assign(new Error('Challenge expired. Try again.'), { code: 'challenge' })

      const verification = await verifyRegistrationResponse({
        response: data.credential,
        expectedChallenge: challenge.challenge,
        expectedOrigin: ORIGINS,
        expectedRPID: RP_ID,
        requireUserVerification: true,
      })
      if (!verification.verified) {
        throw Object.assign(new Error('Passkey could not be verified.'), { code: 'unverified' })
      }

      const { credential, aaguid, credentialBackedUp, credentialDeviceType } =
        verification.registrationInfo
      const coseKey = decodeCredentialPublicKey(credential.publicKey)
      const alg = coseKey.get(cose.COSEKEYS.alg)

      const { rows } = await client.query(
        `INSERT INTO credentials
           (guest_id, credential_id, public_key, alg, sign_count, aaguid, transports,
            backup_eligible, backed_up, device_label)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, credential_id`,
        [
          challenge.guest_id,
          credential.id,
          Buffer.from(credential.publicKey),
          alg,
          credential.counter,
          aaguid || null,
          credential.transports ?? null,
          credentialDeviceType === 'multiDevice',
          credentialBackedUp,
          data.deviceLabel,
        ],
      )
      await attachBooking(client, session, challenge.guest_id)
      return { credential: rows[0], guestId: challenge.guest_id }
    })

    await logEvent(c, {
      guestId: stored.guestId,
      credentialId: stored.credential.credential_id,
      hotelId: session.hotel_id,
      sessionId: session.id,
      event: 'register',
      outcome: 'ok',
    })
    return c.json({ credentialId: stored.credential.credential_id, guestId: stored.guestId })
  } catch (err) {
    await logEvent(c, {
      hotelId: session.hotel_id,
      sessionId: session.id,
      event: 'register',
      outcome: 'failed',
      detail: { reason: err.message },
    })
    return c.json({ error: err.code ?? 'registration_failed', message: err.message }, 400)
  }
})

/* ------------------------------------------------------------------ */
/* WebAuthn: authentication                                            */
/* ------------------------------------------------------------------ */

app.post('/webauthn/authentication/options', async (c) => {
  const { data, error } = await parse(c, authenticationOptionsRequest)
  if (error) return error

  const session = await loadSession(data.sessionId)
  if (!session) return c.json({ error: 'unknown_session', message: 'Scan the QR code again.' }, 404)

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    // Empty: any discoverable credential for this site. Naming credentials
    // here would leak which guests have enrolled on this device.
    allowCredentials: [],
    userVerification: 'required',
  })

  const { rows } = await query(
    `INSERT INTO webauthn_challenges (session_id, purpose, challenge, expires_at)
     VALUES ($1, 'authentication', $2, now() + ($3 || ' milliseconds')::interval)
     RETURNING id`,
    [session.id, options.challenge, CHALLENGE_TTL_MS],
  )
  return c.json({ challengeId: rows[0].id, options })
})

app.post('/webauthn/authentication/verify', async (c) => {
  const { data, error } = await parse(c, authenticationVerifyRequest)
  if (error) return error

  const session = await loadSession(data.sessionId)
  if (!session) return c.json({ error: 'unknown_session', message: 'Scan the QR code again.' }, 404)

  try {
    const result = await transaction(async (client) => {
      const challenge = await consumeChallenge(
        client,
        data.challengeId,
        'authentication',
        session.id,
      )
      if (!challenge) throw Object.assign(new Error('Challenge expired. Try again.'), { code: 'challenge' })

      const { rows } = await client.query(
        `SELECT c.*, g.display_name, g.status AS guest_status
           FROM credentials c JOIN guests g ON g.id = c.guest_id
          WHERE c.credential_id = $1 AND c.revoked_at IS NULL
          FOR UPDATE OF c`,
        [data.credential.id],
      )
      const stored = rows[0]
      if (!stored || stored.guest_status !== 'active') {
        throw Object.assign(new Error('This device is not recognised.'), { code: 'unknown_credential' })
      }

      const verification = await verifyAuthenticationResponse({
        response: data.credential,
        expectedChallenge: challenge.challenge,
        expectedOrigin: ORIGINS,
        expectedRPID: RP_ID,
        requireUserVerification: true,
        credential: {
          id: stored.credential_id,
          publicKey: new Uint8Array(stored.public_key),
          counter: Number(stored.sign_count),
          transports: stored.transports ?? undefined,
        },
      })
      if (!verification.verified) {
        throw Object.assign(new Error('Passkey proof rejected.'), { code: 'unverified' })
      }

      // A counter that goes backwards means the credential was cloned.
      const newCounter = verification.authenticationInfo.newCounter
      if (newCounter !== 0 && newCounter <= Number(stored.sign_count)) {
        throw Object.assign(new Error('This passkey looks cloned.'), { code: 'counter' })
      }

      await client.query(
        'UPDATE credentials SET sign_count = $1, last_used_at = now() WHERE id = $2',
        [newCounter, stored.id],
      )
      await client.query('UPDATE checkin_sessions SET guest_id = $1 WHERE id = $2', [
        stored.guest_id,
        session.id,
      ])
      await attachBooking(client, session, stored.guest_id)
      return { guestId: stored.guest_id, name: stored.display_name, credentialId: stored.credential_id }
    })

    await logEvent(c, {
      guestId: result.guestId,
      credentialId: result.credentialId,
      hotelId: session.hotel_id,
      sessionId: session.id,
      event: 'assert',
      outcome: 'ok',
    })
    return c.json({ guestId: result.guestId, greetingName: result.name })
  } catch (err) {
    await logEvent(c, {
      credentialId: data.credential.id,
      hotelId: session.hotel_id,
      sessionId: session.id,
      event: 'assert',
      outcome: 'failed',
      detail: { reason: err.message },
    })
    return c.json({ error: err.code ?? 'authentication_failed', message: err.message }, 401)
  }
})

/* ------------------------------------------------------------------ */
/* Check-in                                                            */
/* ------------------------------------------------------------------ */

app.post('/checkin', async (c) => {
  const { data, error } = await parse(c, checkinRequest)
  if (error) return error

  const open = await loadSession(data.sessionId)
  const session = open ?? (await loadAnySession(data.sessionId))
  if (!session) return c.json({ error: 'unknown_session', message: 'Scan the QR code again.' }, 404)

  // A retry after a dropped response must not 404 on the session its own
  // first attempt consumed — the idempotency key is the whole point.
  if (!open) {
    const { rows } = await query(
      `SELECT c.id, c.journey, c.checked_in_at, r.number AS room_number
         FROM checkins c LEFT JOIN rooms r ON r.id = c.room_id
        WHERE c.booking_id = $1 AND c.idempotency_key = $2`,
      [session.booking_id, data.idempotencyKey],
    )
    if (rows[0]) {
      return c.json({
        checkinId: rows[0].id,
        journey: rows[0].journey,
        hotelName: session.hotel_name,
        roomNumber: rows[0].room_number ?? session.room_number,
        checkedInAt: rows[0].checked_in_at.toISOString(),
      })
    }
    return c.json({ error: 'session_used', message: 'This check-in session is closed.' }, 409)
  }

  if (!session.guest_id) {
    return c.json({ error: 'not_authenticated', message: 'Verify with your passkey first.' }, 401)
  }
  if (!session.booking_id) {
    return c.json({ error: 'no_booking', message: 'No reservation is attached to this session.' }, 409)
  }

  // What the server decided at detection, not what the rows look like now.
  const journey = session.journey ?? 'returning'

  const result = await transaction(async (client) => {
    const { rows: credentials } = await client.query(
      `SELECT id FROM credentials WHERE guest_id = $1 AND revoked_at IS NULL
        ORDER BY last_used_at DESC NULLS LAST LIMIT 1`,
      [session.guest_id],
    )

    // ON CONFLICT makes a retry — or a double-tapped button — idempotent.
    const { rows } = await client.query(
      `INSERT INTO checkins
         (hotel_id, booking_id, guest_id, session_id, credential_id, journey, room_id, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (booking_id, idempotency_key) WHERE idempotency_key IS NOT NULL
       DO UPDATE SET journey = checkins.journey
       RETURNING id, checked_in_at`,
      [
        session.hotel_id,
        session.booking_id,
        session.guest_id,
        session.id,
        credentials[0]?.id ?? null,
        journey,
        null,
        data.idempotencyKey,
      ],
    )

    await client.query(
      `UPDATE bookings SET status = 'checked_in', guest_id = COALESCE(guest_id, $1) WHERE id = $2`,
      [session.guest_id, session.booking_id],
    )
    await client.query(
      `UPDATE checkin_sessions SET status = 'consumed', consumed_at = now() WHERE id = $1`,
      [session.id],
    )
    return rows[0]
  })

  await logEvent(c, {
    guestId: session.guest_id,
    hotelId: session.hotel_id,
    sessionId: session.id,
    event: 'checkin',
    outcome: 'ok',
  })

  return c.json({
    checkinId: result.id,
    journey,
    hotelName: session.hotel_name,
    roomNumber: session.room_number,
    checkedInAt: result.checked_in_at.toISOString(),
  })
})

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'server_error', message: 'Something went wrong.' }, 500)
})
