import { ConfirmedRow, StepHeader } from '../kit'
import { SERVICE } from '../services'

/**
 * What the guest will see, built from what was just entered.
 *
 * Everything on this screen is the property's own data — nothing is invented
 * to fill the mock out. A preview that shows a room number the property never
 * typed is a preview of a different hotel.
 */
export default function PreviewStep({ data }) {
  const room = data.rooms[0]?.number ?? '—'
  const firstName = data.account.name.trim().split(' ')[0] || 'there'
  const { wifiSsid, checkoutTime } = data.essentials

  return (
    <div>
      <StepHeader
        title="See how it looks for guests"
        body="This is the screen a guest gets after scanning your card and checking in."
      />

      {/* The guest's phone, inside the owner's phone. */}
      <div className="mx-auto max-w-[320px] rounded-[28px] border border-onb-line bg-onb-surface p-4">
        <p className="text-[12px] text-onb-muted">{data.property.name || 'Your property'}</p>
        <p className="text-[13px] font-bold text-onb-text">Room {room}</p>

        <p className="mt-4 text-[19px] font-extrabold tracking-[-0.02em] text-onb-text">
          Good afternoon, {firstName}.
        </p>
        <p className="mt-1 text-[13px] text-onb-muted">What can we get you?</p>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {data.services.map((key) => {
            const { label, icon: Icon } = SERVICE[key]
            return (
              <div
                key={key}
                className="flex flex-col items-center gap-2 rounded-2xl bg-onb-raised px-2 py-4 text-center"
              >
                <Icon size={20} strokeWidth={1.9} className="text-onb-green" />
                <span className="text-[12.5px] font-semibold text-onb-text">{label}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-onb-line bg-onb-surface">
        <ConfirmedRow label="Property" value={data.property.name || '—'} />
        <ConfirmedRow label="Rooms" value={`${data.rooms.length} added`} />
        <ConfirmedRow label="Guest services" value={`${data.services.length} switched on`} />
        {wifiSsid && <ConfirmedRow label="Wi-Fi" value={wifiSsid} />}
        {checkoutTime && <ConfirmedRow label="Check-out" value={checkoutTime} />}
      </div>
    </div>
  )
}
