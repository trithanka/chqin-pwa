/**
 * Switches you flip here, in the code, rather than in .env.
 *
 * .env holds credentials and differs per machine, so editing it to change
 * behaviour means editing a file you can't commit and might forget to put
 * back. These are the opposite: one line, visible in a diff, reviewed like any
 * other change.
 *
 * Every one of them makes the system *less* real, so production refuses to
 * start with any of them on — see the guards at the bottom of config.js.
 */

/**
 * Skip UIDAI entirely and simulate the Aadhaar check.
 *
 * Set to `true` to work offline, or when Sandbox is down, without removing the
 * credentials from .env. Then:
 *
 *   - no OTP is sent and nothing is billed
 *   - any six-digit code passes
 *   - the guest sees an amber "Simulated" note on the code screen
 *   - the demographics are invented, and every response says `simulated: true`
 *
 * The API prints which mode it is in on the line under the database at boot.
 * `SIMULATE_AADHAAR=true` in .env does the same thing, for a machine where you
 * would rather not touch the code.
 */
export const SIMULATE_AADHAAR = true
