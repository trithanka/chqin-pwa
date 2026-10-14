import { parseArgs } from 'node:util'
import { config, isRemote } from '../config.js'
import { pool } from './client.js'
import { register } from '../services/staff.js'

/**
 * Set up a venue that hosts visitors (The Nest first). Onboarding in the
 * dashboard is built around hotel rooms, so these venues are created by the
 * ChqIn team here: the venue, its owner login, and the gate that runs the
 * visitor flow. Hosts and events are then managed from the dashboard.
 *
 *   OWNER_PASSWORD=… npm run venue:office -- --name "The Nest" --city Guwahati \
 *     --email owner@example.com --owner "Owner Name" [--yes]
 *
 * The password comes from the environment so it never lands in shell history
 * as an argument. Against a remote database it needs --yes: this writes there.
 */
const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    city: { type: 'string' },
    email: { type: 'string' },
    owner: { type: 'string', default: 'Owner' },
    timezone: { type: 'string', default: 'Asia/Kolkata' },
    yes: { type: 'boolean', default: false },
  },
})

const password = process.env.OWNER_PASSWORD
if (!values.name || !values.city || !values.email || !password) {
  console.error('Need --name, --city, --email and OWNER_PASSWORD in the environment.')
  process.exit(1)
}
if (password.length < 10) {
  console.error('OWNER_PASSWORD must be at least 10 characters.')
  process.exit(1)
}

const host = new URL(config.DATABASE_URL).host
if (isRemote() && !values.yes) {
  console.error(`DATABASE_URL points at ${host}, a remote database. Re-run with --yes to write there.`)
  process.exit(1)
}

const result = await register({
  account: { name: values.owner, email: values.email, password, role: 'owner' },
  property: { name: values.name, kind: 'office', city: values.city, timezone: values.timezone },
  rooms: [],
  business: {},
  services: [],
  essentials: {},
  contacts: {},
})

console.log(`created "${result.venueName}" on ${host}`)
console.log(`owner login: ${values.email}`)
console.log('Sign in to the dashboard to add people and teams, events, and print the entrance QR.')
await pool.end()
