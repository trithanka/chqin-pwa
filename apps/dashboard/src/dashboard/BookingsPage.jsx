import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Copy,
  DoorClosed,
  Globe,
  MapPin,
  ShieldCheck,
  Smartphone,
  User,
} from 'lucide-react'
import {
  Avatar,
  Badge,
  Breadcrumbs,
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
  new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
const shortDate = (iso) =>
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
  ['all', 'All Bookings'],
  ['confirmed', 'Expected'],
  ['checked_in', 'In House'],
  ['checked_out', 'Departed'],
]

function getNights(arr, dep) {
  if (!arr || !dep) return 1
  const diff = new Date(dep).getTime() - new Date(arr).getTime()
  return Math.max(1, Math.round(diff / 86400000))
}

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
          (b.room ?? '').toString().includes(q),
      )
      .sort((a, b) => b.arrival.localeCompare(a.arrival) || (a.room ?? '').localeCompare(b.room ?? ''))
  }, [bookings, query, filter])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bookings"
        subtitle="Manage upcoming reservations, in-house guests, and past stays."
        showBack
        badge={
          <Badge tone="neutral" size="sm">
            {bookings.length} Total
          </Badge>
        }
      />

      <Panel className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="inline-flex rounded-xl bg-slate-100/90 p-1 ring-1 ring-slate-200/50">
            {FILTERS.map(([value, label]) => {
              const count =
                value === 'all'
                  ? bookings.length
                  : bookings.filter((b) => b.status === value).length

              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={`rounded-lg px-3 py-1.5 text-[12.5px] font-bold transition-all ${
                    filter === value
                      ? 'bg-white text-slate-900 shadow-xs ring-1 ring-black/5'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {label} <span className="ml-1 text-[11px] opacity-60">({count})</span>
                </button>
              )
            })}
          </div>

          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search by name, reference, or room..."
            className="w-full sm:w-auto"
          />
        </div>

        <Async loading={loading} error={error} onRetry={reload}>
          {rows.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title={bookings.length ? 'No bookings match' : 'No reservations recorded'}
              body={
                bookings.length
                  ? 'Try a different filter or search query.'
                  : 'Reservations appear here once they sync from your PMS or are created at the front desk.'
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead>
                  <tr>
                    <Th>Guest</Th>
                    <Th>Booking Ref</Th>
                    <Th>Room</Th>
                    <Th>Stay Period</Th>
                    <Th>Status</Th>
                    <Th>Source</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/80">
                  {rows.map((booking) => {
                    const nights = getNights(booking.arrival, booking.departure)
                    return (
                      <tr
                        key={booking.id}
                        className="group transition-colors hover:bg-slate-50/70"
                      >
                        <Td className="py-3.5">
                          <div className="flex items-center gap-3">
                            <Avatar name={booking.guestName} size="md" />
                            <div>
                              <Link
                                to={`/app/bookings/${booking.id}`}
                                className="font-bold text-slate-900 transition-colors hover:text-brand hover:underline underline-offset-2"
                              >
                                {booking.guestName}
                              </Link>
                              {booking.roomsCount > 1 && (
                                <p className="text-[11.5px] font-medium text-slate-400">
                                  {booking.roomsCount} rooms requested
                                </p>
                              )}
                            </div>
                          </div>
                        </Td>
                        <Td className="py-3.5 font-mono text-[13px] font-medium text-slate-600">
                          {booking.reference}
                        </Td>
                        <Td className="py-3.5 font-bold tabular-nums text-slate-800">
                          {booking.room ? (
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-[12.5px]">
                              <DoorClosed size={13} className="text-slate-400" />
                              Room {booking.room}
                            </span>
                          ) : (
                            <span className="text-[12.5px] font-normal text-slate-400 italic">
                              Unassigned
                            </span>
                          )}
                        </Td>
                        <Td className="py-3.5 tabular-nums whitespace-nowrap">
                          <div className="text-[13px] font-medium text-slate-800">
                            {shortDate(booking.arrival)} → {shortDate(booking.departure)}
                          </div>
                          <span className="text-[11.5px] font-medium text-slate-400">
                            {nights} {nights === 1 ? 'night' : 'nights'}
                          </span>
                        </Td>
                        <Td className="py-3.5">
                          <StatusPill tone={statusOf(booking.status).tone}>
                            {statusOf(booking.status).label}
                          </StatusPill>
                        </Td>
                        <Td className="py-3.5">
                          <Badge
                            tone={
                              booking.source?.toLowerCase().includes('direct')
                                ? 'brand'
                                : 'neutral'
                            }
                            size="sm"
                          >
                            {booking.source ?? 'Direct'}
                          </Badge>
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </Panel>
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

  const nights = getNights(booking.arrival, booking.departure)

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'All Bookings', to: '/app/bookings' },
          { label: booking.guestName },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div className="flex items-center gap-3.5">
          <Avatar name={booking.guestName} size="lg" />
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-[22px] font-extrabold tracking-tight text-slate-900">
                {booking.guestName}
              </h1>
              <StatusPill tone={statusOf(booking.status).tone}>
                {statusOf(booking.status).label}
              </StatusPill>
            </div>
            <p className="mt-0.5 font-mono text-[13px] font-medium text-slate-500">
              Ref: {booking.reference}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Reservation Details */}
        <Panel className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 text-slate-900">
            <Calendar className="size-4 text-brand" />
            <h2 className="text-[15px] font-bold">Stay Overview</h2>
          </div>

          <div className="divide-y divide-slate-100">
            <DetailRow label="Check-in Date">{date(booking.arrival)}</DetailRow>
            <DetailRow label="Check-out Date">{date(booking.departure)}</DetailRow>
            <DetailRow label="Duration">{nights} {nights === 1 ? 'Night' : 'Nights'}</DetailRow>
            <DetailRow label="Room">
              {[booking.room ? `Room ${booking.room}` : null, booking.roomType]
                .filter(Boolean)
                .join(' · ') || 'Unassigned'}
            </DetailRow>
            <DetailRow label="Booking Source">
              <Badge tone="brand" size="sm">{booking.source ?? 'Direct'}</Badge>
            </DetailRow>
          </div>
        </Panel>

        {/* Check-in Status */}
        <Panel className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 text-slate-900">
            <ShieldCheck className="size-4 text-emerald-600" />
            <h2 className="text-[15px] font-bold">Digital Identity & Check-in</h2>
          </div>

          {booking.checkedInAt ? (
            <div className="space-y-3">
              <div className="divide-y divide-slate-100">
                <DetailRow label="Checked in At">{dateTime(booking.checkedInAt)}</DetailRow>
                <DetailRow label="Method">{journeyOf(booking.journey)?.label ?? 'Self Check-in'}</DetailRow>
                <DetailRow label="Verification">
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[13px]">
                    <CheckCircle2 size={14} />
                    {booking.passkey ? 'Passkey Verified' : 'Aadhaar Verified — no passkey'}
                  </span>
                </DetailRow>
              </div>
              <div className="rounded-xl bg-slate-50 p-3.5 text-[12.5px] leading-relaxed text-slate-600 border border-slate-200/60">
                {journeyOf(booking.journey)?.hint}. ChqIn verified cryptographic identity on-device without exposing sensitive biometric credentials.
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl bg-amber-50/70 border border-amber-200/60 p-4 text-[13px] text-amber-900">
                <p className="font-bold">Awaiting Guest Arrival</p>
                <p className="mt-1 text-[12.5px] text-amber-800 leading-relaxed">
                  The guest will scan your desk QR code upon arrival to instantly verify and complete check-in.
                </p>
              </div>
            </div>
          )}
        </Panel>

        {/* Linked Guest Identity */}
        <Panel className="p-5 sm:p-6 lg:col-span-2 space-y-4">
          <div className="flex items-center gap-2 text-slate-900">
            <User className="size-4 text-indigo-600" />
            <h2 className="text-[15px] font-bold">ChqIn Identity Profile</h2>
          </div>

          {booking.guestId ? (
            <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
              <div className="flex items-center gap-3">
                <Avatar name={booking.guestName} size="md" />
                <div>
                  <p className="font-bold text-slate-900">{booking.guestName}</p>
                  <p className="text-[12.5px] text-slate-500">Verified ChqIn Member</p>
                </div>
              </div>
              <Link to={`/app/guests/${booking.guestId}`}>
                <Button tone="secondary" size="sm">
                  View Full Profile
                </Button>
              </Link>
            </div>
          ) : (
            <p className="text-[13px] text-slate-500 leading-relaxed">
              This reservation was created under a guest name and will link to a verified ChqIn digital identity once the guest scans the check-in code.
            </p>
          )}
        </Panel>
      </div>
    </div>
  )
}

