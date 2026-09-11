import { config } from '../config.js'

/**
 * Outbound mail, via Resend's HTTP API.
 *
 * A `fetch` rather than the SDK: it is one POST with a JSON body, and a
 * dependency that wraps one POST is a dependency that has to be upgraded.
 *
 * Without RESEND_API_KEY the message is logged instead of sent, so local work
 * needs no account and no DNS. Production refuses to start without the key —
 * see the guard in config.js — because a silently logged reset link is a
 * locked-out owner who never finds out why.
 *
 * Note for the first live deploy: Resend will only deliver from chqin.in once
 * that domain's DNS records verify in their dashboard. Until then it accepts
 * the call and delivers only to the account owner's own address, which reads
 * exactly like a bug in this file.
 */
export async function sendMail({ to, subject, text }) {
  if (!config.RESEND_API_KEY) {
    console.log(`\n[mail:not-sent] to=${to}\n  ${subject}\n  ${text.replace(/\n/g, '\n  ')}\n`)
    return
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from: config.MAIL_FROM, to, subject, text }),
  })

  if (!response.ok) {
    // Thrown, not swallowed: the caller decides what the user sees, and for
    // password reset that is a generic 200 either way. This is for the log.
    throw new Error(`resend ${response.status}: ${await response.text()}`)
  }
}
