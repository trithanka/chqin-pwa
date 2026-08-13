/**
 * Display strings live here, not in the database.
 *
 * The API returns raw enums — `checked_in`, `newDevice` — and the dashboard
 * decides how to say them. The moment a server sends "Checked in" down the
 * wire, copy changes need a deploy of the API and the client stops being
 * swappable.
 */

export const STATUS = {
  confirmed: { label: 'Expected', tone: 'neutral' },
  checked_in: { label: 'Checked in', tone: 'good' },
  checked_out: { label: 'Checked out', tone: 'muted' },
  cancelled: { label: 'Cancelled', tone: 'bad' },
}

export const JOURNEY = {
  returning: { label: 'Returning', hint: 'Passkey on a known device' },
  newDevice: { label: 'New device', hint: 'Re-verified, then a new passkey enrolled' },
  firstTime: { label: 'First time', hint: 'Identity created at check-in' },
  desk: { label: 'Desk', hint: 'Checked in by staff' },
}

export const statusOf = (status) => STATUS[status] ?? { label: status, tone: 'neutral' }
export const journeyOf = (journey) => JOURNEY[journey] ?? null
