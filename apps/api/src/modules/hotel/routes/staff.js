import { Hono } from 'hono'
import { z } from 'zod'
import { body } from '../../../shared/lib/validate.js'
import { getBooking, listBookings } from '../hotelBookings.js'
import { getGuest, listGuests } from '../hotelGuests.js'
import { listRooms, addRooms, removeRoom, assignRoom } from '../hotelRooms.js'
import { overview } from '../hotelToday.js'

/** The staff API for a hotel's desk: Today, reservations, guests and rooms. Mounted after the session guard in venueStaff.js, so every route here is private. */
export const hotelStaff = new Hono()

const venueOf = (c) => c.get('session').venueId

const roomsRequest = z.object({
  rooms: z
    .array(z.object({ number: z.string().min(1).max(16), type: z.string().max(40).optional() }))
    .min(1)
    .max(500),
})

/** The whole list, every time. An empty one takes the rooms back. */
const roomRequest = z.object({ roomIds: z.array(z.uuid()).max(20).default([]) })

hotelStaff.get('/overview', async (c) => c.json(await overview(venueOf(c))))

hotelStaff.get('/bookings', async (c) => c.json({ bookings: await listBookings(venueOf(c)) }))

hotelStaff.get('/bookings/:id', async (c) => c.json(await getBooking(venueOf(c), c.req.param('id'))))

hotelStaff.get('/guests', async (c) => c.json({ guests: await listGuests(venueOf(c)) }))

hotelStaff.get('/guests/:id', async (c) => c.json(await getGuest(venueOf(c), c.req.param('id'))))

hotelStaff.get('/rooms', async (c) => c.json({ rooms: await listRooms(venueOf(c)) }))

hotelStaff.post('/rooms', body(roomsRequest), async (c) =>
  c.json(await addRooms(venueOf(c), c.get('body').rooms)),
)

hotelStaff.delete('/rooms/:id', async (c) => c.json(await removeRoom(venueOf(c), c.req.param('id'))))

hotelStaff.post('/checkins/:id/room', body(roomRequest), async (c) =>
  c.json(await assignRoom(venueOf(c), c.req.param('id'), c.get('body').roomIds)),
)
