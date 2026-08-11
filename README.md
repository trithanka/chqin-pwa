# ChqIn

QR-first, mobile-first hotel check-in. Scan the code at the desk, unlock with
your phone, done.

Copy never names a specific biometric in a single-label spot: the same passkey
is released by Face ID, Touch ID or a fingerprint sensor depending on the
device, and naming the wrong one reads as broken. Where there's room, all three
are listed.

**The camera is real; everything the app claims to do with the picture is
not.** Two screens open the rear camera ([src/useCamera.js](src/useCamera.js)):
the scan screen decodes QR codes for real, and the identity screen takes an
actual photo of the guest's ID. That photo is never read, uploaded or stored —
it's a data URL held in component state for the length of the animation, and
"Reading document…" is a timer.

**Passkeys are real WebAuthn** where the platform can run it
([src/passkey.js](src/passkey.js)) — a discoverable, device-bound credential
created and asserted by the real platform authenticator, and a real ES256
signature check via WebCrypto. What isn't real is the *verifier*: with no
backend the page checks its own challenge, which is a demo, not a security
boundary. Identity records still live in localStorage
([src/identity.js](src/identity.js)).

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
npm run dev      # localhost:5173, plus a LAN URL for your phone
npm run build
```

Designed at 390px. On a desktop viewport it renders inside a centred phone shell.

## PWA

Installable and fully offline. `vite-plugin-pwa` (Workbox) generates the
manifest and service worker at build time — config lives in
[vite.config.js](vite.config.js), there is no manifest file to maintain.

The service worker precaches the whole build, Inter included (self-hosted in
[public/fonts/](public/fonts/) so the app makes zero external requests). After
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
([src/index.css](src/index.css)) so nothing sits under a notch or home
indicator once it's running standalone.

## Identity model

| Piece | Where it lives | What it does |
| --- | --- | --- |
| ChqIn Identity | server (simulated: `chqin.identities`) | The guest's persistent identity. Survives losing a phone. |
| Passkey | the device's secure enclave; `chqin.device.credentials` holds only a local hint | One credential per device. ChqIn stores the credential ID and public key, never the private key. |
| Device unlock (Face ID, Touch ID, fingerprint) | the phone OS | Releases the passkey. ChqIn never sees biometric data. |
| QR | the hotel | Identifies the hotel and the check-in session, including the booking. |

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
[src/identity.js](src/identity.js) compares this device's passkeys against the
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
| [src/App.jsx](src/App.jsx) | Detection on scan, flow state machine, header (Back/Help/Close), bottom progress + stepper, help sheet, exit modal, toast |
| [src/identity.js](src/identity.js) | Identity records + device hint store, `detect()`, enrolment, credential lookup, prototype resets |
| [src/passkey.js](src/passkey.js) | WebAuthn create/get ceremonies, capability probe, ES256/RS256 assertion verification |
| [src/useCamera.js](src/useCamera.js) | `useCamera` — rear-camera stream, still capture, permission/secure-context states, teardown; `useQrCamera` — the same plus the QR decode loop |
| [src/data.js](src/data.js) | All placeholder data — hotel, room, guest, QR session |
| [src/components/ui.jsx](src/components/ui.jsx) | Buttons, progress bar, stepper, card, skeleton, bottom sheet, modal, toast, biometric prompt sheet, screen wrapper |
| [src/components/cards.jsx](src/components/cards.jsx) | Biometric card, document scan card, success card |
| [src/components/Confetti.jsx](src/components/Confetti.jsx) | Dependency-free confetti burst |
| [src/screens/](src/screens/) | One file per screen |

Flows are declared as arrays in [App.jsx](src/App.jsx) — the stepper and progress
bar derive their labels and percentages from those arrays, so adding or removing
a step needs no other change.

Overlays portal into `#phone-shell` so scrims cover the header regardless of
which screen opened them.

## Stack

React 19 · Vite · Tailwind CSS v4 (CSS-first, tokens in
[src/index.css](src/index.css)) · Framer Motion · Lucide · Inter

Brand `#2563EB`, success `#16A34A`, canvas `#F8FAFC`.
# chqin-pwa
# chqin-pwa
