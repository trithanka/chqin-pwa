import { useState } from 'react'
import { Plus, Trash2, Users } from 'lucide-react'
import { Button, EmptyState, Field, Input, Panel, Pill, Select } from '../components/ui'
import StepHeader from '../components/StepHeader'

const ROLES = {
  manager: 'Manager',
  frontdesk: 'Front desk',
}

export default function TeamStep({ data, patch }) {
  const [invite, setInvite] = useState({ email: '', role: 'frontdesk' })
  const [error, setError] = useState(null)

  const add = () => {
    const email = invite.email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError('That does not look like an email address.')
      return
    }
    if (email === data.account.email.trim().toLowerCase()) {
      setError("That's your own address — you already have access.")
      return
    }
    if (data.team.some((m) => m.email === email)) {
      setError('Already invited.')
      return
    }
    setError(null)
    patch('team', [...data.team, { email, role: invite.role }])
    setInvite({ ...invite, email: '' })
  }

  const remove = (email) => patch('team', data.team.filter((m) => m.email !== email))

  return (
    <div>
      <StepHeader
        eyebrow="Step 4"
        title="Invite your team"
        body="Front desk staff need access to see arrivals and help a guest who gets stuck. You can skip this and do it later."
      />

      <Panel className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Email address" className="flex-1" error={error}>
            <Input
              type="email"
              value={invite.email}
              invalid={!!error}
              onChange={(e) => setInvite({ ...invite, email: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="frontdesk@hotelaurora.com"
            />
          </Field>
          <Field label="Role" className="sm:w-48">
            <Select
              value={invite.role}
              onChange={(e) => setInvite({ ...invite, role: e.target.value })}
            >
              <option value="frontdesk">Front desk</option>
              <option value="manager">Manager</option>
            </Select>
          </Field>
          <Button tone="secondary" icon={Plus} onClick={add}>
            Invite
          </Button>
        </div>

        <p className="mt-3 text-[12.5px] leading-relaxed text-slate-500">
          Invitations go out when you finish setup. Managers can change property
          settings and invite others; front desk can run and override check-ins.
        </p>
      </Panel>

      <div className="mt-6">
        <h2 className="mb-3 text-[15px] font-bold tracking-[-0.02em] text-slate-900">
          Access
        </h2>

        <Panel className="divide-y divide-slate-100 overflow-hidden">
          {/* The owner is on the list, not a special case above it. */}
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-[12px] font-bold text-brand">
              {(data.account.name.trim()[0] ?? 'Y').toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold text-slate-900">
                {data.account.name.trim() || 'You'}
              </p>
              <p className="truncate text-[12.5px] text-slate-500">
                {data.account.email || 'your work email'}
              </p>
            </div>
            <Pill tone="good">Owner</Pill>
          </div>

          {data.team.map((member) => (
            <div key={member.email} className="flex items-center gap-3 px-4 py-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-100 text-[12px] font-bold text-slate-500">
                {member.email[0].toUpperCase()}
              </span>
              <p className="min-w-0 flex-1 truncate text-[14px] text-slate-700">{member.email}</p>
              <Pill>{ROLES[member.role]}</Pill>
              <Button
                tone="danger"
                size="icon"
                icon={Trash2}
                onClick={() => remove(member.email)}
                aria-label={`Remove ${member.email}`}
              />
            </div>
          ))}
        </Panel>

        {data.team.length === 0 && (
          <div className="mt-3">
            <EmptyState
              icon={Users}
              title="Just you for now"
              body="That's fine — a small property often runs on one account. Invite people whenever you need to."
            />
          </div>
        )}
      </div>
    </div>
  )
}
