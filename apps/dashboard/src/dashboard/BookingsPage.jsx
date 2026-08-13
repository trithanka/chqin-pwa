import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarCheck } from 'lucide-react'
import {
  Button,
  DetailRow,
  EmptyState,
  PageHeader,
  Panel,
  SearchInput,
  StatusPill,
  TableWrap,
  Td,
  Th,
} from '../components/ui'
import { api } from '../api'
import Async from '../components/Async'
import { journeyOf, statusOf } from '../labels'
import { useApi } from '../useApi'

const date = (iso) =>
  new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' })
const dateTime = (iso) =>
  new Date(iso).toLocaleString([], {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

const FILTERS = [
  ['all', 'All'],
  ['confirmed', 'Expected'],
  ['checked_in', 'In house'],
  ['checked_out', 'Departed'],
]

export default function BookingsPage() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const { data, error, loading, reload } = useApi(() => api.get('/staff/bookings'))
  const bookings = data?.bookings ?? []

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return bookings
      .filter((b) => (filter === 'all' ? true : b.status === filter))
      .filter(
        (b) =>
          !q ||
          b.guestName.toLowerCase().includes(q) ||
          b.reference.toLowerCase().includes(q) ||
          (b.room ?? '').includes(q),
      )
      .sort((a, b) => b.arrival.localeCompare(a.arrival) || (a.room ?? '').localeCompare(b.room ?? ''))
  }, [bookings, query, filter])

  return (
    <div>
      <PageHeader
        title="Bookings"
        subtitle="Every reservation this property has, past and upcoming."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
          {FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-[7px] px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                filter === value ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <SearchInput value={query} onChange={setQuery} placeholder="Name, reference or room" />
      </div>

      <Async loading={loading} error={error} onRetry={reload}>
      {rows.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title={bookings.length ? 'Nothing matches' : 'No bookings yet'}
          body={
            bookings.length
              ? 'Try a different filter, or search by guest name, booking reference or room number.'
              : 'Reservations appear here once your property management system sends them, or when you add them by hand.'
          }
        />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Guest</Th>
              <Th>Reference</Th>
              <Th>Room</Th>
              <Th>Stay</Th>
              <Th>Status</Th>
              <Th>Source</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((booking) => (
              <tr key={booking.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <Td>
                  <Link
                    to={`/app/bookings/${booking.id}`}
                    className="font-semibold text-slate-900 hover:text-brand"
                  >
                    {booking.guestName}
                  </Link>
                </Td>
                <Td className="tabular-nums">{booking.reference}</Td>
                <Td className="tabular-nums font-semibold text-slate-700">{booking.room}</Td>
                <Td className="tabular-nums whitespace-nowrap">
                  {date(booking.arrival)} → {date(booking.departure)}
                </Td>
                <Td>
                  <StatusPill tone={statusOf(booking.status).tone}>
                    {statusOf(booking.status).label}
                  </StatusPill>
                </Td>
                <Td>{booking.source ?? 'Direct'}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      </Async>
    </div>
  )
}

export function BookingDetailPage() {
  const { id } = useParams()
  const { data: booking, error, loading, reload } = useApi(
    () => api.get(`/staff/bookings/${id}`),
    [id],
  )

  if (loading || error) {
    return (
      <Async loading={loading} error={error} onRetry={reload}>
        {null}
      </Async>
    )
  }

  return (
    <div>
      <Link
        to="/app/bookings"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft size={15} /> All bookings
      </Link>

      <PageHeader
        title={booking.guestName}
        subtitle={`${booking.reference} · room ${booking.room ?? 'unassigned'}`}
        actions={
          <StatusPill tone={statusOf(booking.status).tone}>
            {statusOf(booking.status).label}
          </StatusPill>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="px-5 py-4">
          <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[0.1em] text-slate-400">
            Reservation
          </h2>
          <DetailRow label="Reference">{booking.reference}</DetailRow>
          <DetailRow label="Room">
            {[booking.room, booking.roomType].filter(Boolean).join(' · ') || 'not assigned'}
          </DetailRow>
          <DetailRow label="Arrival">{date(booking.arrival)}</DetailRow>
          <DetailRow label="Departure">{date(booking.departure)}</DetailRow>
          <DetailRow label="Booked through">{booking.source ?? 'Direct'}</DetailRow>
        </Panel>

        <Panel className="px-5 py-4">
          <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[0.1em] text-slate-400">
            Check-in
          </h2>
          {booking.checkedInAt ? (
            <>
              <DetailRow label="Arrived">{dateTime(booking.checkedInAt)}</DetailRow>
              <DetailRow label="How">{journeyOf(booking.journey)?.label ?? '—'}</DetailRow>
              <DetailRow label="Verified by">Passkey on the guest's own device</DetailRow>
              <p className="mt-3 text-[12.5px] leading-relaxed text-slate-500">
                {journeyOf(booking.journey)?.hint}. ChqIn never saw a face or a
                fingerprint — the phone released the passkey and we checked the
                signature.
              </p>
            </>
          ) : (
            <>
              <DetailRow label="Status">Not arrived yet</DetailRow>
              <p className="mt-3 text-[12.5px] leading-relaxed text-slate-500">
                Nothing to do. The guest scans the desk code when they get here;
                if they need help, you can check them in manually.
              </p>
              <div className="mt-4">
                <Button tone="secondary" size="sm">
                  Check in manually
                </Button>
              </div>
            </>
          )}
        </Panel>

        <Panel className="px-5 py-4 lg:col-span-2">
          <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[0.1em] text-slate-400">
            Guest
          </h2>
          {booking.guestId ? (
            <>
              <DetailRow label="ChqIn identity">
                <Link to={`/app/guests/${booking.guestId}`} className="text-brand hover:underline">
                  {booking.guestName}
                </Link>
              </DetailRow>
              <DetailRow label="Room">{booking.room ?? 'not assigned'}</DetailRow>
            </>
          ) : (
            <p className="py-2 text-[13.5px] text-slate-500">
              Not linked to a ChqIn identity yet — this reservation was made in
              a name, and becomes a person the first time they check in.
            </p>
          )}
        </Panel>
      </div>
    </div>
  )
}
