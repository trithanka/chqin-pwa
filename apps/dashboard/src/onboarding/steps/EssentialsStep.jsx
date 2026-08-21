import { useCallback, useState } from 'react'
import { QrCode } from 'lucide-react'
import { Button, Card, Field, Input, StepHeader } from '../kit'
import WifiScanner from '../WifiScanner'

/**
 * The four things every guest asks the desk. Answered once here, and shown in
 * the room screen instead of being asked.
 *
 * All optional: a property that leaves wifi blank simply doesn't show it.
 */
export default function EssentialsStep({ data, patch }) {
  const [scanning, setScanning] = useState(false)
  const set = (key, value) => patch('essentials', { ...data.essentials, [key]: value })

  // Both fields at once, which is the only part of this a scan can do better
  // than typing: the network name alone was never the slow half.
  const applyWifi = useCallback(
    ({ ssid, password }) => {
      patch('essentials', { ...data.essentials, wifiSsid: ssid, wifiPassword: password })
      setScanning(false)
    },
    [data.essentials, patch],
  )

  return (
    <div>
      <StepHeader
        title="Good to know"
        body="Shown to the guest after check-in, so nobody has to call the desk for the wifi password."
      />

      <Card className="flex flex-col gap-5 p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-onb-green">Wi-Fi</p>

        <Field label="Network">
          <Input
            value={data.essentials.wifiSsid}
            onChange={(e) => set('wifiSsid', e.target.value)}
            autoCapitalize="none"
            spellCheck={false}
          />
        </Field>

        <Field label="Password" hint="Leave blank if the network is open.">
          <Input
            value={data.essentials.wifiPassword}
            onChange={(e) => set('wifiPassword', e.target.value)}
            autoCapitalize="none"
            spellCheck={false}
          />
        </Field>

        <Button tone="secondary" icon={QrCode} onClick={() => setScanning(true)} className="w-full">
          Scan Wi-Fi QR
        </Button>
        <p className="-mt-3 text-[12.5px] leading-relaxed text-onb-muted">
          Fills both from the QR on your router, or from another phone's
          "Share Wi-Fi" code.
        </p>
      </Card>

      {scanning && <WifiScanner onFound={applyWifi} onClose={() => setScanning(false)} />}

      <Card className="mt-3 flex flex-col gap-5 p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-onb-green">
          Times
        </p>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Breakfast from">
            {/* The platform's own time picker: a phone already has a good one,
                and it handles 12/24-hour locales we would otherwise re-solve. */}
            <Input
              type="time"
              value={data.essentials.breakfastFrom}
              onChange={(e) => set('breakfastFrom', e.target.value)}
            />
          </Field>
          <Field label="Breakfast to">
            <Input
              type="time"
              value={data.essentials.breakfastTo}
              onChange={(e) => set('breakfastTo', e.target.value)}
            />
          </Field>
        </div>

        <Field label="Check-out time">
          <Input
            type="time"
            value={data.essentials.checkoutTime}
            onChange={(e) => set('checkoutTime', e.target.value)}
          />
        </Field>
      </Card>

      <Card className="mt-3 p-4">
        <Field
          label="Anything else"
          hint="Pool hours, parking, pets — whatever guests ask about most."
        >
          <textarea
            rows={3}
            value={data.essentials.notes}
            onChange={(e) => set('notes', e.target.value)}
            className="w-full rounded-xl border border-onb-line bg-onb-raised px-4 py-3 text-[16px] leading-relaxed text-onb-text placeholder:text-onb-muted/60 focus:border-onb-green focus:outline-none"
          />
        </Field>
      </Card>
    </div>
  )
}
