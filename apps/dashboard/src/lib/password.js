/**
 * Password rules, shared by registration and (eventually) the API.
 *
 * Length over composition, deliberately: forcing a symbol and a digit pushes
 * people to "Password1!" while a long passphrase is both stronger and easier
 * to remember. Modern guidance (NIST 800-63B) says check length, screen
 * against known-bad passwords, and otherwise stay out of the way.
 */

export const MIN_LENGTH = 10

// A stand-in for a real breached-password list — the top handful only. The
// server should check against a proper corpus (k-anonymity against Pwned
// Passwords, or a local list) before this is in front of anyone.
const COMMON = [
  'password',
  'password1',
  '12345678',
  '123456789',
  '1234567890',
  'qwertyuiop',
  'letmein123',
  'welcome123',
  'iloveyou',
  'admin123',
  'hotel1234',
]

export function passwordProblem(password, { email } = {}) {
  const value = password ?? ''
  if (value.length < MIN_LENGTH) {
    return `Use at least ${MIN_LENGTH} characters — a short phrase works well.`
  }
  if (COMMON.includes(value.toLowerCase())) {
    return 'That password appears in known breach lists. Pick something else.'
  }
  const localPart = email?.split('@')[0]?.toLowerCase()
  if (localPart && localPart.length > 2 && value.toLowerCase().includes(localPart)) {
    return "Don't build the password out of your email address."
  }
  return null
}

/**
 * A rough 0–3 for the meter. Not entropy maths — just enough signal to nudge
 * someone from "hotelaurora1" toward something longer.
 */
export function passwordStrength(password) {
  const value = password ?? ''
  if (value.length < MIN_LENGTH) return 0

  const variety =
    (/[a-z]/.test(value) ? 1 : 0) +
    (/[A-Z]/.test(value) ? 1 : 0) +
    (/\d/.test(value) ? 1 : 0) +
    (/[^\w\s]/.test(value) ? 1 : 0) +
    (/\s/.test(value) ? 1 : 0)

  if (value.length >= 16 || (value.length >= 12 && variety >= 3)) return 3
  if (value.length >= 12 || variety >= 2) return 2
  return 1
}

export const STRENGTH_LABEL = ['Too short', 'Weak', 'Good', 'Strong']
