import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Smartphone, Users } from 'lucide-react'
import {
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
import { statusOf } from '../labels'
import { useApi } from '../useApi'

const date = (iso) => new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
const shortDate = (iso) => new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' })

const age = (dob) => {
  const d = new Date(dob)
  const diff = Date.now() - d.getTime()
  return Math.floor(diff / (365.25 * 86_400_000))
}

export default function GuestsPage() {
  const [query, setQuery] = useState('')
  const { data, error, loading, reload } = useApi(() => api.get('/staff/guests'))
  const guests = data?.guests ?? []

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return guests.filter((g) => !q || g.name.toLowerCase().includes(q))
  }, [guests, query])

  return (
    <div>
      <PageHeader
        title="Guests"
        subtitle="People who have checked in here. Their identity belongs to them, not to this property."
        actions={<SearchInput value={query} onChange={setQuery} placeholder="Search by name" />}
      />

      <Async loading={loading} error={error} onRetry={reload}>
      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={guests.length ? 'No guests match' : 'No guests yet'}
          body="Guests appear here after their first check-in at this property."
        />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Guest</Th>
              <Th>Age</Th>
              <Th>Devices</Th>
              <Th>Stays here</Th>
              <Th className="text-right">Guest since</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((guest) => (
              <tr key={guest.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <Td>
                  <Link
                    to={`/app/guests/${guest.id}`}
                    className="font-semibold text-slate-900 hover:text-brand"
                  >
                    {guest.name}
                  </Link>
                </Td>
                <Td className="tabular-nums">{guest.dateOfBirth ? age(guest.dateOfBirth) : '—'}</Td>
                <Td>
                  {guest.devices ? (
                    <span className="inline-flex items-center gap-1.5 tabular-nums">
                      <Smartphone size={14} className="text-slate-400" />
                      {guest.devices}
                    </span>
                  ) : (
                    <span className="text-slate-400">none</span>
                  )}
                </Td>
                <Td className="tabular-nums">{guest.stays}</Td>
                <Td className="text-right tabular-nums">{shortDate(guest.memberSince)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      </Async>

      <p className="mt-4 max-w-[70ch] text-[12.5px] leading-relaxed text-slate-500">
        You see the guests who have stayed with you. You do not see where else
        they use ChqIn — that's theirs, and it's the reason they only prove who
        they are once.
      </p>
    </div>
  )
}

export function GuestDetailPage() {
  const { id } = useParams()
  const { data: guest, error, loading, reload } = useApi(() => api.get(`/staff/guests/${id}`), [id])

  if (loading || error) {
    return (
      <Async loading={loading} error={error} onRetry={reload}>
        {null}
      </Async>
    )
  }

  const stays = guest.stays ?? []

  return (
    <div>
      <Link
        to="/app/guests"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft size={15} /> All guests
      </Link>

      <PageHeader title={guest.name} subtitle={`Guest since ${date(guest.memberSince)}`} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="px-5 py-4">
          <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[0.1em] text-slate-400">
            Identity
          </h2>
          <DetailRow label="Date of birth">
            {guest.dateOfBirth ? `${date(guest.dateOfBirth)} · ${age(guest.dateOfBirth)}` : 'not recorded'}
          </DetailRow>
          <DetailRow label="Gender">
            <span className="capitalize">{guest.gender ?? 'not recorded'}</span>
          </DetailRow>
          <DetailRow label="ID checked">
            {guest.identityCheckedAt ? date(guest.identityCheckedAt) : 'not recorded'}
          </DetailRow>
          <p className="mt-3 text-[12.5px] leading-relaxed text-slate-500">
            Verified once, at their first check-in. The document itself was
            never stored — only the fact that it was checked.
          </p>
        </Panel>

        <Panel className="px-5 py-4">
          <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[0.1em] text-slate-400">
            Devices
          </h2>
          {guest.devices.length === 0 ? (
            <p className="py-2 text-[13.5px] text-slate-500">
              No passkey enrolled — this guest checks in with help from the desk.
            </p>
          ) : (
            guest.devices.map((device) => (
              <DetailRow key={device.addedAt} label={device.label ?? 'Unnamed device'}>
                {device.lastUsedAt ? `last used ${shortDate(device.lastUsedAt)}` : 'not used yet'}
              </DetailRow>
            ))
          )}
          <p className="mt-3 text-[12.5px] leading-relaxed text-slate-500">
            Each device holds its own passkey. ChqIn stores the public half; the
            private key never leaves the phone.
          </p>
        </Panel>

        <Panel className="overflow-hidden lg:col-span-2">
          <h2 className="px-5 pt-4 pb-2 text-[13px] font-bold uppercase tracking-[0.1em] text-slate-400">
            Stays here
          </h2>
          <table className="w-full border-collapse text-left">
            <tbody>
              {stays.map((booking) => (
                <tr key={booking.id} className="border-t border-slate-100">
                  <Td>
                    <Link
                      to={`/app/bookings/${booking.id}`}
                      className="font-semibold text-slate-900 hover:text-brand"
                    >
                      {booking.reference}
                    </Link>
                  </Td>
                  <Td className="tabular-nums">room {booking.room}</Td>
                  <Td className="tabular-nums whitespace-nowrap">
                    {shortDate(booking.arrival)} → {shortDate(booking.departure)}
                  </Td>
                  <Td className="text-right">
                    <StatusPill tone={statusOf(booking.status).tone}>
                      {statusOf(booking.status).label}
                    </StatusPill>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  )
}
