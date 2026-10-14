# ChqIn Admin: design

Status: approved in conversation on 2026-10-14 (approach 1, all sections). Built in phases A–F.

## 1. Purpose

An internal panel for the ChqIn team to run the whole platform across every venue: venues, gates, flows, staff, guests, entries, sessions, notifications, logs and reports. It is not the venue dashboard, and venue staff can never reach it.

Every arrival is Gate → Flow (versioned steps) → Admit, so no screen or endpoint may assume a venue has hotel tables.

## 2. Decisions taken

| Question | Decision |
| --- | --- |
| Hosting | `admin.chqin.in` (Vercel), API stays the single process at `api2.chqin.in`, admin routes mounted at `/admin`. |
| Network gate | Server-side IP allow-list on every `/admin` request (`ADMIN_IP_ALLOWLIST`). In production an empty list fails closed (`/admin` is a 404) rather than stopping the API from booting. |
| Suspend venue | Built in phase B. |
| Reveal masked guest data | `owner` and `support`, one field at a time, reason required, audited before the value is returned. `read_only` never. |
| Spec layout | This one spec; each phase is built and verified before the next. |
| Where admin API runs | Same process (approach 1). The route files can move to a second service later without a rewrite. |

## 3. Data model

All hand-written migrations, UUIDv7 from `lib/ids.js`, tokens stored as SHA-256.

### 0016_admin_identity.sql

- `admin_users`: `email_hmac` (unique, `lookupHash`), `email_enc`, `display_name`, `password_hash` (scrypt via `lib/passwords.js`, the existing scheme), `role` (`owner|support|read_only`), `status` (`invited|active|disabled`), `totp_secret_enc` (AES-GCM via `lib/crypto.js`), `totp_last_step` (replay guard), `totp_enabled_at`, `failed_attempts`, `locked_until`, `created_at`, `last_login_at`.
- `admin_sessions`: `admin_id` (FK, cascade), `role` (snapshot), `token_hash` (unique), `mfa_at` (null until the TOTP code is accepted), `ip`, `user_agent`, `created_at`, `last_seen_at`, `expires_at`, `revoked_at`.
- `admin_tokens`: single-use links, `purpose` `invite|totp_reset`, hashed token, expiry, `used_at`.
- `admin_audit_log`: append-only, **no foreign keys** (same reasoning as `auth_events`). `admin_id`, `admin_name`, `role`, `action`, `target_type`, `target_id`, `venue_id`, `reason`, `changes` (jsonb `{field: {before, after}}`), `ip`, `user_agent`, `occurred_at`.

### 0017_venue_status.sql

- `venues.status` `active|suspended|closed` (default `active`), `status_reason`, `status_changed_at`.
- `outbox.status` gains `cancelled`.
- Indexes the admin screens need (each named for its screen): entries by time and by guest, sessions by status and age, auth events by time and venue, outbox by status, gates by flow, memberships by venue, guests by lower-case name prefix.

## 4. Auth and isolation

**Middleware on `/admin`, in this order** (ordering is the authorization boundary, as in `routes/staff.js`):

1. **IP allow-list.** `ADMIN_IP_ALLOWLIST` is a list of IPs and CIDRs checked with `net.BlockList`. The client IP comes from `ADMIN_CLIENT_IP_HEADER` when set, or otherwise from the socket. Render appends to `X-Forwarded-For` rather than replacing it, so the leftmost entry is client-controlled and is never used. Before launch, confirm the trusted header on Render by sending a forged XFF and logging what arrives.
2. **Admin CSRF header.** Every `/admin` request must carry `x-chqin-admin: 1`. A custom header forces a CORS preflight, and preflight for `/admin` only passes from `ADMIN_ORIGINS`. Sibling sites (`business.`, `app.`) are same-site, so SameSite alone would not stop them.
3. **Session.** The middleware reads only the `chqin_admin` cookie (`Path=/admin`, `HttpOnly`, `SameSite=Strict`) and looks up `admin_sessions`. It never reads `chqin_staff`, and the staff middleware never reads `chqin_admin`. The two use different tables, cookies and code paths.
4. **MFA.** If `mfa_at` is null, only `/auth/totp`, `/auth/logout` and `/me` are reachable.
5. **`requireRole(...)` per route.**

**CORS.** `/admin/*` allows only `ADMIN_ORIGINS`. Every other path allows `ORIGINS` minus the admin origins.

**Sessions.** A password-only session lives 5 minutes. After the TOTP code it lives 30 minutes idle and 8 hours absolute. `last_seen_at` is written at most once a minute.

**TOTP.** RFC 6238, SHA-1, 6 digits, 30-second step, ±1 step, implemented on `node:crypto` with no new dependency. A step at or below `totp_last_step` is refused, so a code cannot be replayed. Five failures (password or code) lock the account for 15 minutes.

**Bootstrap.** `npm run admin:create` follows `createOffice.js`: it refuses a remote database without `--yes`, reads the password from `ADMIN_PASSWORD`, and prints the TOTP secret and `otpauth://` URI once. Owners invite later admins. The invite link is returned to the owner, who passes it on, and opening it sets the password and confirms a TOTP code. Resetting 2FA issues a `totp_reset` link and revokes that admin's sessions.

## 5. Roles

| Capability | read_only | support | owner |
| --- | --- | --- | --- |
| Every read screen, masked values | yes | yes | yes |
| Reveal a masked value (reason, audited) | no | yes | yes |
| Venue profile/settings, gates, hosts, events | no | yes | yes |
| Create a venue, suspend or unsuspend one | no | yes | yes |
| Staff: revoke sessions, reset mail, verify email, deactivate, change role | no | yes | yes |
| Guests: revoke passkey, suspend | no | yes | yes |
| Sessions: end; outbox: retry or cancel | no | yes | yes |
| Publish a flow version | no | no | yes |
| Delete or close a venue, erase a guest | no | no | yes |
| Admin users, audit CSV export, purge expired rows | no | no | yes |

`read_only` is refused twice: by `requireRole` and again inside the audit helper.

## 6. The audit helper

`adminWrite(c, { action, targetType, targetId, venueId, reason, needsReason }, fn)` is the opposite of `logEvent`. It runs in **one transaction**: `fn(tx)` reads the row before the change, makes it, and returns `{ before, after, result }`. The helper then diffs the changed fields and inserts the audit row in the same transaction. If the audit insert fails, the change fails too. When a reason is required, the minimum is 5 characters.

A reveal writes and commits its audit row **before** the plaintext is returned. A read-only CSV export is audited the same way.

## 7. Destructive actions

- They need typed confirmation of the venue or guest name, must be done by the owner, and need a reason.
- They are refused when `isRemote()` unless `ADMIN_ALLOW_DESTRUCTIVE=true`, following `reset.js`.
- **Venue delete.** A venue with no entries and no sessions is deleted outright (cascade). A venue with history is **closed** instead: status `closed`, gates revoked, staff sessions revoked, open entry sessions revoked, and its history kept.
- **Guest erase** clears personal data and keeps entries:

| Table | Action |
| --- | --- |
| `guests` | Row deleted. `credentials` and `webauthn_challenges` cascade. |
| `entries.guest_id` | Set to null (tombstone). Venue, gate, time, outcome and vertical detail stay. |
| `identity_verifications` | Unlinked. `subject_*`, `subject_address`, `subject_care_of`, `document_hmac` and `provider_ref` cleared. Method, result, last four digits, verified time and consent stay as proof that a check happened. |
| `entry_sessions` | `guest_id` set to null. Personal keys in `state` (`company`, `designation`) removed. |
| `entitlements.guest_id` | Set to null. |
| `hotel_bookings.guest_name` | Set to `Erased guest` for this guest's bookings. |
| `event_entry_details` | `company` and `designation` set to `[erased]`. |
| `outbox.payload` | `text` replaced for messages about this guest's sessions. |
| `auth_events` | Kept. No foreign keys, and it holds no contact details. |

## 8. Masking

- Email: `t•••@g•••.com`.
- Phone: `+91 98••• ••210`.
- Aadhaar: `XXXX XXXX 4082`, built only from `document_last4`. Full numbers, document images and biometrics are never stored or shown.

## 9. API surface (all under `/admin`)

- **Auth:** `POST auth/login`, `auth/totp`, `auth/logout`, `GET auth/invite`, `POST auth/accept`, `GET me`.
- **Overview:** `GET overview`, `GET health`.
- **Venues:**
  - `GET venues`, `POST venues`, `GET venues/:id`.
  - `POST venues/:id`, `venues/:id/settings`, `venues/:id/status`, `venues/:id/delete`.
  - Hosts and events: `GET venues/:id/hosts`, `POST venues/:id/hosts`, `POST venues/:id/hosts/:hid`, `POST venues/:id/events`, `POST venues/:id/events/:eid/active`.
- **Gates:** `GET gates`, `POST venues/:id/gates`, `POST gates/:id`, `POST gates/:id/status`, `POST gates/:id/rotate`.
- **Flows:** `GET flows`, `GET flows/:id`, `GET steps`, `POST flows/validate`, `POST flows`, `POST flows/simulate`.
- **Staff:** `GET staff`, `GET staff/:id`, `POST staff/:id/revoke-sessions`, `staff/:id/password-reset`, `staff/:id/verify-email`, `staff/:id/status`, `memberships/:id/role`.
- **Guests:** `GET guests`, `GET guests/:id`, `POST guests/:id/reveal`, `guests/:id/status`, `guests/:id/erase`, `credentials/:id/revoke`.
- **Entries and sessions:** `GET entries`, `GET entries/:id`, `GET sessions`, `GET sessions/:id`, `POST sessions/:id/end`.
- **Outbox:** `GET outbox`, `POST outbox/:id/retry`, `outbox/:id/cancel`.
- **Logs:** `GET auth-events`, `GET audit`, `GET audit.csv`.
- **Admins:** `GET admins`, `POST admins`, `POST admins/:id`, `admins/:id/reset-2fa`, `GET admins/:id/sessions`, `POST admin-sessions/:id/revoke`.
- **Operations:** `GET ops`, `POST ops/purge`.
- **Reports:** `GET reports`, `GET reports.csv`.

Every list is keyset-paginated. The cursor is opaque base64url `(time, id)`, the default limit is 50 and the maximum 200. Responses never include hotel fields unless the venue's rows have them.

## 10. Engine changes this needs

- `resolveToken` joins the venue and refuses a non-active one with `venue_suspended` (403). Staff `login` refuses a suspended or closed venue. Suspending revokes that venue's staff sessions and open entry sessions, so the per-request staff lookup stays a single-table read.
- `steps.js`: each step gains a `describe` block (summary, options, input, waits for, emits). The step library page is generated from it.
- `validateFlow`: `when` values must be scalars or arrays of scalars. `collect_details` needs a non-empty `fields` list with unique keys and `kind` text or choice. A choice field needs `options` or `source`.
- Publishing a new version of `hotel` or `visitor.host_approval` changes what every **new** venue gets, because `latestFlowId` picks the newest. The publish screen says so.

## 11. Frontend: `apps/admin`

React + Vite + Tailwind 4 + react-router + lucide-react + qrcode, the same stack as the dashboard, on port 5175.

- **Look.** A dark slate chrome with an amber accent, deliberately unlike the dashboard's blue. A persistent banner reads "ADMIN", names the API and database host, and turns red with "PRODUCTION" for a remote database.
- **Screens.** Sign in, TOTP, accept invite, overview, venues and venue detail (tabs), create venue, gates, flows, flow detail, publish, step library, simulator, staff, guests, entries, sessions, outbox, auth events, audit log, admins, operations, reports.
- **Dialogs.** Every action that needs a reason or a typed confirmation opens an in-page dialog. Browser `prompt` and `confirm` are never used.

## 12. Phases

| Phase | Contents |
| --- | --- |
| A | Migration 0016, TOTP, admin sessions, middleware, audit helper, `admin:create`, overview and health, admin app shell, sign-in. |
| B | Migration 0017, venues (list, detail, create, edit, settings, suspend, delete/close), gates (create, edit config/flow, revoke, rotate, QR card), hosts and events. Replaces `createOffice.js`. |
| C | Step `describe`, stricter `validateFlow`, flows list/detail, publish, step library, simulator. |
| D | Staff accounts, guests (search, detail, reveal, revoke, suspend, erase), entries, sessions (stuck finder, end). |
| E | Outbox (retry, cancel, sender), auth events, audit log with CSV, admin user management. |
| F | Reports with CSV, operations (migrations, environment, purge, Aadhaar provider). |

## 13. Testing

- **Unit (`node:test`):** TOTP against the RFC 6238 vectors, masking, cursor encoding, the audit diff, `validateFlow` additions, the simulator.
- **`admin.integration.test.js`** (local database only, skips itself on a remote one), covering:
  - A staff cookie cannot reach `/admin`, and an admin cookie cannot reach `/staff`.
  - `read_only` cannot write.
  - Every write produces an audit row.
  - Creating a venue creates the venue, its owner and a gate on the right flow.
  - Publishing rejects bad flows and never mutates an existing version.
  - Erasing a guest keeps entries and scrubs the listed tables.
  - Suspend blocks scans and staff login.
- **Browser:** each phase's screens are opened against a local API with the local database.

## 14. Production rollout (for the owner to run)

1. Set `ADMIN_ORIGINS=https://admin.chqin.in`, `ADMIN_IP_ALLOWLIST`, `ADMIN_CLIENT_IP_HEADER` (after the header check) and `ADMIN_URL`.
2. Deploy. Render's `preDeployCommand` runs `npm run db:migrate`. 0016 and 0017 were already applied to Mumbai on 2026-10-14, so this is a no-op.
3. Run `ADMIN_PASSWORD=… npm run admin:create -- --email … --name … --yes` once against production.
4. Create a Vercel project for `apps/admin` with `VITE_API_URL=https://api2.chqin.in`.
