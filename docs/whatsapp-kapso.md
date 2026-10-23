# WhatsApp through Kapso

WhatsApp is used by both venue types: visitors and hosts at workplaces, and guests and staff at hotels.

## Workplace visitors

ChqIn sends a host a WhatsApp message when a visitor arrives, and the host answers with a button: **Confirm**, **Keep waiting** or **Decline**. The visitor's phone updates by itself. The dashboard does the same job, so WhatsApp can be off and nothing breaks.

## Hotels

Four messages, each a template:

| Message | Template | To | When |
| --- | --- | --- | --- |
| Check-in alert | `hotel_checkin_alert` | The hotel's reception number | A guest checks in, with their name and room (or "not assigned yet" for a walk-in) |
| Stay details | `hotel_checkin_confirmed` | The guest | The guest enters their number on the stay screen. The template only confirms the check-in, with a **Send room details** button. Tapping it opens WhatsApp's 24-hour window, and Wi-Fi, breakfast, check-out and notes come back as a plain message. Meta rejected every template that carried those details as marketing. |
| Room ready | `hotel_room_ready` | The guest | The desk assigns a room, only for a guest who asked for stay details |
| Service request | `service_request` | The team that handles that service | A guest taps Food, Laundry and so on in the app and sends it, with an optional note |

- **Reception number:** set in the hotel dashboard under Settings, Guest Services, and asked for during onboarding. Empty means no alerts.
- **The guest's number is their consent.** They type it on the stay screen under "Keep these details on WhatsApp", and the line under the field says what it will be used for. It is kept encrypted on that stay only and is not stored on the guest. A guest who doesn't enter one is never messaged.
- **Requests are limited** to 10 per stay.
- **Only where WhatsApp is switched on.** If the API isn't running with `OUTBOX_SENDER=kapso`, the stay screen keeps working as before: the service tiles open the guest's own WhatsApp, and the stay-details card is hidden. Requests are never written to an outbox that nothing sends.

## How it fits

```
visitor picks a host
   │  (same database transaction)
   ├─► entry_sessions: waiting for staff
   └─► outbox: a "visitor_arrival" message for the host
                  │
        worker (OUTBOX_SENDER=kapso) sends it as a WhatsApp template
                  │
          host taps a button in WhatsApp
                  │
        Kapso ──► POST /webhooks/kapso  (signed)
                  │
        the visit is confirmed, held or declined, exactly as from the dashboard
```

- A message is written to the `outbox` table in the same transaction as the visit, then sent afterwards. A slow or failing provider never holds a visitor, and a visit that rolls back sends nothing. A failed send is retried with a growing delay and gives up after five tries.
- Event check-ins send the organiser a plain notice (`event_checkin`). It has no buttons, because nothing waits on it.
- Six templates are used: `visitor_arrival` (three quick-reply buttons), `event_checkin`, `hotel_checkin_alert`, `hotel_checkin_confirmed`, `hotel_room_ready` and `service_request`. WhatsApp only allows a business to start a conversation with an approved template. `npm run kapso:templates` creates all six.

## Setup, in order

These steps need your Kapso and Meta accounts, so they are done by hand.

1. **Create a Kapso account** and a project. The free plan covers 2,000 messages a month and one number.
2. **Connect a WhatsApp number** in Kapso (it walks you through Meta's business account). Note the **phone number id** and the **WhatsApp business account (WABA) id**. Use Kapso's sandbox first if you want to test before connecting a real number.
3. **Create an API key** in Kapso.
4. **Create the templates:**
   ```
   KAPSO_API_KEY=… KAPSO_WABA_ID=… npm run kapso:templates
   ```
   Meta reviews them, usually within minutes to a day. Check their status in Kapso. A template cannot be sent until it is approved. Both are created as UTILITY; Meta may reclassify wording that reads as promotional, so keep the text plain.
5. **Register the webhook** in Kapso, on the phone number:
   - URL: `https://api2.chqin.in/webhooks/kapso`
   - Event: `whatsapp.message.received`
   - Choose a long random **secret** and keep it for the next step.
6. **Set the environment** on the API server (`apps/api/.env`) and restart it:
   ```
   OUTBOX_SENDER=kapso
   KAPSO_API_KEY=…
   KAPSO_PHONE_NUMBER_ID=…
   KAPSO_WEBHOOK_SECRET=…
   ```
   The API refuses to start with `OUTBOX_SENDER=kapso` and no key or number.
7. **Give hosts a WhatsApp number** in the dashboard under People & teams. A host with no number is not messaged; the visit still shows on the Today screen.

## What to know

- **Cost.** Meta charges per delivered template message, whichever provider sends it. Kapso's plan is separate. Check Meta's current India rate card and Kapso's pricing page before budgeting.
- **Who may answer.** The webhook must carry a valid signature, so nothing unsigned is acted on. Where WhatsApp includes the sender's number, it must match the number on file for that visit's host. WhatsApp can hide numbers behind business-scoped user ids; in that case the button itself is the proof, because only that host's WhatsApp received it.
- **A visit that has already been decided** (answered on the dashboard first, or tapped twice) is acknowledged and left alone. It is never an error.
- **Button taps** arrive as either a `button` or an `interactive` message, depending on the template type. Both are read. Confirm what Kapso sends for your first real tap, because this was written from their documentation, not from a live number.
- **Without Kapso configured**, messages stay `pending` in the `outbox` table. Setting `OUTBOX_SENDER=log` prints them instead and marks them sent; use that for development only.
