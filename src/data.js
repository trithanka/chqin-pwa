// All values are fake placeholder data for the prototype.

export const HOTEL = {
  name: 'Hotel Aurora',
  room: 'Room 305',
  roomNumber: '305',
  location: 'Bandra West, Mumbai',
  booking: '#AUR-4821',
  nights: '2 nights',
  guest: 'Rahul Sharma',
  checkOut: 'Sat, 8 Aug · 11:00 AM',
}

// What the scanned QR resolves to: which hotel, and which check-in session.
export const SESSION = {
  hotel: HOTEL.name,
  bookingRef: HOTEL.booking,
  guestName: HOTEL.guest,
}

export const GUEST = {
  name: 'Rahul Sharma',
  phone: '+91 XXXXXXX248',
  dob: '01 Jan 1998',
  documentNumber: 'XXXX XXXX 5678',
  masked: 'XXXX 5678',
}
