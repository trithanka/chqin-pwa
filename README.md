# ChqIn

Mobile-first check-in prototype. Scan a QR code at the hotel desk, verify, done.

**This is a UI prototype only.** There is no backend, no camera access, no QR
scanning, no document reading, and no OTP delivery. Every verification step is a
timed animation over local React state.

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

**Service workers need HTTPS or localhost.** Over a plain `http://` LAN IP the
manifest and Add to Home Screen still work, but the service worker won't
register and there's no offline. For the real thing, host it (any static host)
or tunnel — `cloudflared tunnel --url http://localhost:5173`.

Header and footer pad with `pt-safe` / `pb-safe`
([src/index.css](src/index.css)) so nothing sits under a notch or home
indicator once it's running standalone.

## Flows

**Returning guest** (4 steps) — Booking → Selfie → OTP → Checked in
**First-time guest** (5 steps) — Booking → Selfie → Identity → OTP → Profile created

Both start from a landing screen with a simulated QR scan, which is also where
you pick which flow to demo. "Go to Check-In" at the end of the first-time flow
drops you into the returning-guest flow.

Any 6 digits verify at the OTP step.

## Structure

| Path | What it holds |
| --- | --- |
| [src/App.jsx](src/App.jsx) | Flow state machine, header (Back/Help/Close), bottom progress + stepper, help sheet, exit modal, toast |
| [src/data.js](src/data.js) | All placeholder data — hotel, room, guest, masked document number |
| [src/components/ui.jsx](src/components/ui.jsx) | Buttons, progress bar, stepper, card, skeleton, bottom sheet, modal, toast, screen wrapper |
| [src/components/cards.jsx](src/components/cards.jsx) | Hotel card, camera card, document scan card, identity card, success card |
| [src/components/OtpInput.jsx](src/components/OtpInput.jsx) | Six-box OTP field with paste and arrow-key support |
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
