import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  DoorClosed,
  History,
  KeyRound,
  Shield,
  ShieldCheck,
  Smartphone,
  User,
  Users,
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
import { statusOf } from '../labels'
import { useApi } from '../useApi'

const date = (iso) =>
  new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
const shortDate = (iso) =>
  new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' })

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
    <div className="space-y-6">
      <PageHeader
        title="Guests"
        subtitle="People who have checked in at this property with self-sovereign digital identity."
        showBack
        badge={
          <Badge tone="neutral" size="sm">
            {guests.length} Members
          </Badge>
        }
        actions={
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search guests by name..."
            className="w-full sm:w-auto"
          />
        }
      />

      <Async loading={loading} error={error} onRetry={reload}>
        {rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={guests.length ? 'No guests match search' : 'No guests registered yet'}
            body="Guests appear here after completing their first cryptographic check-in at your property."
          />
        ) : (
          <Panel className="p-5 space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse text-left">
                <thead>
                  <tr>
                    <Th>Guest Member</Th>
                    <Th>Age</Th>
                    <Th>Enrolled Devices</Th>
                    <Th>Stays at Property</Th>
                    <Th className="text-right">Member Since</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/80">
                  {rows.map((guest) => (
                    <tr
                      key={guest.id}
                      className="group transition-colors hover:bg-slate-50/70"
                    >
                      <Td className="py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar name={guest.name} size="md" />
                          <div>
                            <Link
                              to={`/app/guests/${guest.id}`}
                              className="font-bold text-slate-900 transition-colors hover:text-brand hover:underline underline-offset-2"
                            >
                              {guest.name}
                            </Link>
                            <div className="mt-0.5 flex items-center gap-1.5">
                              {guest.stays > 1 ? (
                                <Badge tone="good" size="xs">
                                  Repeat Guest · {guest.stays} Stays
                                </Badge>
                              ) : (
                                <Badge tone="neutral" size="xs">
                                  First-time Guest
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </Td>
                      <Td className="py-3.5 tabular-nums font-medium text-slate-700">
                        {guest.dateOfBirth ? `${age(guest.dateOfBirth)} yrs` : '—'}
                      </Td>
                      <Td className="py-3.5">
                        {guest.devices ? (
                          <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 tabular-nums">
                            <Smartphone size={14} className="text-brand" />
                            {guest.devices} {guest.devices === 1 ? 'Device' : 'Devices'}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-medium">None</span>
                        )}
                      </Td>
                      <Td className="py-3.5 font-bold tabular-nums text-slate-800">
                        {guest.stays} {guest.stays === 1 ? 'Stay' : 'Stays'}
                      </Td>
                      <Td className="py-3.5 text-right font-medium tabular-nums text-slate-600">
                        {shortDate(guest.memberSince)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </Async>

      {/* Privacy Guarantee Note */}
      <div className="rounded-xl border border-slate-200/80 bg-white/70 p-4 shadow-2xs">
        <div className="flex items-start gap-3">
          <Shield className="size-5 shrink-0 text-brand mt-0.5" />
          <p className="text-[12.5px] leading-relaxed text-slate-600">
            <strong className="text-slate-900">Privacy by Design:</strong> Front desk staff only
            see guests who have checked in at this property. ChqIn guest identities belong to the
            traveler — guest cross-property visit histories remain encrypted and private.
          </p>
        </div>
      </div>
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
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'All Guests', to: '/app/guests' },
          { label: guest.name },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div className="flex items-center gap-3.5">
          <Avatar name={guest.name} size="lg" />
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-[22px] font-extrabold tracking-tight text-slate-900">
                {guest.name}
              </h1>
              <Badge tone="good" size="sm">
                <CheckCircle2 size={12} /> ID Verified
              </Badge>
            </div>
            <p className="mt-0.5 text-[13px] font-medium text-slate-500">
              Member since {date(guest.memberSince)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Identity Information */}
        <Panel className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 text-slate-900">
            <ShieldCheck className="size-4 text-brand" />
            <h2 className="text-[15px] font-bold">Identity Verification</h2>
          </div>

          <div className="divide-y divide-slate-100">
            <DetailRow label="Date of Birth">
              {guest.dateOfBirth ? `${date(guest.dateOfBirth)} (${age(guest.dateOfBirth)} years old)` : 'Not recorded'}
            </DetailRow>
            <DetailRow label="Gender">
              <span className="capitalize">{guest.gender ?? 'Not recorded'}</span>
            </DetailRow>
            {guest.careOf && <DetailRow label="Care of">{guest.careOf}</DetailRow>}
            {guest.maskedAadhaar && (
              <DetailRow label="Aadhaar">
                <span className="tabular-nums">{guest.maskedAadhaar}</span>
              </DetailRow>
            )}
            <DetailRow label="Identity Verified On">
              {guest.identityCheckedAt ? date(guest.identityCheckedAt) : 'At first check-in'}
            </DetailRow>
            <DetailRow label="Registered Address">
              {guest.address ? (
                <address className="not-italic leading-relaxed whitespace-pre-line">{formatAddress(guest.address)}</address>
              ) : (
                // Verified before addresses were stored: the check happened,
                // the address was not kept. Say that rather than implying the
                // guest never gave one.
                <span className="text-slate-400">Not recorded</span>
              )}
            </DetailRow>
          </div>

          <p className="rounded-lg bg-slate-50 p-3 text-[12px] leading-relaxed text-slate-500 border border-slate-200/60">
            Government ID was verified at first check-in. The raw identity document is never stored on servers — only the cryptographic proof of verification.
          </p>
        </Panel>

        {/* Enrolled Passkey Devices */}
        <Panel className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 text-slate-900">
            <KeyRound className="size-4 text-emerald-600" />
            <h2 className="text-[15px] font-bold">Enrolled Passkeys</h2>
          </div>

          {guest.devices.length === 0 ? (
            <p className="py-2 text-[13px] text-slate-500">
              No passkey device enrolled. Guest checks in with staff assistance.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {guest.devices.map((device, i) => (
                <DetailRow key={device.addedAt || i} label={device.label ?? 'Personal Smartphone'}>
                  <span className="text-[12.5px] font-medium text-slate-600">
                    {device.lastUsedAt ? `Last active ${shortDate(device.lastUsedAt)}` : 'Active Passkey'}
                  </span>
                </DetailRow>
              ))}
            </div>
          )}

          <p className="rounded-lg bg-slate-50 p-3 text-[12px] leading-relaxed text-slate-500 border border-slate-200/60">
            Passkeys securely hold private cryptographic keys inside the guest's device hardware security module (Secure Enclave).
          </p>
        </Panel>

        {/* Stays History */}
        <Panel className="p-5 sm:p-6 lg:col-span-2 space-y-4">
          <div className="flex items-center gap-2 text-slate-900">
            <History className="size-4 text-indigo-600" />
            <h2 className="text-[15px] font-bold">Stay History at this Property</h2>
          </div>

          {stays.length === 0 ? (
            <p className="text-[13px] text-slate-500">No recorded stays yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr>
                    <Th>Booking Ref</Th>
                    <Th>Room</Th>
                    <Th>Stay Period</Th>
                    <Th className="text-right">Status</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stays.map((booking) => (
                    <tr key={booking.id} className="hover:bg-slate-50/70 transition-colors">
                      <Td className="py-3 font-mono font-bold text-slate-900">
                        <Link
                          to={`/app/bookings/${booking.id}`}
                          className="hover:text-brand hover:underline"
                        >
                          {booking.reference}
                        </Link>
                      </Td>
                      <Td className="py-3 tabular-nums font-semibold text-slate-700">
                        {booking.room ? `Room ${booking.room}` : 'Unassigned'}
                      </Td>
                      <Td className="py-3 tabular-nums text-slate-600">
                        {shortDate(booking.arrival)} → {shortDate(booking.departure)}
                      </Td>
                      <Td className="py-3 text-right">
                        <StatusPill tone={statusOf(booking.status).tone}>
                          {statusOf(booking.status).label}
                        </StatusPill>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}

/**
 * UIDAI's address as a register would write it.
 *
 * The parts are all optional and which ones exist differs between records, so
 * this drops the empties and joins what is left rather than assuming a shape.
 * Ordered house → street → landmark → locality → post → district → state →
 * pincode, which is how an Indian address is read aloud.
 */
function formatAddress(address) {
  // UIDAI repeats the same place across several parts — vtc, subdist and
  // district are frequently all "Chennai", and `post` often echoes `locality`
  // in different case. A register reading "Chennai, Chennai, Chennai" looks
  // broken, so each value is used once, first occurrence winning.
  const used = new Set()
  const take = (...keys) =>
    keys
      .map((k) => address[k]?.trim())
      .filter((v) => {
        if (!v) return false
        const key = v.toLowerCase()
        if (used.has(key)) return false
        used.add(key)
        return true
      })
      .join(', ')

  // Ordered the way an Indian address is read aloud.
  return [
    take('house', 'street'),
    take('landmark'),
    take('locality', 'vtc'),
    take('post'),
    take('district', 'subdist'),
    [take('state'), address.pincode?.trim()].filter(Boolean).join(' - '),
    take('country'),
  ]
    .filter(Boolean)
    .join('\n')
}
