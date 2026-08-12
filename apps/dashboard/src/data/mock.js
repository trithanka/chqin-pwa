/**
 * Stand-in data for the dashboard.
 *
 * The API has no staff surface yet — no staff accounts, no session auth, no
 * endpoint that lists bookings — so these rows are shaped exactly like the
 * tables in docs/data-model.md and swapped for fetches when that lands.
 */

const day = 86_400_000
const iso = (offsetDays) => new Date(Date.now() + offsetDays * day).toISOString().slice(0, 10)
const at = (hours, minutes = 0) => {
  const d = new Date()
  d.setHours(hours, minutes, 0, 0)
  return d.toISOString()
}

export const venue = {
  name: 'Hotel Aurora',
  kind: 'hotel',
  location: 'Bandra West, Mumbai',
  timezone: 'Asia/Kolkata',
  rooms: 42,
}

export const guests = [
  {
    id: 'g1',
    name: 'Rahul Sharma',
    dateOfBirth: '1998-01-01',
    gender: 'male',
    memberSince: iso(-420),
    devices: [
      { label: 'iPhone 15', addedAt: iso(-420), lastUsedAt: at(14, 12) },
      { label: 'iPad', addedAt: iso(-96), lastUsedAt: iso(-96) },
    ],
    identityCheckedAt: iso(-420),
    stays: 7,
  },
  {
    id: 'g2',
    name: 'Ananya Iyer',
    dateOfBirth: '1991-07-19',
    gender: 'female',
    memberSince: iso(-210),
    devices: [{ label: 'Pixel 9', addedAt: iso(-210), lastUsedAt: at(13, 48) }],
    identityCheckedAt: iso(-210),
    stays: 3,
  },
  {
    id: 'g3',
    name: 'Meera Krishnan',
    dateOfBirth: '1986-11-03',
    gender: 'female',
    memberSince: iso(-14),
    devices: [{ label: 'iPhone 13', addedAt: iso(-14), lastUsedAt: at(15, 6) }],
    identityCheckedAt: iso(-14),
    stays: 2,
  },
  {
    id: 'g4',
    name: 'Daniel Okafor',
    dateOfBirth: '1979-05-22',
    gender: 'male',
    memberSince: iso(0),
    devices: [{ label: 'Galaxy S24', addedAt: iso(0), lastUsedAt: at(15, 34) }],
    identityCheckedAt: iso(0),
    stays: 1,
  },
  {
    id: 'g5',
    name: 'Sofia Almeida',
    dateOfBirth: '2001-02-14',
    gender: 'female',
    memberSince: iso(-63),
    devices: [],
    identityCheckedAt: iso(-63),
    stays: 1,
  },
]

export const bookings = [
  {
    id: 'b1',
    reference: 'AUR-4821',
    guestId: 'g1',
    guestName: 'Rahul Sharma',
    room: '305',
    roomType: 'Deluxe',
    arrival: iso(0),
    departure: iso(2),
    status: 'checked_in',
    checkedInAt: at(14, 12),
    journey: 'returning',
    source: 'Booking.com',
  },
  {
    id: 'b2',
    reference: 'AUR-4822',
    guestId: 'g2',
    guestName: 'Ananya Iyer',
    room: '306',
    roomType: 'Deluxe',
    arrival: iso(0),
    departure: iso(1),
    status: 'checked_in',
    checkedInAt: at(13, 48),
    journey: 'returning',
    source: 'Direct',
  },
  {
    id: 'b3',
    reference: 'AUR-4823',
    guestId: 'g3',
    guestName: 'Meera Krishnan',
    room: '412',
    roomType: 'Suite',
    arrival: iso(0),
    departure: iso(3),
    status: 'checked_in',
    checkedInAt: at(15, 6),
    journey: 'newDevice',
    source: 'Direct',
  },
  {
    id: 'b4',
    reference: 'AUR-4824',
    guestId: 'g4',
    guestName: 'Daniel Okafor',
    room: '210',
    roomType: 'Standard',
    arrival: iso(0),
    departure: iso(1),
    status: 'checked_in',
    checkedInAt: at(15, 34),
    journey: 'firstTime',
    source: 'MakeMyTrip',
  },
  {
    id: 'b5',
    reference: 'AUR-4825',
    guestId: null,
    guestName: 'Vikram Bose',
    room: '208',
    roomType: 'Standard',
    arrival: iso(0),
    departure: iso(2),
    status: 'confirmed',
    checkedInAt: null,
    journey: null,
    source: 'Booking.com',
  },
  {
    id: 'b6',
    reference: 'AUR-4826',
    guestId: 'g5',
    guestName: 'Sofia Almeida',
    room: '311',
    roomType: 'Deluxe',
    arrival: iso(0),
    departure: iso(4),
    status: 'confirmed',
    checkedInAt: null,
    journey: null,
    source: 'Direct',
  },
  {
    id: 'b7',
    reference: 'AUR-4827',
    guestId: null,
    guestName: 'Kabir Malhotra',
    room: '404',
    roomType: 'Suite',
    arrival: iso(0),
    departure: iso(1),
    status: 'confirmed',
    checkedInAt: null,
    journey: null,
    source: 'Agoda',
  },
  {
    id: 'b8',
    reference: 'AUR-4818',
    guestId: 'g1',
    guestName: 'Rahul Sharma',
    room: '305',
    roomType: 'Deluxe',
    arrival: iso(-6),
    departure: iso(-4),
    status: 'checked_out',
    checkedInAt: iso(-6),
    journey: 'returning',
    source: 'Direct',
  },
  {
    id: 'b9',
    reference: 'AUR-4830',
    guestId: null,
    guestName: 'Leila Haddad',
    room: '502',
    roomType: 'Suite',
    arrival: iso(1),
    departure: iso(3),
    status: 'confirmed',
    checkedInAt: null,
    journey: null,
    source: 'Direct',
  },
  {
    id: 'b10',
    reference: 'AUR-4831',
    guestId: 'g2',
    guestName: 'Ananya Iyer',
    room: '307',
    roomType: 'Deluxe',
    arrival: iso(1),
    departure: iso(2),
    status: 'confirmed',
    checkedInAt: null,
    journey: null,
    source: 'Booking.com',
  },
]

export const STATUS = {
  confirmed: { label: 'Expected', tone: 'neutral' },
  checked_in: { label: 'Checked in', tone: 'good' },
  checked_out: { label: 'Checked out', tone: 'muted' },
  cancelled: { label: 'Cancelled', tone: 'bad' },
}

export const JOURNEY = {
  returning: { label: 'Returning', hint: 'Passkey on a known device' },
  newDevice: { label: 'New device', hint: 'Re-verified, new passkey enrolled' },
  firstTime: { label: 'First time', hint: 'Identity created at check-in' },
}

export const guestById = (id) => guests.find((g) => g.id === id) ?? null
export const bookingById = (id) => bookings.find((b) => b.id === id) ?? null
export const bookingsForGuest = (guestId) => bookings.filter((b) => b.guestId === guestId)

export const today = () => {
  const t = iso(0)
  const arrivals = bookings.filter((b) => b.arrival === t)
  return {
    arrivals,
    checkedIn: arrivals.filter((b) => b.status === 'checked_in'),
    awaiting: arrivals.filter((b) => b.status === 'confirmed'),
    inHouse: bookings.filter((b) => b.status === 'checked_in'),
  }
}
