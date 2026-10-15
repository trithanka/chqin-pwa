# Backend structure

`apps/api/src` is organised by domain. Each module owns one part of the business, its tables, its logic and its routes. The structure was changed without changing any behaviour: files moved and large files were split, and no function body was edited.

## Layout

```
src/
  index.js  app.js  config.js  devFlags.js     wiring: boots the server, mounts routes

  shared/                                       the kernel: knows no domain
    db/        client, migrate, reset, clear, schema.js (every table, for drizzle-kit)
    lib/       crypto, errors, ids, mail, passwords, phone, session, totp, validate
    outbox/    notifications waiting to be sent, for any domain

  modules/
    identity/   the person, across every venue
                guests, passkeys, Aadhaar and basic identity checks, audit log
                routes: /detect /identity /webauthn
    venues/     the place and its staff
                registering a venue, sign-in, property, settings, staff mail, place search
                routes: /staff (sign-in, session guard, property, settings), /places
    entry/      the engine, domain-neutral
                flows, gates, entitlements, sessions, entries, the runner and its steps
                routes: /sessions
    hotel/      reservations, rooms, check-in, the stay screen, hotel messages
                routes: /checkin /stay and the hotel part of /staff
    visitors/   hosts, events, the visit journey, host decisions
                routes: /visits and the visitor part of /staff
    admin/      ChqIn Admin, the team that runs the platform
                routes: /admin

  integrations/
    kapso/      WhatsApp: the outbox sender, the webhook, the template script
```

Inside a module: `<name>.schema.js` for its tables, one file per piece of logic, `routes/` for its HTTP routes, tests beside the code, and `index.js`, the module's public surface.

## Rules

`src/architecture.test.js` enforces them, so they cannot drift:

1. **A module reaches another only through its `index.js`.** Never into a file inside it. Table definitions (`*.schema.js`) may be referenced across modules, because foreign keys need them.
2. **`shared/` knows no domain.** The only exceptions are the two schema collectors, which gather every module's tables.
3. **A domain never calls an integration.** Integrations call domains. The outbox is how a domain asks for a message without knowing who sends it.
4. **Only `app.js` mounts a module's routes.**
5. **No module imports `admin`.** Admin sits on top of the others.

Dependencies run one way: `entry` depends on nothing but the kernel; `identity`, `venues`, `hotel` and `visitors` depend on `entry`; `hotel` also uses `identity`; `admin` and `integrations` depend on the rest.

## Where things went

| Was | Now |
| --- | --- |
| `services/staff.js` (one file) | `venues/venueAccounts.js`, `venueProperty.js`, `venueSettings.js`; `hotel/hotelBookings.js`, `hotelToday.js`, `hotelGuests.js`, `hotelRooms.js`; `entry/deskCode.js` |
| `routes/staff.js` (one file) | `venues/routes/staff.js` (sign-in, guard, property, settings), `hotel/routes/staff.js`, `visitors/routes/staff.js` |
| `services/whatsapp.js` | `integrations/kapso/sender.js`, `visitors/hostReply.js`, `shared/lib/phone.js` |
| `services/entry.js` (the runner) | `entry/runner.js` |
| `db/schema/*.js` | `modules/*/*.schema.js`, collected by `shared/db/schema.js` |
| `db/seed.js`, `createOffice.js`, `createAdmin.js` | `hotel/seed.js`, `visitors/createOffice.js`, `admin/createAdmin.js` |
| `lib/*` | `shared/lib/*` (`truid.js` is now `identity/truid.js`) |

## Staff routes and the session guard

`/staff` is three routers mounted in order in `app.js`: `venues` first, which holds the public sign-in routes and then the session guard, then `hotel` and `visitors`. Order is the authorization boundary. `venues/routes/staffGuard.test.js` calls every private `/staff` route with no session and requires a 401.

## Known debt

`entry/sessions.js` (`loadAny`, `attachBookingByLookup`) still reads hotel tables, so the engine is not yet fully hotel-free. Untangling it means changing behaviour, so it was left as it is.

## Adding to it

- **A new kind of venue** (a zoo, a temple): a new `modules/<name>/` with its own tables, prefix and `index.js`. It uses `entry` and does not edit it.
- **A new step type:** in `entry/steps.js`.
- **A new outside service:** `integrations/<name>/`, calling domains through their `index.js`.
