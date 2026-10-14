import { Link } from 'react-router-dom'
import { BedDouble, Building } from 'lucide-react'
import Logo from '../components/Logo'

const KINDS = [
  {
    value: 'hotel',
    icon: BedDouble,
    title: 'Hotel or stay',
    body: 'Guests check in to a booking and get a room. Rooms, services and requests included.',
  },
  {
    value: 'office',
    icon: Building,
    title: 'Office, workplace or event space',
    body: 'Visitors say who they are and who they are seeing, or which event they are attending. Hosts confirm from the dashboard.',
  },
]

/** The first question in registration: what kind of place is being set up. */
export default function KindChooser({ onChoose }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-[#090d16] px-5 py-10 text-slate-100">
      <div className="w-full max-w-[560px]">
        <Logo className="mb-8 h-7 w-auto text-white" />
        <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-white">What are you setting up?</h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-slate-400">
          This decides what visitors are asked and what your dashboard shows.
        </p>
        <div className="mt-7 grid gap-3">
          {KINDS.map(({ value, icon: Icon, title, body }) => (
            <button
              key={value}
              type="button"
              onClick={() => onChoose(value)}
              className="flex items-start gap-4 rounded-2xl border border-white/[0.1] bg-white/[0.04] p-5 text-left transition-colors hover:border-sky-400/60 hover:bg-white/[0.07]"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-sky-500/15 text-sky-300">
                <Icon size={20} />
              </span>
              <span>
                <span className="block text-[16px] font-bold text-white">{title}</span>
                <span className="mt-1 block text-[13.5px] leading-relaxed text-slate-400">{body}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="mt-6 text-[13.5px] text-slate-500">
          Already registered?{' '}
          <Link to="/" className="font-bold text-sky-400 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
