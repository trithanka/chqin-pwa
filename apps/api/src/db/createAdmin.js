import { parseArgs } from 'node:util'
import { config, isRemote } from '../config.js'
import { pool } from './client.js'
import { createAdmin } from '../services/admin/auth.js'

/**
 * The first ChqIn Admin account. Everyone after it is invited from the panel,
 * but an invite needs an owner to send it, so the first one starts here.
 *
 *   ADMIN_PASSWORD=… npm run admin:create -- --email you@chqin.in --name "Your Name" \
 *     [--role owner|support|read_only] [--yes]
 *
 * The password comes from the environment so it never lands in shell history.
 * The TOTP secret is printed once: add it to an authenticator app now, because
 * nothing shows it again (an owner can reset it from the panel later).
 * Against a remote database it needs --yes: this writes there.
 */
const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    role: { type: 'string', default: 'owner' },
    yes: { type: 'boolean', default: false },
  },
})

const password = process.env.ADMIN_PASSWORD
if (!values.email || !values.name || !password) {
  console.error('Need --email, --name and ADMIN_PASSWORD in the environment.')
  process.exit(1)
}
if (password.length < 12) {
  console.error('ADMIN_PASSWORD must be at least 12 characters.')
  process.exit(1)
}
if (!['owner', 'support', 'read_only'].includes(values.role)) {
  console.error('--role must be owner, support or read_only.')
  process.exit(1)
}

const host = new URL(config.DATABASE_URL).host
if (isRemote() && !values.yes) {
  console.error(`DATABASE_URL points at ${host}, a remote database. Re-run with --yes to write there.`)
  process.exit(1)
}

try {
  const result = await createAdmin({ email: values.email, name: values.name, role: values.role, password })
  console.log(`created ${values.role} admin ${values.email} on ${host}`)
  console.log('\nAdd this to your authenticator app now. It is not shown again.')
  console.log(`  secret:  ${result.secret}`)
  console.log(`  uri:     ${result.otpauth}\n`)
} catch (err) {
  console.error(err.message)
  process.exitCode = 1
}
await pool.end()
