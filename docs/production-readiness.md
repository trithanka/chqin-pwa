# Production readiness — ChqIn

Audit date: 2026-09-10. Scope: `apps/api`, `apps/dashboard`, `apps/web`, `render.yaml`, `vercel.json`.

Verified clean, for the record: `sbox_live_key.csv` was never committed to any tree
(checked every commit reachable from `--all`). Aadhaar numbers are not persisted —
`identity_verifications` stores a keyed HMAC plus the last four digits only
(`apps/api/src/db/schema/identity.js:113`). Consent text and timestamp are recorded.
Password hashing (scrypt, N=2^15), constant-time comparison, and the uniform
"invalid credentials" response with a dummy hash for unknown users are all correct.

---

## Tier 1 — blocks onboarding a real guest

### 1. Identity verification is simulated in production

`apps/api/src/devFlags.js:32` — `export const SIMULATE_AADHAAR = true`, committed on `main`.
`render.yaml` sets `NODE_ENV=production`. The guard in `apps/api/src/config.js` was
deliberately downgraded from refuse-to-start to a warning log.

Effect on the hosted deploy: no UIDAI call is made, **any six-digit code passes**, and the
demographics written to `identity_verifications` are invented. Every guest record created
today is unverified, and nothing in the data distinguishes it after the fact except
`method = 'simulated'`.

Related: `POST /identity/verifications` (`apps/api/src/routes/identity.js:118`) is a stub gate
that passes for anyone holding a QR token. It is only closed when `liveAadhaar()` is true —
which the flag above prevents.

Fix: set the flag to `false`, confirm `SANDBOX_API_KEY`/`SANDBOX_API_SECRET` are live-tier keys
paired with the live `SANDBOX_BASE_URL`, and restore the config guard to `process.exit(1)` so
this cannot regress silently.

### 2. Migrations never run on deploy

`render.yaml`: `buildCommand: cd ../.. && npm install`, `startCommand: npm start`. Neither runs
`db:migrate`. `apps/api/src/db/migrate.js` exists and is correct, but nothing on Render invokes it,
so schema reaches production only when someone runs it from a laptop against `DIRECT_URL`.

Fix: `buildCommand: cd ../.. && npm install && npm run db:migrate --workspace @chqin/api`.
Build-time is the right place — a failed migration then fails the deploy instead of booting a
process against a schema it does not match.

### 3. `HASH_PEPPER` is `generateValue: true`

`render.yaml:envVars`. That value is not just a password pepper — it is:

- the HMAC key for `guests.email_hmac`, `guests.phone_hmac`, `staff_users.email_hmac`,
  and `identity_verifications.document_hmac` (`apps/api/src/lib/crypto.js:9`), and
- the signing key for the staff session cookie (`apps/api/src/lib/session.js:19`).

If the service is ever recreated from the blueprint, or the value rotated, every lookup column
in the database becomes unmatchable: no staff member can log in, no returning guest is
recognised, and the rows cannot be repaired because the plaintext was never stored.

Fix: change to `sync: false`, set it once by hand, and store it somewhere it survives losing the
Render service. Treat it as unrotatable without a re-keying migration.

### 4. No password reset and no email delivery

`apps/api/src/routes/staff.js` exposes `login`, `logout`, `register` and nothing else. There is no
mail provider anywhere in the codebase (no SMTP, Resend, SES, or Twilio import). A hotel owner
who forgets their password is permanently locked out, and there is no email verification on
registration, so accounts can be created against addresses the registrant does not control.

Minimum for real onboarding: an email sender, a signed single-use reset link, and address
verification at registration.

### 5. `RP_ID`, `ORIGINS`, and `COOKIE_SAMESITE` must be settled before the first passkey

Two failure modes, both already documented in `apps/api/src/config.js`:

- **`RP_ID` is permanent.** Passkeys bind to it. Enrol guests against `chqin-api.onrender.com`
  and later move to `chqin.in`, and every enrolled credential is dead with no migration path.
  Set the final production hostname before the first real enrolment.
- **Cookie site scope.** If the API is on `onrender.com` while the dashboard is on `chqin.in`,
  the staff cookie is third-party: `SameSite=Lax` means it is never sent (login 200, everything
  after it 401), and `SameSite=None` means Safari and increasingly Chrome drop it anyway.

The durable answer is a custom domain on the API — `api.chqin.in` alongside
`business.chqin.in` — so `Lax` works and there is no third-party cookie at all. Also confirm
`VITE_API_URL` is set at dashboard build time (`apps/dashboard/src/api.js:14`); without it the
build falls back to `http://<hostname>:8787`.

---

## Tier 2 — will break within the first week of real traffic

### 6. No rate limiting on any endpoint

Three endpoints, three distinct consequences:

- `POST /identity/aadhaar/otp` — reachable with only a session token. Each call bills a UIDAI
  transaction and sends an SMS to a phone number chosen by the caller. Cost abuse and SMS
  flooding in the same request.
- `POST /staff/login` — no lockout, no backoff. scrypt at N=2^15 is roughly 100ms of CPU per
  attempt on a single-process Node server, so this is both credential stuffing and a cheap
  denial of service.
- `GET /places` — public by design (it runs before an account exists) and now backed by billed
  Google Places when `GOOGLE_PLACES_KEY` is set.

Per-IP and per-session limits on all three, plus a per-session cap on OTP requests.

### 7. Throttle and cache are per-process

`apps/api/src/services/places.js:23` already flags this. The Nominatim one-request-per-second
gate and the result cache are module-level state; a second instance gets its own copy and the
policy is violated. Fine at `plan: starter` (one instance), a blocker the moment you scale out.

### 8. Sessions cannot be revoked

`apps/api/src/lib/session.js` — staff sessions are a signed cookie with a 12-hour expiry and no
server-side record. Logout clears only the browser's copy. A stolen or leaked cookie is valid for
up to 12 hours and there is nothing you can do about it, including for a staff member you have
just fired. A `staff_sessions` table with a revocation check is the fix.

### 9. Encrypted PII columns are declared but never used

`guests.email_enc`, `guests.phone_enc`, `staff_users.email_enc` exist in the schema
(`apps/api/src/db/schema/identity.js:47`, `staff.js:23`) and nothing in the codebase writes or
reads them — `apps/api/src/lib/crypto.js` has no encrypt/decrypt at all. Guest email and phone
are therefore stored as HMAC only, meaning they are **not recoverable**: the system can tell
whether a guest is a returning one, but cannot email or call them.

Decide which you want: wire an AEAD (`node:crypto` `aes-256-gcm` with a key separate from
`HASH_PEPPER`) and populate the columns, or drop them and accept that contact details live only
on the booking. Leaving them declared and empty reads as "encrypted at rest" when it is not.

### 10. No error sink

`console.*` on Render is not retained logging — you cannot search it after the fact, and there
is no alert when the API starts 500ing. Any hosted sink (Sentry, Axiom, Better Stack) wired into
`apps/api/src/lib/errors.js` covers this.

### 11. Tests exist but nothing runs them

`apps/api/src/services/stay.test.js` and `settings.test.js` exist; no `package.json` in the repo
has a `test` script. Add `"test": "node --test"` to `apps/api/package.json`.

---

## Tier 3 — operational checklist before opening the doors

- **Backups.** Confirm point-in-time recovery is enabled on the Postgres, and perform one
  restore into a scratch database so the procedure is known-good rather than assumed.
- **Google Places budget alert.** Current usage sits inside the 35,000 free India-tier Text
  Search calls per month (₹0), but a billing account with an alert at $1 is what turns a
  scraping incident into a notification instead of an invoice.
- **Sandbox account.** Live keys only work against the live base URL; a mismatched pair fails at
  `/authenticate` and looks like a bad key. Verify credit balance and per-transaction pricing.
- **Uptime monitoring** against `/health`, which already reports database connectivity.
- **Single instance.** `plan: starter` is one process with no redundancy — a deploy is a short
  outage, and a crash is an outage until Render restarts it.
- **Data retention and erasure.** `guests.status` allows `'erased'` but no code path sets it and
  there is no retention policy. Under the DPDP Act you need a defined retention period for
  identity records and a way to honour an erasure request. The consent record is already
  captured correctly, which is the harder half.
- **Form C.** The booking flow captures `country`. Hotels in India must file Form C for foreign
  nationals. Whether ChqIn generates or submits that is a product decision worth making
  deliberately rather than discovering from a hotel's compliance officer.

---

## Status: what has been fixed

Findings 2, 4, 5 and 7 are addressed in the working tree. The rest of this
document still stands.

- **#2** — `render.yaml` now runs `npm run db:migrate` as `preDeployCommand`.
  Migrations apply after the build and before the new version takes traffic, so
  a failed migration fails the deploy instead of booting a mismatched process.
- **#4** — password reset and address verification, end to end: a `staff_tokens`
  table, a Resend sender (`apps/api/src/lib/mail.js`), the service in
  `apps/api/src/services/staffMail.js`, three routes, and three dashboard
  screens. The "Forgot password?" link on the sign-in screen now goes somewhere.
- **#5** — `RP_ID`, `ORIGINS` and `COOKIE_SAMESITE` are pinned in `render.yaml`
  to the `chqin.in` apex, `business`/`app` subdomains, and `Lax`.
- **#7** — staff sessions are rows in `staff_sessions`, addressed by an opaque
  token. Logout revokes server-side, and a password reset revokes every session
  the account has.

Two of the remaining findings moved as a side effect. **#9**: staff email
addresses are now encrypted into `email_enc` with AES-256-GCM under a new
`ENCRYPTION_KEY` — password reset needs a readable address. Guest `email_enc`
and `phone_enc` are still unused. **#11**: `apps/api` has a `test` script;
`npm test --workspace @chqin/api` runs 13 tests.

Finding #3 is partly defused: sessions no longer derive from `HASH_PEPPER`, so
changing it no longer signs everyone out — but it still keys every `*_hmac`
column, and `render.yaml` now sets it to `sync: false`.

### Verified against a local Postgres

Migration applied, both tables and the new column present. Then, over HTTP:
register 200, authenticated read 200, logout 200 followed by 401 on the same
cookie while a second session stayed 200, forged cookie 401, forgot-password
200 for both a real and an unknown address, reset 200 then 400 on replay, the
live session 401 after the reset, the old password 401 and the new one 200,
and a short password refused. The verification link behaved the same way.

### Still to do by hand

1. **Set the secrets on Render**, none of which can be generated for you:
   `HASH_PEPPER` (keep the value already in use — a new one orphans every
   existing row), `ENCRYPTION_KEY`
   (`node -e "console.log(crypto.randomBytes(32).toString('base64'))"`),
   and `RESEND_API_KEY`. The API refuses to start in production without the
   last two.
2. **Verify chqin.in in Resend.** Until its DNS records are in place, Resend
   accepts the call and delivers only to the account owner's own address —
   which looks exactly like a bug in `lib/mail.js`.
3. **Point the domains.** `api.chqin.in` at the Render service,
   `business.chqin.in` and `app.chqin.in` at the frontends, and set
   `VITE_API_URL=https://api.chqin.in` at build time for both — `vercel.json`
   has no `/api` proxy, so a build without it calls localhost.
4. **Existing staff accounts cannot receive a reset.** Their address was only
   ever stored as an HMAC, and nothing can recover it. They need their address
   written again — a short backfill, or re-registration — before password reset
   works for them. `requestPasswordReset` logs which accounts hit this.
5. **`npm run db:generate` does not work in this repo.** The drizzle snapshot
   stops at `0002` and predates the hotels → venues rename, so `generate`
   proposes recreating the schema and dropping live columns. Migrations `0003`
   onward are hand-written, `0011` included. Rebuilding the snapshot from the
   live database is worth doing before the schema grows much further.

---

## Provider change: Sandbox → TrueID (2026-09-11)

Aadhaar OKYC now goes through TrueID (truid.one) instead of Sandbox
(sandbox.co.in). `src/lib/sandbox.js` is replaced by `src/lib/truid.js`, which
exposes the same three functions, so `services/identity.js` changed only in
which provider string it writes and which module it imports.

Finding #1 is closed in the same change: `SIMULATE_AADHAAR` is `false`, and the
production guard in `config.js` is a refusal again rather than a warning.

### Three things TrueID's documentation does not say

1. **`X-Request-Id` and `X-Timestamp` are required on every call.** The request
   id must be *exactly* 32 alphanumeric characters — 31 is rejected. Neither
   header appears in their OpenAPI spec; omitting either returns a 400 that
   reads like a malformed body.
2. **A failed verification is HTTP 200 with `"status": true`.** Only
   `data.verified` separates a pass from a refusal. Checking the HTTP code or
   the top-level `status` field — which is what the Sandbox integration did,
   and what a port would carry over — passes every guest. This is the enrolment
   gate, so `truid.js` treats anything other than an explicit `verified === true`
   as a rejection.
3. **Callers are IP-whitelisted per environment, and the key picks the
   environment.** A `TEST_` key and a live key use the same base URL; there is
   no separate staging host. A correct key from an unlisted address returns
   403, not 401.

### The endpoints, as they actually are

The paths circulated by TrueID support omit `/services/`:

    given:   /api/v1okyc/generate-otp
    actual:  /api/v1/services/okyc/generate-otp
             /api/v1/services/okyc/get-result

Bodies are `{aadhaar_number}` and `{session_id, otp}`, not `{}`.

### Verified end to end

Against the sandbox environment, through the application's own routes and a
local Postgres: OTP requested (200, `simulated: false`), wrong code rejected
(400 `otp_rejected`), correct code passed with UIDAI's demographics stored —
`KARTHICK KUMAR`, `1990-05-15`, `male` — consent recorded, a checksum-invalid
number refused before any billable call, the simulated stub gate refused with
403 while live, and passkey enrolment allowed only behind a passed TrueID row.
Wallet moved ₹200.00 → ₹192.85 across the session, so roughly ₹2.40 per
completed verification.

### Still to do for TrueID

1. **Whitelist Render's outbound IPs** (Render → chqin-pwa → Settings →
   Outbound IPs) with TrueID, or the deployed service gets a 403 from an
   address they do not know.
2. **Set `TRUID_KEY_ID` and `TRUID_KEY_SECRET` on Render.** The API refuses to
   boot in production without them. The keys currently in `.env` are `TEST_`
   keys; production keys need the entity KYC below.
3. **Entity KYC and the signed agreement** — TrueID requires KYC of the
   business plus the authorised signatory's attested ID before issuing live
   keys. No registered entity exists yet, which blocks production access from
   any Aadhaar provider, not just this one.
4. **Ask TrueID whether an OKYC session is single-use.** Replaying the same
   `session_id` returned the full demographic payload again and appeared to
   bill again. If that is intended, a retry loop costs money and a leaked
   session id re-exposes a guest's Aadhaar details.

### Note for local development

Only this machine's IPv4 is whitelisted, and Node prefers IPv6 where both
exist, so a local call is refused while the whitelisted address sits unused.
Run the API with `node --dns-result-order=ipv4first` locally. Render's outbound
addresses are IPv4, so nothing is needed there.
