import { and, eq, gt, isNull } from 'drizzle-orm'
import { config } from '../config.js'
import { db } from '../db/client.js'
import { staffTokens, staffUsers } from '../db/schema/index.js'
import { decrypt, lookupHash, newSessionToken, tokenHash } from '../lib/crypto.js'
import { ApiError } from '../lib/errors.js'
import { sendMail } from '../lib/mail.js'
import { hashPassword } from '../lib/passwords.js'
import { revokeAllFor } from '../lib/session.js'

/**
 * Password reset and address verification — the two things a staff account
 * needs an email address for.
 *
 * Both are the same three steps: mint a single-use token, mail a link, accept
 * the token once. The differences are the purpose string and what happens on
 * redemption, which is why they share a table and most of this file.
 */

/** Long enough that guessing is not a strategy; the row stores only its hash. */
const mint = () => {
  const token = newSessionToken()
  return { token, hash: tokenHash(token) }
}

/** Refuse a second link while the last one is still usable and this fresh. */
const RESEND_AFTER_MS = 60_000

async function liveToken(staffId, purpose) {
  return db.query.staffTokens.findFirst({
    where: (t, { eq: e, and: a, isNull: n, gt: g }) =>
      a(e(t.staffId, staffId), e(t.purpose, purpose), n(t.usedAt), g(t.expiresAt, new Date())),
    orderBy: (t, { desc: d }) => d(t.createdAt),
  })
}

async function issueToken(staffId, purpose) {
  const { token, hash } = mint()
  await db.insert(staffTokens).values({
    staffId,
    purpose,
    tokenHash: hash,
    expiresAt: new Date(Date.now() + config.MAIL_TOKEN_TTL_MS),
  })
  return token
}

/**
 * Spends a token, or explains why it can't be spent.
 *
 * The used-at stamp is written under a WHERE that requires it to still be
 * null, and the row is only accepted if that UPDATE matched. Two clicks on the
 * same link at the same time therefore produce one success and one failure,
 * rather than two successes — checking first and updating after would let both
 * through.
 */
async function spendToken(token, purpose) {
  const [row] = await db
    .update(staffTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(staffTokens.tokenHash, tokenHash(token)),
        eq(staffTokens.purpose, purpose),
        isNull(staffTokens.usedAt),
        gt(staffTokens.expiresAt, new Date()),
      ),
    )
    .returning({ staffId: staffTokens.staffId })

  if (!row) {
    throw new ApiError(
      'invalid_token',
      'That link has expired or has already been used. Request a new one.',
      400,
    )
  }
  return row.staffId
}

/* ------------------------------------------------------------------ */
/* Password reset                                                      */
/* ------------------------------------------------------------------ */

/**
 * Step one. Always succeeds from the caller's point of view.
 *
 * Every branch below returns quietly — unknown address, suspended account, no
 * stored address to send to, provider outage. Telling the caller which one
 * happened would turn this endpoint into a way to find out who has an account,
 * which is precisely what the uniform message in `login` exists to prevent.
 */
export async function requestPasswordReset(email) {
  const staff = await db.query.staffUsers.findFirst({
    where: (u, { eq: e }) => e(u.emailHmac, lookupHash(email)),
  })
  if (!staff || staff.status !== 'active') return

  // Accounts created before addresses were stored encrypted have nothing to
  // decrypt. Nothing can be done for them here; the log line is so that a
  // support call has an answer.
  const address = decrypt(staff.emailEnc)
  if (!address) {
    console.warn(`[password_reset] staff ${staff.id} has no stored address — cannot send`)
    return
  }

  // A free email bomb otherwise: one unauthenticated request per message.
  const live = await liveToken(staff.id, 'password_reset')
  if (live && Date.now() - live.createdAt.getTime() < RESEND_AFTER_MS) return

  const token = await issueToken(staff.id, 'password_reset')
  const link = `${config.DASHBOARD_URL}/reset-password?token=${token}`

  try {
    await sendMail({
      to: address,
      subject: 'Reset your ChqIn password',
      text: [
        `Hello ${staff.displayName},`,
        '',
        'Open this link to choose a new password:',
        link,
        '',
        `The link works once and expires in ${Math.round(config.MAIL_TOKEN_TTL_MS / 60_000)} minutes.`,
        'If you did not ask for this, you can ignore this email — nothing has changed.',
      ].join('\n'),
    })
  } catch (err) {
    // Logged and swallowed: the caller gets the same 200 either way, and a
    // provider outage must not become a way to probe for accounts.
    console.error('[password_reset] send failed', err)
  }
}

/** Step two: the token, and the new password. */
export async function resetPassword({ token, password }) {
  const staffId = await spendToken(token, 'password_reset')

  await db
    .update(staffUsers)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(staffUsers.id, staffId))

  // Whoever prompted the reset may be holding a stolen cookie. Changing the
  // password without this leaves them signed in.
  await revokeAllFor(staffId)

  // Every other outstanding link for this account dies with it — including a
  // second reset mail someone else requested.
  await db
    .update(staffTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(staffTokens.staffId, staffId),
        eq(staffTokens.purpose, 'password_reset'),
        isNull(staffTokens.usedAt),
      ),
    )
}

/* ------------------------------------------------------------------ */
/* Address verification                                                */
/* ------------------------------------------------------------------ */

/**
 * Sent at registration. Nothing is gated on the result yet — an unverified
 * owner runs their property exactly as before. This records whether the
 * address is real, so that gating it later is a decision rather than a
 * migration with no data behind it.
 */
export async function sendVerificationEmail(staffId) {
  const staff = await db.query.staffUsers.findFirst({
    where: (u, { eq: e }) => e(u.id, staffId),
  })
  const address = decrypt(staff?.emailEnc)
  if (!address || staff.emailVerifiedAt) return

  const token = await issueToken(staffId, 'email_verify')
  const link = `${config.DASHBOARD_URL}/verify-email?token=${token}`

  try {
    await sendMail({
      to: address,
      subject: 'Confirm your ChqIn email address',
      text: [
        `Hello ${staff.displayName},`,
        '',
        'Confirm this address so we can reach you about your property:',
        link,
      ].join('\n'),
    })
  } catch (err) {
    console.error('[email_verify] send failed', err)
  }
}

export async function verifyEmail(token) {
  const staffId = await spendToken(token, 'email_verify')
  await db.update(staffUsers).set({ emailVerifiedAt: new Date() }).where(eq(staffUsers.id, staffId))
}
