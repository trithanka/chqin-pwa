# ChqIn — data model

How the database is laid out, and why. The source of truth is `apps/api/src/db/schema/`; this page explains the shape. For how an entrance works end to end, read `entry-flow-explained.md` first.

## The short answer

**One database: PostgreSQL.** There is no Redis and no object storage today.

| Store | Holds | Notes |
| --- | --- | --- |
| **PostgreSQL** | Everything: guests, credentials, venues, gates, flows, sessions, entries, staff, audit | WebAuthn challenges and rate limiting also live here for now (`webauthn_challenges`). |
| Redis | Not used | Add it when measurement shows challenges or sessions are the hot write. |
| Object storage | Not used | ID images are not kept. If a regulation ever requires it, the row stores a pointer and hash only. |

IDs are UUIDv7 generated in Node (`lib/ids.js`), never by a database default. Time-ordered ids keep index inserts append-only without exposing a countable sequence. Tokens are stored as SHA-256 hashes, so a database leak is not a set of working keys.

## The structural decision

**Guests are global. Venues and entries are per-place.**

A ChqIn identity belongs to the guest, not the hotel. Gates, flows, sessions, entitlements and entries belong to a venue and carry `venue_id`. The identity tables never point into venue tables, so splitting them into two services later is a deployment change, not a rewrite.

```mermaid
erDiagram
    GUESTS ||--o{ CREDENTIALS : enrols
    GUESTS ||--o{ IDENTITY_VERIFICATIONS : proves
    VENUES ||--o{ GATES : has
    FLOW_DEFINITIONS ||--o{ GATES : "run by"
    GATES ||--o{ ENTRY_SESSIONS : "scan starts"
    FLOW_DEFINITIONS ||--o{ ENTRY_SESSIONS : "pinned version"
    ENTITLEMENTS ||--o{ ENTRY_SESSIONS : "may grant"
    ENTRY_SESSIONS ||--o| ENTRIES : produces
    GUESTS ||--o{ ENTRIES : "performs"
    VENUES ||--o{ ENTITLEMENTS : issues
    ENTITLEMENTS ||--o| HOTEL_BOOKINGS : "hotel detail"
    HOTEL_BOOKINGS ||--o{ HOTEL_BOOKING_ROOMS : holds
    HOTEL_ROOMS ||--o{ HOTEL_BOOKING_ROOMS : "given in"
    ENTRIES ||--o| HOTEL_ENTRY_DETAILS : "hotel detail"
```

## Naming

No prefix means any kind of gate can use the table. A prefix means it belongs to one kind of venue: `hotel_` today, `ticket_`, `slot_`, `permit_` or `event_` when those verticals arrive. Reading a table name tells you which gate it serves.

## Tables

### Identity domain (global)

| Table | Purpose |
| --- | --- |
| `guests` | A person. Contact details are keyed-hashed (`email_hmac`, `phone_hmac`) for lookup and encrypted (`email_enc`, `phone_enc`) for use. Status: active, suspended, erased. |
| `credentials` | One row per passkey. This is the login system. `credential_id` is unique; `sign_count` going backwards signals a cloned authenticator. |
| `identity_verifications` | KYC events, never the document: method, result, hashed document id, last four digits, the holder's name, date of birth and address as returned, and the consent that was shown. |
| `webauthn_challenges` | Single-use ceremony challenges with a short expiry, tied to an entry session. |
| `auth_events` | Append-only log of every ceremony. No foreign keys on purpose, so it can record an attempt against a credential that was just deleted and never blocks on another table's lock. |

### Venue domain

| Table | Purpose |
| --- | --- |
| `venues` | Anywhere someone arrives. `kind` is hotel, apartment, temple, station, office, monument, park, museum, event or other. `settings` (jsonb) holds what onboarding collected: services, guest-facing essentials, business registration, per-service contacts. `retention_days` sets how long entry history is kept. |
| `staff_users`, `staff_memberships`, `staff_sessions`, `staff_tokens` | Dashboard accounts, their role at a venue, revocable server-side sessions, and one-time email and reset tokens. |

### The entry engine (any gate)

| Table | Purpose |
| --- | --- |
| `flow_definitions` | An ordered list of steps as JSON, versioned by `(key, version)`. Immutable once published. |
| `gates` | One physical way in. Points at a flow, carries its own QR token (hashed, plus the clear value for reprinting a counter card), a `kind` (qr, desk, turnstile, kiosk), a `config` jsonb for per-gate options, and a status of active or revoked. |
| `entitlements` | The thing that grants entry, if anything: booking, ticket, slot, permit, membership or event. The guest link is nullable, because a reservation exists before anyone knows who the guest is. `ref` is unique per venue and kind. Kind-specific detail nothing queries by sits in `data`. |
| `entry_sessions` | One guest's walk through a flow. Holds the cursor (an index into the steps), `state`, an append-only `trail` of what each step did and when, and a `version` that guards against two requests saving at once. Status: in_progress, waiting, done, rejected, expired, revoked. |
| `entries` | The audit record that someone got in. `guest_id` is nullable so erasure can tombstone a guest without deleting a record with a retention period, and so an open venue can record a count without a person. A unique idempotency key stops a double tap admitting twice. |

### Hotel tables (`hotel_`)

| Table | Purpose |
| --- | --- |
| `hotel_rooms` | Rooms at a venue. `(venue_id, number)` is unique. |
| `hotel_bookings` | What a booking adds to an entitlement: guest name as booked, arrival and departure dates, party size, rooms requested, stay status. Shares its id with the entitlement row. |
| `hotel_booking_rooms` | The rooms a booking actually holds. A row per room, because a party can take two. The only record of which rooms are given out. |
| `hotel_entry_details` | What an arrival adds to an entry: which room, the journey (returning, newDevice, firstTime, desk), nights, party size. |

## How a hotel check-in writes

1. Guest scans the gate QR. The server finds the gate and creates an `entry_sessions` row on the gate's flow version.
2. The runner walks the steps: `identify`, `match_booking`, `admit`. A step that finishes instantly costs no extra write.
3. `admit` writes the `entries` row, its `hotel_entry_details`, marks the booking, and closes the session, all in one transaction.

That is one write per guest when nothing waits, two when a step has to wait (an approval, a payment).

## Rules that hold everywhere

- **Admit is atomic.** The entry, the entitlement update and the session close commit together or not at all.
- **No external calls inside a transaction.** WhatsApp, payments and similar go through an outbox when they arrive.
- **Published flows never change.** A session is pinned to the row it started on. Changing a flow means publishing version N+1.
- **Every venue-scoped query filters by `venue_id`.** A session's venue comes from its gate, and booking lookups use the session's venue. A guest cannot reach another venue's bookings.
- **Concurrent saves are safe.** A session save is `UPDATE … WHERE id = $1 AND version = $2`. The loser re-reads and re-runs.

## Growth plan

These stages are estimates, not measurements. Measure before adding each one.

| Stage | Trigger | Move |
| --- | --- | --- |
| 1 | Launch | One Postgres primary, backups, indexes as they are. |
| 2 | `auth_events` or `entries` grows large | Monthly range partitions through a hand-written migration (Drizzle cannot express `PARTITION BY`). Detach and archive old months. |
| 3 | Dashboard reads slow the guest path | Send staff and reporting reads to a replica. |
| 4 | Reporting hurts OLTP | Stream changes to an analytics store. Never run analytics on the primary. |
| 5 | Sessions or challenges become the hottest write | Move them to Redis with a TTL. |
| 6 | Very high sustained writes, or data residency | Split identity from entries into two clusters. Shard venue data by `venue_id`, never by `guest_id`, since one guest appears at many venues. |

## Privacy and retention

- **Never store biometrics.** The passkey public key is the only credential artifact. It is not secret, but it is a cross-venue identifier, so treat it as personal data.
- **Encrypt what identifies.** Contact details are encrypted; lookups use keyed hashes.
- **Do not keep ID images.** Keep the result, the hashed identifier, and the last four digits.
- **Open venues need not record people.** An open gate can skip `identify` and record a count only. A database of which named person entered which temple on which day is a movement-tracking system regardless of intent.
- **Erasure is not deletion of the record.** Deleting an account clears the guest and cascades their credentials, but entries have a statutory retention period. `entries.guest_id` is set to null (a tombstone) rather than deleting the row.
- **Local registers are regulated.** India has hotel-register rules and Form C reporting for foreign nationals. Confirm specifics for your jurisdiction and add a `regulatory_filings` table when needed. Do not bolt it onto `entries`.

## Not built yet

Payments, loyalty, room keys, PMS sync, WhatsApp, and the other verticals' tables (`ticket_`, `slot_`, `permit_`, `event_`). Each arrives with its first real venue.
