import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { CalendarCheck, LayoutDashboard, LogOut, QrCode, Users } from 'lucide-react'
import { useSession } from '../session'
import Logo from '../components/Logo'

const NAV = [
  { to: '/app', end: true, label: 'Today', icon: LayoutDashboard },
  { to: '/app/bookings', label: 'Bookings', icon: CalendarCheck },
  { to: '/app/guests', label: 'Guests', icon: Users },
  { to: '/app/code', label: 'Check-in code', icon: QrCode },
]

export default function Layout() {
  const { user, signOut } = useSession()
  const navigate = useNavigate()

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="print-hide flex shrink-0 flex-col bg-rail px-4 py-5 lg:w-[248px] lg:px-4 lg:py-6">
        <div className="mb-6 flex items-center gap-2.5 px-2 text-white">
          <Logo className="h-6.5 w-auto shrink-0 text-white" />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[14px] font-bold tracking-[-0.02em]">
              {user?.venue?.name ?? 'Your property'}
            </p>
            <p className="truncate text-[11.5px] font-medium text-white/45">
              {user?.venue?.location ?? ''}
            </p>
          </div>
        </div>

        {/* Horizontal on narrow screens, a rail on wide ones */}
        <nav className="flex gap-1 overflow-x-auto lg:flex-col">
          {NAV.map(({ to, end, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition-colors ${
                  isActive ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/5 hover:text-white/80'
                }`
              }
            >
              <Icon size={16} strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto hidden lg:block">
          <div className="flex items-center gap-2.5 rounded-lg px-3 py-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/10 text-[11px] font-bold text-white/70">
              {(user?.name ?? 'P')[0].toUpperCase()}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[12.5px] font-semibold text-white/80">{user?.name}</p>
              <p className="truncate text-[11px] capitalize text-white/35">{user?.role}</p>
            </div>
            <button
              type="button"
              aria-label="Sign out"
              onClick={async () => {
                await signOut()
                navigate('/')
              }}
              className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden px-5 py-7 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-[1100px]">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
