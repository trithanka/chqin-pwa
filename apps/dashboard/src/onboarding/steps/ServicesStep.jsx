import { GUEST_SERVICES } from '@chqin/shared'
import { Card, CheckRow, StepHeader } from '../kit'
import { SERVICE } from '../services'

/**
 * What a guest can ask for from their room.
 *
 * The first five are on by default because almost every property offers them,
 * and a screen that starts fully unticked makes the common case the most work.
 */
export default function ServicesStep({ data, patch, errors }) {
  const toggle = (key, on) =>
    patch('services', on ? [...data.services, key] : data.services.filter((s) => s !== key))

  return (
    <div>
      <StepHeader
        title="What can your guests ask for?"
        body="Each one becomes a button in the guest's room screen. Turn any of them off later from settings."
      />

      {errors.services && (
        <p className="mb-3 text-[13px] font-medium text-red-400">{errors.services}</p>
      )}

      <Card className="divide-y divide-onb-line overflow-hidden">
        {GUEST_SERVICES.map((key) => (
          <CheckRow
            key={key}
            icon={SERVICE[key].icon}
            label={SERVICE[key].label}
            sub={SERVICE[key].sub}
            checked={data.services.includes(key)}
            onChange={(on) => toggle(key, on)}
          />
        ))}
      </Card>

      <p className="mt-4 text-[13px] leading-relaxed text-onb-muted">
        You'll say where each of these should go on the next-but-one screen.
      </p>
    </div>
  )
}
