# ChqIn

QR-first, mobile-first hotel check-in. Scan the code at the desk, unlock with
your phone, done.

Copy never names a specific biometric in a single-label spot: the same passkey
is released by Face ID, Touch ID or a fingerprint sensor depending on the
device, and naming the wrong one reads as broken. Where there's room, all three
are listed.

**The camera is real; everything the app claims to do with the picture is
not.** Two screens open the rear camera ([apps/web/src/useCamera.js](apps/web/src/useCamera.js)):
the scan screen decodes QR codes for real, and the identity screen takes an
actual photo of the guest's ID. That photo is never read, uploaded or stored —
it's a data URL held in component state for the length of the animation, and
"Reading document…" is a timer.

**Passkeys are real WebAuthn** where the platform can run it
([apps/web/src/passkey.js](apps/web/src/passkey.js)) — a discoverable, device-bound credential
created and asserted by the real platform authenticator, and a real ES256
signature check via WebCrypto. What isn't real is the *verifier*: with no
backend the page checks its own challenge, which is a demo, not a security
boundary. Identity records still live in localStorage
([apps/web/src/identity.js](apps/web/src/identity.js)).

**The camera needs a secure context** — `https://` or `localhost`. Over a plain
`http://` LAN IP the API is absent entirely, so both screens say so and fall
back: **Continue without scanning** resolves the session, and the identity
screen reverts to its stylized scan card. To demo the camera on a phone,
tunnel: `cloudflared tunnel --url http://localhost:5173`.

QR decoding also needs `BarcodeDetector` (Chrome, Edge; **not** Safari). Where
it's missing the camera still runs live and the same manual control carries the
flow forward. Add [jsqr](https://github.com/cozmo/jsQR) if iOS Safari needs to
decode for real.

**Passkeys need the same secure context**, plus a platform authenticator. Both
biometric screens probe with
`isUserVerifyingPlatformAuthenticatorAvailable()` and fall back to the
simulated prompt sheet when it's missing, saying why.

```bash
npm install
npm run db:up        # Postgres 17 in Docker on :5439
npm run db:migrate   # apply migrations
npm run db:seed      # a hotel, 3 reservations, QR tokens

npm run dev:all      # guest PWA :5173 · dashboard :5174 · API :8787
npm run build
```

`dev:all` runs all three in one terminal with prefixed, colour-coded logs, and
one Ctrl-C stops the lot. To run them separately — better when you're
iterating on one and want its output clean — use `npm run dev`,
`npm run dev:dashboard` and `npm run dev:api` in their own terminals.

Both front ends pin their ports with `strictPort`, so a stale dev server makes
the next one fail loudly instead of quietly landing on its neighbour's port.
When that happens — `Error: Port 5174 is already in use` — something from an
earlier run is still holding it:

```bash
npm run dev:stop     # frees 5173, 5174 and 8787
```

It isn't wired to `predev` on purpose: a hook that kills whatever is listening
will eventually kill a server you meant to keep.

Designed at 390px. On a desktop viewport it renders inside a centred phone shell.

## Layout

One repo, npm workspaces. The API and the PWA change together while the
contract is still moving, and they deploy same-origin — which is what keeps the
WebAuthn RP ID and the origin check trivially correct.

| Path | What it is |
| --- | --- |
| [apps/web/](apps/web/) | The guest PWA — React, Vite, Tailwind |
| [apps/dashboard/](apps/dashboard/) | ChqIn for Business — property onboarding (UI only so far) |
| [apps/api/](apps/api/) | The API: WebAuthn relying party + check-in state machine (Hono, Postgres) |
| [packages/shared/](packages/shared/) | The contract both sides validate against (zod) |
| [docs/data-model.md](docs/data-model.md) | Why the schema looks the way it does |

**The PWA does not talk to the API yet.** It still runs entirely on
localStorage — the two halves exist and both work, but wiring the client to the
server is the next step.

## PWA

Installable and fully offline. `vite-plugin-pwa` (Workbox) generates the
manifest and service worker at build time — config lives in
[apps/web/vite.config.js](apps/web/vite.config.js), there is no manifest file to
maintain.

The service worker precaches the whole build, Inter included (self-hosted in
[apps/web/public/fonts/](apps/web/public/fonts/) so the app makes zero external requests). After
one load it runs with the network off.

`registerType: 'autoUpdate'` — a new deploy installs silently on next launch
rather than prompting a guest mid-check-in. `devOptions.enabled` means
`npm run dev` exercises the service worker too.

## Viewing it on a phone

`npm run dev` binds to the network — open the `Network:` URL from the Vite
banner on a device on the same Wi-Fi.

To lose the browser's URL bar, use **Add to Home Screen** and launch from the
icon; the manifest declares `display: standalone`. A page cannot hide browser
chrome in an ordinary tab — the home-screen launch is the only route.

**Service workers and the camera both need HTTPS or localhost.** Over a plain
`http://` LAN IP the manifest and Add to Home Screen still work, but the service
worker won't register, there's no offline, and the camera is unavailable. For
the real thing, host it (any static host) or tunnel —
`cloudflared tunnel --url http://localhost:5173`.

Header and footer pad with `pt-safe` / `pb-safe`
([apps/web/src/index.css](apps/web/src/index.css)) so nothing sits under a notch or home
indicator once it's running standalone.

## Identity model

| Piece | Where it lives | What it does |
| --- | --- | --- |
| ChqIn Identity | server (simulated: `chqin.identities`) | The guest's persistent identity. Survives losing a phone. |
| Passkey | the device's secure enclave; `chqin.device.credentials` holds only a local hint | One credential per device. ChqIn stores the credential ID and public key, never the private key. |
| Device unlock (Face ID, Touch ID, fingerprint) | the phone OS | Releases the passkey. ChqIn never sees biometric data. |
| QR | the venue | Identifies the venue and the check-in session, including the booking. |

No password, and no OTP on a normal returning check-in.

### Two details WebAuthn forces

**Detection needs a local hint.** There is deliberately no way to ask "does
this device have a passkey?" without a user gesture and a biometric prompt — so
`chqin.device.credentials` is a *guess* written at enrolment, and the ceremony
on the next screen is what confirms it. A failed assertion drops the guest to
the new-device path rather than dead-ending. Every real passkey app does this.

**Credentials are bound to the RP ID**, which is the hostname. A fresh
`cloudflared` URL each run means a fresh RP ID, so every demo starts as a first
time guest. Use a named tunnel or any stable https host to demo the returning
flow on a phone; `localhost` is stable on desktop.

Registration asks for `residentKey: 'required'` and assertion passes an empty
`allowCredentials` — discoverable credentials are what let a returning guest
authenticate with no username, which is the whole point.

**The ceremony follows the credential, not the device.** A simulated
credential can't answer a real `get()`, so a device that gains a platform
authenticator still verifies an old simulated enrolment through the simulated
sheet. The reverse — a real credential on a context that can't run WebAuthn,
e.g. enrolled over the tunnel then opened on the LAN URL — accepts the local
record instead of a signature, and says so on screen. That's a deliberate
prototype affordance; a real deployment would refuse and re-enrol.

## Flows

**The guest never picks a flow.** Once the camera reads the QR, `detect()` in
[apps/web/src/identity.js](apps/web/src/identity.js) compares this device's passkeys against the
identity records and the booking behind the QR, and the app routes itself:

| Detected | When | Steps |
| --- | --- | --- |
| Returning | this device holds a passkey the identity still trusts | Welcome → Verify → You're in |
| New device | no passkey here, but the QR's booking resolves to an identity | Welcome → Confirm → Secure → You're in |
| First time | neither | Welcome → Identity → Secure → You're in |

New-device recovery reads the identity from the booking the QR carries, which
is what keeps OTP out of the flow.

## Demoing the three states

The scan screen has two prototype controls. They manipulate *device state* —
detection still decides which journey follows, so the guest-facing rule holds.

- **Forget this device** — clears this device's passkeys, keeps the identity → next scan detects **new device**
- **Reset everything** — clears both stores → next scan detects **first time**

A fresh browser profile starts at first time. Complete it once and the next
scan is a returning check-in.

## Structure

| Path | What it holds |
| --- | --- |
| [apps/web/src/App.jsx](apps/web/src/App.jsx) | Detection on scan, flow state machine, header (Back/Help/Close), bottom progress + stepper, help sheet, exit modal, toast |
| [apps/web/src/identity.js](apps/web/src/identity.js) | Identity records + device hint store, `detect()`, enrolment, credential lookup, prototype resets |
| [apps/web/src/passkey.js](apps/web/src/passkey.js) | WebAuthn create/get ceremonies, capability probe, ES256/RS256 assertion verification |
| [apps/web/src/useCamera.js](apps/web/src/useCamera.js) | `useCamera` — rear-camera stream, still capture, permission/secure-context states, teardown; `useQrCamera` — the same plus the QR decode loop |
| [apps/web/src/data.js](apps/web/src/data.js) | All placeholder data — hotel, room, guest, QR session |
| [apps/web/src/components/ui.jsx](apps/web/src/components/ui.jsx) | Buttons, progress bar, stepper, card, skeleton, bottom sheet, modal, toast, biometric prompt sheet, screen wrapper |
| [apps/web/src/components/cards.jsx](apps/web/src/components/cards.jsx) | Biometric card, document scan card, success card |
| [apps/web/src/components/Confetti.jsx](apps/web/src/components/Confetti.jsx) | Dependency-free confetti burst |
| [apps/web/src/screens/](apps/web/src/screens/) | One file per screen |

Flows are declared as arrays in [App.jsx](apps/web/src/App.jsx) — the stepper and progress
bar derive their labels and percentages from those arrays, so adding or removing
a step needs no other change.

Overlays portal into `#phone-shell` so scrims cover the header regardless of
which screen opened them.

## Stack

React 19 · Vite · Tailwind CSS v4 (CSS-first, tokens in
[apps/web/src/index.css](apps/web/src/index.css)) · Framer Motion · Lucide · Inter

## Brand

The mark is `CIn` — a white C with the `In` in green — and it ships as SVG with
**no background**, so it sits on whatever it's placed on.

| Asset | What it's for |
| --- | --- |
| [logo.svg](apps/web/public/logo.svg) | The wordmark. The C is `currentColor`; the green is fixed |
| [icon.svg](apps/web/public/icon.svg) | Tab icon — the C and the bar only, since a wordmark is mush at 16px |
| `icon-180/192/512.png` | Home-screen icons, on black — iOS paints transparency black anyway, and a maskable icon has to fill its canvas |
| [Logo.jsx](apps/web/src/components/Logo.jsx) | The same mark inline, so it inherits text colour |

The tab icon's C follows the viewer's theme (`prefers-color-scheme` inside the
SVG): a white C vanishes on a light tab strip and a dark one vanishes on a dark
strip. The green never changes — it's the half that has to stay recognisable.

Logo green `#22DD66`, brand `#2563EB`, success `#16A34A`, canvas `#F8FAFC`.
# chqin-pwa
# chqin-pwa

## Database

**A "venue" is anywhere someone arrives** — a hotel today, an apartment block,
a temple or a station later. The schema says `venues` with a `kind` rather than
`hotels`, because that rename is cheap with one property on the system and a
coordinated migration once there are hundreds. What isn't generalised yet is
how entry is granted; see [docs/data-model.md](docs/data-model.md).

**Drizzle is the source of truth.** The schema lives in
[apps/api/src/db/schema/](apps/api/src/db/schema/), split by domain so the
identity/property boundary the data model depends on is visible in the file
tree. SQL under `apps/api/drizzle/` is generated — never hand-edited.

```bash
npm run db:generate  # schema change → a migration file
npm run db:migrate   # apply pending migrations (this is what production runs)
npm run db:push      # sync the DB directly, skipping the migration file
npm run db:studio    # browse the data
npm run db:seed      # a venue, 3 reservations, QR tokens
npm run db:reseed    # clear the data and seed again (keeps the schema)
npm run db:reset     # drop schemas, migrate, seed — refuses anything not localhost
```

### Switching between local and hosted

[.env](apps/api/.env.example) carries both, one commented out:

```bash
# ── LOCAL ──
DATABASE_URL=postgres://chqin:chqin@localhost:5439/chqin

# ── SUPABASE ──
# DATABASE_URL=postgresql://…@…pooler.supabase.com:6543/postgres
# DIRECT_URL=postgresql://…@…pooler.supabase.com:5432/postgres
```

**Toggle whole blocks.** `DATABASE_URL` and `DIRECT_URL` have to move together:
switch one and not the other and the app runs against one database while
migrations hit another, which doesn't error — it presents as data going
missing.

The API prints its database host on boot, marked `(local)` or `⚠︎ remote`, so a
hand-edited toggle is visible rather than assumed:

```
ChqIn API on http://localhost:8787  (RP ID: localhost)
database → aws-0-ap-southeast-1.pooler.supabase.com:6543  ⚠︎ remote
```

### Hosted Postgres

`DATABASE_URL` can point anywhere; [.env.example](apps/api/.env.example) shows
both shapes. Four things a hosted database needs that a local container
doesn't, all handled in [config.js](apps/api/src/config.js) and
[db/client.js](apps/api/src/db/client.js):

**Two connections, not one.** App traffic goes through the transaction pooler
(Supabase: port 6543); migrations go through the session pooler (5432) via
`DIRECT_URL`. Transaction pooling breaks anything that spans statements —
advisory locks, session settings — which is exactly what a migration runner
does.

**A verified TLS chain.** Supabase signs its pooler certificates with its own
root, which isn't in Node's trust store, so
[certs/supabase-ca.crt](apps/api/certs/supabase-ca.crt) is pinned and
`rejectUnauthorized` stays on. Turning verification off would encrypt the
connection while accepting any certificate — the half of TLS that stops
nobody.

**No `sslmode` in the URL.** node-postgres lets it override the `ssl` object
passed alongside, silently discarding the pinned CA and failing with
`SELF_SIGNED_CERT_IN_CHAIN`. The parameter is stripped when config is parsed.

**A smaller pool.** Behind a pooler every local client is a pooler slot, and
shared tiers count them tightly — a big pool starves other clients rather than
making anything faster.

**Percent-encode the password.** A literal `@` or `#` makes the URL parser read
the rest as the hostname, and the error you get is a DNS failure that says
nothing about passwords.

`db:push` is for iterating locally. Once a schema is deployed, generate a
migration and apply it: push works out the diff itself, and on a database with
real guests in it that is a guess you don't want to take.

Enumerated columns carry real `CHECK` constraints, not just a comment listing
the values — an unexpected journey or status should fail the write rather than
surface later as a state nothing handles.

`.env` is loaded by [config.js](apps/api/src/config.js), which every entry
point imports, `drizzle.config.js` included. Without that, a staging
`DATABASE_URL` in `.env` would be ignored and `db:push` would quietly hit the
local container instead.

Two things Drizzle can't express, and how they're handled:

**uuidv7 is generated in Node** ([lib/ids.js](apps/api/src/lib/ids.js)) rather
than by a Postgres function, so there's nothing to install in the database
first. Time-ordered ids keep B-tree inserts append-only where v4 scatters them.

**`auth_events` isn't partitioned yet.** It's the one table that grows without
bound, and `PARTITION BY` has no Drizzle representation — so converting it to
monthly partitions is a hand-written ops migration, after which `db:push` must
stay away from that table. Documented in
[schema/auth.js](apps/api/src/db/schema/auth.js).

`db:reset` drops the `drizzle` bookkeeping schema as well as `public` —
dropping only `public` leaves the migration log behind, and the next migrate
cheerfully reports "up to date" against an empty database.

## API

The server is the relying party: it issues challenges, verifies assertions, and
decides the journey. The client holds hints and renders — it never asserts who
the guest is.

| Route | Does |
| --- | --- |
| `POST /sessions/resolve` | QR token → session. A `desk` QR mints a short-lived child session per scan |
| `POST /detect` | Device's credential-ID hints + the session's booking → `returning` / `newDevice` / `firstTime`, recorded on the session |
| `POST /identity/verifications` | Records the one-time check. A device may not enrol without one in this session |
| `POST /webauthn/registration/options` \| `/verify` | Discoverable platform credential, verified and stored with its COSE key |
| `POST /webauthn/authentication/options` \| `/verify` | Empty `allowCredentials`, verified signature, sign-counter clone check |
| `POST /checkin` | Idempotent per `(booking, key)` — a retry after a dropped response returns the original check-in |

Everything that matters is enforced server-side, and each attempt lands in
`auth_events` whether it succeeded or not.

### Things worth knowing

**The journey is recorded at detection**, not recomputed at check-in — enrolment
sets `bookings.guest_id`, so a first-time guest would otherwise look like a
returning one by the time they finish.

**Challenges are single-use**, consumed by the `UPDATE ... RETURNING` that reads
them, so a replay finds nothing rather than being compared and rejected.

**`POST /identity/verifications` is an authorization gate, not a flow step.**
It is the only thing standing between a scanned QR and enrolling a passkey
against that reservation — and it is currently a stub that passes for anyone
who calls it. Until a real KYC check sits behind it, someone who obtains a
first-time booking QR can enrol their own passkey against that booking. That is
the gap to close before this touches a real guest, not a detail.

**Issuing ceremony options is not authentication.** Only a verified
registration or assertion sets `checkin_sessions.guest_id`, which is what
`/checkin` requires; the guest row itself is created at registration-verify
time, so an abandoned ceremony leaves nothing behind. Both cases are in the
test suite because the first version of this file got the first one wrong.

**A desk QR has no reservation.** After a ceremony identifies the guest,
`attachBooking` looks for their confirmed arrival today. A booking made without
a ChqIn identity attached can't be matched this way — matching a walk-up guest
to an unlinked reservation (by name? by staff confirmation?) is a product
decision, not a coding one, and is deliberately left open.

## Dashboard

`apps/dashboard` is the venue-facing side — ChqIn for Business.

| Route | What's there |
| --- | --- |
| `/` | Sign in — work email and password |
| `/register` | Setting up a property *is* registering: the six-step onboarding, where the password is set |
| `/app` | Today — arrivals, who's in, who's still coming |
| `/app/bookings` | Every reservation, filterable, with a detail page per booking |
| `/app/guests` | People who have checked in here, and what devices they hold |
| `/app/code` | The desk card again, because cards get spilled on |

**UI only — nothing talks to the API.** Onboarding does everything it can
locally: validation, the room range builder, invitations, a real QR on the
printable desk card, and a draft (including your position in the flow) that
survives a refresh. The signed-in screens read
[src/data/mock.js](apps/dashboard/src/data/mock.js), whose rows are shaped like
the tables in [docs/data-model.md](docs/data-model.md) so they become fetches
without reshaping the components.

The booking detail says *how* someone verified — returning, new device, first
time — because that is the question a desk asks when something looks off, and
it is the one thing a paper register could never answer.

Desktop-first at 620px of content beside a dark step rail, which is the
opposite of the guest app on purpose — this is a tool used at a desk, not a
moment in a lobby.

Two decisions worth keeping when it gets wired up:

**Staff sign in with email and password; guests never do.** The two sides of
this product have different users and different threat models — a guest is a
stranger with a phone, a staff member is a known person at a desk who may share
a terminal. Rules in [lib/password.js](apps/dashboard/src/lib/password.js)
follow NIST 800-63B: a length floor rather than composition rules, screened
against known-bad passwords, no forced rotation. The password is set during
registration and deliberately **not** written to the onboarding draft in
localStorage — everything else in that draft survives a refresh, a credential
shouldn't.

What the API owes this when staff auth lands: argon2id hashing (never
reversible, never logged), one identical error for a wrong email and a wrong
password so the form can't be used to enumerate accounts, rate limiting with
lockout, and a reset flow whose tokens are single-use and short-lived.

**The room range builder is the primary control**, with single-room entry as
the fallback. Nobody types eighty rooms one at a time, and the person doing
this is doing it once.

Before it can do anything real, the API needs the tables the data model
deliberately deferred — `staff_users`, `staff_memberships`, `invitations` —
plus a staff auth surface separate from the guest one, and read endpoints
(`GET /staff/bookings`, `GET /staff/guests`) behind it.
[session.js](apps/dashboard/src/session.js) is the seam: it is the only module
that knows who is signed in, so it is the only one that changes.
