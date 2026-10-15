import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { config } from '../../../config.js'
import { db, transaction } from '../../../shared/db/client.js'
import { adminAuditLog, adminSessions, adminTokens, adminUsers } from '../../../shared/db/schema.js'
import { decrypt, encrypt, lookupHash, newSessionToken, tokenHash } from '../../../shared/lib/crypto.js'
import { conflict, invalid, notFound, unauthorized } from '../../../shared/lib/errors.js'
import { hashPassword, verifyPassword } from '../../../shared/lib/passwords.js'
import { newSecret, otpauthUri, verifyCode } from '../../../shared/lib/totp.js'
import { maskEmail } from './util.js'

/**
 * Admin accounts: password, then a TOTP code, then a short revocable session.
 *
 * Shaped like the staff side (hashed email to find, encrypted to read, scrypt,
 * a sessions table) but sharing none of its code paths, so neither side's
 * session can ever be read as the other's.
 */

export const COOKIE = 'chqin_admin'
const PASSWORD_ONLY_MS = 5 * 60_000
const IDLE_MS = 30 * 60_000
const ABSOLUTE_MS = 8 * 60 * 60_000
const LOCK_AFTER = 5
const LOCK_MS = 15 * 60_000
const LINK_TTL_MS = 72 * 60 * 60_000

const BAD_LOGIN = "That email, password or code doesn't match."

/** Sign-in attempts go in the audit log too: they are what a breach looks like. */
const logAuth = (admin, action, meta, changes = {}) =>
  db
    .insert(adminAuditLog)
    .values({
      adminId: admin.id,
      adminName: admin.displayName,
      role: admin.role,
      action,
      targetType: 'admin',
      targetId: admin.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      changes,
    })
    .catch((err) => console.error('admin auth log failed:', err.message))

async function failed(admin, meta, why) {
  if (admin) {
    const attempts = admin.failedAttempts + 1
    await db
      .update(adminUsers)
      .set(
        attempts >= LOCK_AFTER
          ? { failedAttempts: 0, lockedUntil: new Date(Date.now() + LOCK_MS) }
          : { failedAttempts: attempts },
      )
      .where(eq(adminUsers.id, admin.id))
    await logAuth(admin, 'auth.failed', meta, { why })
  }
  throw unauthorized('invalid_credentials', BAD_LOGIN)
}

const locked = (admin) => admin.lockedUntil && admin.lockedUntil > new Date()

/** A throwaway hash so a missing account costs the same time as a real one. */
let decoy = null
const decoyHash = async () => (decoy ??= await hashPassword('no-such-admin'))

/** Step one: the password. Returns a session token that can only reach the TOTP step. */
export async function login({ email, password }, meta) {
  const admin = await db.query.adminUsers.findFirst({
    where: (u, { eq: e }) => e(u.emailHmac, lookupHash(email)),
  })
  const ok = await verifyPassword(password, admin?.passwordHash ?? (await decoyHash()))
  // A locked account answers exactly like a wrong password: anything else
  // tells a stranger the address has an account.
  if (!admin || admin.status !== 'active' || locked(admin)) throw unauthorized('invalid_credentials', BAD_LOGIN)
  if (!ok) return failed(admin, meta, 'password')

  const token = newSessionToken()
  await db.insert(adminSessions).values({
    adminId: admin.id,
    role: admin.role,
    tokenHash: tokenHash(token),
    ip: meta.ip,
    userAgent: meta.userAgent,
    expiresAt: new Date(Date.now() + PASSWORD_ONLY_MS),
  })
  return token
}

/** Step two: the code. Promotes the session in place. */
export async function confirmTotp(session, code, meta) {
  const admin = await db.query.adminUsers.findFirst({ where: (u, { eq: e }) => e(u.id, session.adminId) })
  if (!admin || admin.status !== 'active' || locked(admin)) throw unauthorized('invalid_credentials', BAD_LOGIN)

  const secret = decrypt(admin.totpSecretEnc)
  const step = secret ? verifyCode(secret, code, { lastStep: admin.totpLastStep ?? -1 }) : null
  if (step === null) return failed(admin, meta, 'totp')

  const now = new Date()
  await transaction(async (tx) => {
    // Conditional on the step, so two requests racing with one code can't both win.
    const [won] = await tx
      .update(adminUsers)
      .set({ totpLastStep: step, failedAttempts: 0, lockedUntil: null, lastLoginAt: now })
      .where(
        and(
          eq(adminUsers.id, admin.id),
          sql`coalesce(${adminUsers.totpLastStep}, -1) < ${step}`,
        ),
      )
      .returning({ id: adminUsers.id })
    if (!won) throw unauthorized('invalid_credentials', BAD_LOGIN)
    await tx
      .update(adminSessions)
      .set({ mfaAt: now, lastSeenAt: now, expiresAt: new Date(now.getTime() + ABSOLUTE_MS) })
      .where(eq(adminSessions.id, session.sessionId))
  })
  await logAuth(admin, 'auth.login', meta)
}

/**
 * The claims behind a cookie, or null. Joins the account so a disabled admin
 * or a changed role takes effect on the very next request.
 */
export async function readSession(token) {
  if (!token) return null
  const [row] = await db
    .select({
      sessionId: adminSessions.id,
      adminId: adminUsers.id,
      name: adminUsers.displayName,
      role: adminUsers.role,
      status: adminUsers.status,
      mfaAt: adminSessions.mfaAt,
      lastSeenAt: adminSessions.lastSeenAt,
      emailEnc: adminUsers.emailEnc,
    })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.adminId))
    .where(
      and(
        eq(adminSessions.tokenHash, tokenHash(token)),
        isNull(adminSessions.revokedAt),
        gt(adminSessions.expiresAt, new Date()),
      ),
    )
    .limit(1)
  if (!row || row.status !== 'active') return null

  const now = Date.now()
  if (row.mfaAt && now - row.lastSeenAt.getTime() > IDLE_MS) return null
  // At most one write a minute: enough for the idle timeout, cheap per request.
  if (now - row.lastSeenAt.getTime() > 60_000) {
    await db.update(adminSessions).set({ lastSeenAt: new Date(now) }).where(eq(adminSessions.id, row.sessionId))
  }
  return {
    sessionId: row.sessionId,
    adminId: row.adminId,
    name: row.name,
    role: row.role,
    mfa: Boolean(row.mfaAt),
    email: maskEmail(decrypt(row.emailEnc)),
  }
}

export async function revoke(token) {
  if (!token) return
  await db
    .update(adminSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(adminSessions.tokenHash, tokenHash(token)), isNull(adminSessions.revokedAt)))
}

export const revokeAllFor = (adminId, exec = db) =>
  exec
    .update(adminSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(adminSessions.adminId, adminId), isNull(adminSessions.revokedAt)))

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */

/**
 * The first owner, from the command line. Active at once, with its TOTP secret
 * returned to print: there is nobody yet to send an invite.
 */
export async function createAdmin({ email, name, role, password }) {
  const emailHmac = lookupHash(email)
  if (await db.query.adminUsers.findFirst({ where: (u, { eq: e }) => e(u.emailHmac, emailHmac) })) {
    throw conflict('email_taken', 'That email already has an admin account.')
  }
  const secret = newSecret()
  const [row] = await db
    .insert(adminUsers)
    .values({
      emailHmac,
      emailEnc: encrypt(email),
      displayName: name,
      passwordHash: await hashPassword(password),
      role,
      status: 'active',
      totpSecretEnc: encrypt(secret),
      totpEnabledAt: new Date(),
    })
    .returning({ id: adminUsers.id })
  return { id: row.id, secret, otpauth: otpauthUri(secret, email) }
}

async function issueLink(tx, adminId, purpose) {
  const token = newSessionToken()
  // A new link retires any earlier one of the same kind.
  await tx
    .update(adminTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(adminTokens.adminId, adminId), eq(adminTokens.purpose, purpose), isNull(adminTokens.usedAt)))
  await tx.insert(adminTokens).values({
    adminId,
    purpose,
    tokenHash: tokenHash(token),
    expiresAt: new Date(Date.now() + LINK_TTL_MS),
  })
  return `${config.ADMIN_URL}/accept?token=${token}`
}

/** Called inside an audited write. The link is returned to the inviting owner, once. */
export async function invite(tx, { email, name, role }) {
  const emailHmac = lookupHash(email)
  const [taken] = await tx.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.emailHmac, emailHmac))
  if (taken) throw conflict('email_taken', 'That email already has an admin account.')
  const [row] = await tx
    .insert(adminUsers)
    .values({ emailHmac, emailEnc: encrypt(email), displayName: name, role, status: 'invited', totpSecretEnc: encrypt(newSecret()) })
    .returning({ id: adminUsers.id })
  return { id: row.id, link: await issueLink(tx, row.id, 'invite') }
}

/** A fresh secret and a link to enrol it. Every session the admin holds ends now. */
export async function resetTotp(tx, adminId) {
  await tx
    .update(adminUsers)
    .set({ totpSecretEnc: encrypt(newSecret()), totpEnabledAt: null, totpLastStep: null })
    .where(eq(adminUsers.id, adminId))
  await revokeAllFor(adminId, tx)
  return issueLink(tx, adminId, 'totp_reset')
}

async function liveLink(token) {
  const [row] = await db
    .select({ link: adminTokens, admin: adminUsers })
    .from(adminTokens)
    .innerJoin(adminUsers, eq(adminUsers.id, adminTokens.adminId))
    .where(
      and(
        eq(adminTokens.tokenHash, tokenHash(token ?? '')),
        isNull(adminTokens.usedAt),
        gt(adminTokens.expiresAt, new Date()),
      ),
    )
  if (!row || row.admin.status === 'disabled') throw notFound('This link has expired or was already used.')
  return row
}

/** What the accept screen draws: who, the QR to scan, and whether a password is wanted. */
export async function linkInfo(token) {
  const { link, admin } = await liveLink(token)
  const email = decrypt(admin.emailEnc)
  const secret = decrypt(admin.totpSecretEnc)
  return {
    name: admin.displayName,
    email: maskEmail(email),
    purpose: link.purpose,
    needsPassword: link.purpose === 'invite',
    secret,
    otpauth: otpauthUri(secret, email),
  }
}

/** Proves the authenticator works before anything depends on it. */
export async function acceptLink({ token, password, code }, meta) {
  const { link, admin } = await liveLink(token)
  if (link.purpose === 'invite' && (!password || password.length < 12)) {
    throw invalid('Choose a password of at least 12 characters.')
  }
  const step = verifyCode(decrypt(admin.totpSecretEnc), code)
  if (step === null) throw invalid("That code doesn't match. Check the time on your phone and try again.")

  const passwordHash = link.purpose === 'invite' ? await hashPassword(password) : undefined
  await transaction(async (tx) => {
    const [claimed] = await tx
      .update(adminTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(adminTokens.id, link.id), isNull(adminTokens.usedAt)))
      .returning({ id: adminTokens.id })
    if (!claimed) throw notFound('This link has expired or was already used.')
    await tx
      .update(adminUsers)
      .set({
        ...(passwordHash ? { passwordHash, status: 'active' } : {}),
        totpEnabledAt: new Date(),
        totpLastStep: step,
        failedAttempts: 0,
        lockedUntil: null,
      })
      .where(eq(adminUsers.id, admin.id))
  })
  await logAuth(admin, `auth.${link.purpose}_accepted`, meta)
}
