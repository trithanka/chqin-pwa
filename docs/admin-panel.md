# ChqIn Admin

ChqIn Admin is the ChqIn team's internal panel for the whole platform. With it you can run every venue, gate, flow, staff account, guest record, entry, session and notification, at every kind of venue. It is not the venue dashboard, and venue staff can never reach it.

- The app is `apps/admin`: React, Vite and Tailwind, on port 5175 in development.
- The API is `/admin` in `apps/api`, in the `src/modules/admin/` module.
- Live at `https://admin.chqin.in` (its own Vercel project, root `apps/admin`), talking to `https://api2.chqin.in`.
- The design is in [superpowers/specs/2026-10-14-chqin-admin-design.md](superpowers/specs/2026-10-14-chqin-admin-design.md).
- The tables are covered in [data-model.md](data-model.md).

## Getting in

Signing in is an email and password. Two extra layers are **optional and off by default**: a six-digit authenticator code (`ADMIN_REQUIRE_2FA=true`) and an IP allow-list (`ADMIN_IP_ALLOWLIST`, where `*` means open to any IP). Turn both on before the team grows or the password is shared.

| Layer | What it does |
| --- | --- |
| IP allow-list (optional) | `ADMIN_IP_ALLOWLIST` holds IPs and CIDRs, or `*` for any IP. A request from anywhere else gets a 404, so `/admin` looks absent. In production an empty list fails closed: `/admin` answers 404 to everyone, and the API logs a warning at boot. |
| Admin client header | Every `/admin` request must carry `x-chqin-admin: 1`. That forces a CORS preflight, and `/admin` passes preflight only from `ADMIN_ORIGINS`. This is what stops `business.chqin.in` or `app.chqin.in`, which share our site, from posting to `/admin` with the cookie attached. |
| Session | The `chqin_admin` cookie: `Path=/admin`, `HttpOnly`, `SameSite=Strict`. It is backed by `admin_sessions`, and revoking a session takes effect on the next request. It expires after 30 minutes idle or 8 hours in total. A session with only the password lasts 5 minutes and can reach nothing except the code step. |
| Second factor (optional) | Only when `ADMIN_REQUIRE_2FA=true`. A RFC 6238 TOTP code, accepted once only. With it off, a correct password gives a full session straight away (the login answers `next: 'done'`). Five failures (password or code) lock the account for 15 minutes. |
| Role | Checked on each route. |

**Admin and staff sessions never mix.** They use different cookies, tables and middleware. `/admin` never reads `chqin_staff` (it only ever sets one, for a read-only view, below), `/staff` never reads `chqin_admin`, and CORS keeps each origin to its own API. The integration test checks both directions.

### The first owner

Simplest: set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the API's `.env`. On startup the API creates or updates that owner (`syncEnvAdmin`), so changing the password in `.env` and restarting is how you rotate it. Use a long random password, because nothing else guards the login while 2FA and the IP list are off.

Or, with the script:

```sh
ADMIN_PASSWORD='…at least 12 characters…' npm run admin:create --workspace @chqin/api -- \
  --email you@chqin.in --name "Your Name" [--role owner] [--yes]
```

The script prints the TOTP secret and an `otpauth://` URI once. Add it to an authenticator app straight away. Against a hosted database the script needs `--yes`, like `createOffice.js`.

### Everyone after that

An owner invites them from **Admin users**. The panel shows the invite link once. Send it yourself: it is never emailed, stored or logged. The person opening it chooses a password, scans the QR code and confirms a code. An owner can also reset someone's two-factor, which ends all their sessions and issues a new enrolment link.

## Aadhaar per venue

On a venue's page, **Turn Aadhaar off / on** (reason required, audited as `venue.aadhaar_off` / `venue.aadhaar_on`). Off means every guest and visitor there gives a name, date of birth and address instead, and the venue's dashboard can't choose Aadhaar. Unset means on, so existing venues keep what they had.

## Viewing a venue's dashboard

**View dashboard** on a venue's page opens the business dashboard as that venue's owner sees it, read-only, for 30 minutes. Support and owners only, with a reason, recorded as `venue.view_as`: the dashboard shows guest details unmasked.

- The view is a normal staff session marked with the admin's id (`staff_sessions.admin_id`, migration 0018). The `/staff` guard refuses every request on it except GET, HEAD and OPTIONS (`read_only_view`), ahead of all three `/staff` routers.
- The admin request sets the `chqin_staff` cookie on the API host, which the dashboard calls too, so no token goes in a URL. It replaces any venue sign-in in that browser.
- The dashboard shows a "ChqIn view · read-only" bar; Exit signs out.
- `DASHBOARD_URL` on the API is where the button sends you.

## Aadhaar usage

Reports → **Aadhaar usage by venue**: OTPs sent (each one a paid provider call, whether or not the guest finishes), verified, not completed, and simulated checks counted apart. Confirm with the provider whether wrong-code retries are billed too; the report counts OTP requests only.

## Roles

| | read_only | support | owner |
| --- | --- | --- | --- |
| See every screen, with personal data masked | ✓ | ✓ | ✓ |
| Reveal a masked phone or email (reason required, audited) | | ✓ | ✓ |
| Edit venues, settings, gates, hosts and events; create, suspend and reactivate venues | | ✓ | ✓ |
| Staff: end sessions, force a password reset, mark email verified, deactivate, change role | | ✓ | ✓ |
| Guests: revoke a passkey, suspend | | ✓ | ✓ |
| End a session; retry or cancel an outbox message; export reports | | ✓ | ✓ |
| Publish a flow version | | | ✓ |
| Delete or close a venue; erase a guest | | | ✓ |
| Manage admin users; export the audit log; purge expired rows | | | ✓ |

`read_only` is refused twice: once by the route and again by the audit helper.

An admin can't change their own role or status, and the last active owner can't be demoted or disabled.

## The audit model

Every change goes through one helper, `adminWrite` in `services/admin/audit.js`. It runs the change and writes its `admin_audit_log` row **in the same transaction**, so a change that can't be recorded doesn't happen. Each row holds:

- who made the change, their role at the time, the IP and the user agent
- the action (for example `venue.suspend` or `gate.rotate`) and the target type and id
- the venue, when there is one
- the reason
- `changes`: `{ field: { before, after } }` for every field that changed, or a summary for actions that are not an edit (an erase, a publish)

`auth_events.logEvent` works the other way: it is best-effort and never blocks a guest. Don't copy it here.

Some reads are audited too. These rows are written and committed **before** the data is returned:

- a reveal of a guest's phone or email
- a CSV export of the audit log or of a report

Sign-ins, failed sign-ins and accepted links are logged as `auth.*` rows.

Secrets never go in the log:

- a rotated gate token is logged as `rotated`
- an invite or reset link is not logged at all
- a reveal records which field was revealed, not its value

The log is append-only and has no foreign keys, so a row outlives the venue, guest or admin it names.

### When a reason is required

A reason (at least 5 characters) is required for anything that changes a venue's live behaviour or a person's access:

- suspending a venue
- editing, revoking or rotating a gate
- publishing a flow
- every staff and guest action
- ending a session
- outbox retries and cancellations
- reveals, deletes and erasures
- admin changes and purges

Profile and settings edits, new gates, hosts and events take an optional reason.

## Privacy

- **Masked by default.** Emails show as `t•••@g•••.com` and phones as `+91 98••• ••210`. A document shows as `XXXX XXXX 4082`, built only from the last four digits. A full Aadhaar number, a document image or biometric data is never stored, so there is nothing to show.
- **Looking someone up.** Search by phone or email is an exact match against the keyed hash. There is no plaintext directory to search. A name search is a prefix match.
- **Basic identity.** Visitors who gave only a name and mobile number have no phone hash, by design, so two visitors typing the same number never become one person. Those visitors can be found by name only.

## Destructive actions

Deleting a venue and erasing a guest both need:

1. the owner role
2. a reason
3. the venue's or guest's name typed out exactly
4. on a hosted database, `ADMIN_ALLOW_DESTRUCTIVE=true` on the API (the same spirit as `db/reset.js`)

### Deleting a venue

A venue with any entries or sessions is **closed**, not deleted, because its history has a retention period. Closing it:

- sets its status to `closed`
- revokes every gate
- ends every staff session and every open guest session

A venue with no history is deleted, along with staff accounts that belonged to it and nowhere else.

### Suspending a venue

Suspending is not destructive and is open to `support`. It:

- makes every gate refuse scans with `venue_suspended`
- refuses staff sign-in
- ends every staff session and open guest session

Reactivating lets staff sign in again. A gate revoked by a close stays revoked until someone restores it.

### Erasing a guest

Personal data goes; the record that someone entered stays.

| Data | What happens |
| --- | --- |
| `guests` row | Deleted. Passkeys and pending challenges cascade with it. |
| `entries` | Kept, with `guest_id` set to null. |
| `identity_verifications` | Unlinked. The holder's name, date of birth, gender, address, care-of, document hash and provider reference are cleared. The method, result, last four digits, time and consent stay as proof that a check happened. |
| `entry_sessions` | `guest_id` set to null. `company`, `designation`, `name`, `phone` and `email` are removed from `state`. |
| `entitlements` | `guest_id` set to null. A linked hotel booking's name becomes "Erased guest". |
| `event_entry_details` | Company and designation become `[erased]`. |
| `outbox` | Messages about the guest's sessions lose their text and template parameters. Pending ones are cancelled. |
| `auth_events` | Kept. They hold no contact details. |

## Environment

| Variable | Meaning |
| --- | --- |
| `ADMIN_ORIGINS` | The admin app's origins. Default `http://localhost:5175`. Production: `https://admin.chqin.in`. |
| `ADMIN_URL` | Where invite and reset links point. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | The owner account, created or updated at startup. |
| `ADMIN_REQUIRE_2FA` | `true` to demand an authenticator code. Default `false`. |
| `ADMIN_IP_ALLOWLIST` | IPs and CIDRs, comma-separated, or `*` for any. In production, while it is empty, `/admin` is closed to everyone. |
| `ADMIN_CLIENT_IP_HEADER` | The header that carries the real client IP behind the proxy. Unset means the socket address is used. **Never** use `x-forwarded-for`: a proxy appends to it, so its first entry is whatever the client sent. |
| `ADMIN_ALLOW_DESTRUCTIVE` | Allows venue delete and guest erase on a hosted database. Off by default. |

The admin app needs `VITE_API_URL` and, for the QR links on gates, `VITE_GUEST_APP_URL`.

## Going live (done for chqin.in)

1. API on the Oracle VM: set `ADMIN_ORIGINS=https://admin.chqin.in`, `ADMIN_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_IP_ALLOWLIST=*`. nginx forwards `X-Real-IP`. Restart `chqin-api`.
2. Vercel project for `apps/admin` (config in `apps/admin/vercel.json`) with `VITE_API_URL=https://api2.chqin.in` and `VITE_GUEST_APP_URL=https://app.chqin.in`, both left non-sensitive because Vite bakes them into the bundle. Add the domain `admin.chqin.in`. It must share the registrable domain with the API, because the cookie is `SameSite=Strict`.
3. DNS at GoDaddy: a CNAME for `admin` to Vercel. The `_vercel` TXT record is only for ownership and can be deleted once the domain shows valid.
4. To lock it down later: set `ADMIN_REQUIRE_2FA=true`, replace `*` with real IPs, and confirm the client-IP header first (`ADMIN_CLIENT_IP_HEADER`, never `x-forwarded-for`).

## Known limits

- **IP addresses in `auth_events`.** The existing `logEvent` stores the leftmost `x-forwarded-for` entry, which a client can forge, so those addresses are spoofable. The admin side uses `ADMIN_CLIENT_IP_HEADER` instead.
- **New flow versions and new venues.** Publishing a new version of `hotel` or `visitor.host_approval` changes what every **new** venue gets, because `register()` picks the newest version. Existing gates stay where they point until someone repoints them. The publish screen says so.
- **Simulator choices.** The flow simulator uses sample options for venue-sourced choices. The API accepts a `venueId` to use a real venue's hosts and events, but the screen doesn't offer it yet.
