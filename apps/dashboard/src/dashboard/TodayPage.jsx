import { Link } from 'react-router-dom'
import { CalendarCheck } from 'lucide-react'
import { EmptyState, PageHeader, StatTile, StatusPill, TableWrap, Td, Th } from '../components/ui'
import { JOURNEY, STATUS, today, venue } from '../data/mock'

const time = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

/**
 * The screen a front desk leaves open. Summary first, then the one list that
 * answers "who is still coming?" — arrivals sorted so the unfinished ones are
 * at the top, because those are the only rows anyone acts on.
 */
export default function TodayPage() {
  const { arrivals, checkedIn, awaiting, inHouse } = today()

  const rows = [...arrivals].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'confirmed' ? -1 : 1
    return (b.checkedInAt ?? '').localeCompare(a.checkedInAt ?? '')
  })

  return (
    <div>
      <PageHeader
        title="Today"
        subtitle={new Date().toLocaleDateString([], {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
      />

      <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Arrivals" value={arrivals.length} sub="expected today" />
        <StatTile
          label="Checked in"
          value={checkedIn.length}
          sub={`${Math.round((checkedIn.length / Math.max(arrivals.length, 1)) * 100)}% of arrivals`}
          tone="good"
        />
        <StatTile
          label="Still to arrive"
          value={awaiting.length}
          sub={awaiting.length ? 'no action needed' : 'all in'}
          tone={awaiting.length ? 'warn' : 'neutral'}
        />
        <StatTile label="In house" value={inHouse.length} sub={`of ${venue.rooms} rooms`} />
      </div>

      <h2 className="mb-3 text-[15px] font-bold tracking-[-0.02em] text-slate-900">
        Arrivals
      </h2>

      {rows.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="Nobody due today"
          body="Arrivals appear here as soon as reservations land for the date."
        />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Guest</Th>
              <Th>Room</Th>
              <Th>Reference</Th>
              <Th>Status</Th>
              <Th className="text-right">Checked in</Th>
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
                  {booking.journey && (
                    <span className="ml-2 text-[12px] text-slate-400">
                      {JOURNEY[booking.journey].label}
                    </span>
                  )}
                </Td>
                <Td className="tabular-nums font-semibold text-slate-700">{booking.room}</Td>
                <Td className="tabular-nums">{booking.reference}</Td>
                <Td>
                  <StatusPill tone={STATUS[booking.status].tone}>
                    {STATUS[booking.status].label}
                  </StatusPill>
                </Td>
                <Td className="text-right tabular-nums">
                  {booking.checkedInAt ? time(booking.checkedInAt) : '—'}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </div>
  )
}
