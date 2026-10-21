import { NavLink, Outlet } from 'react-router-dom'
import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  DoorOpen,
  Fingerprint,
  GitBranch,
  LayoutDashboard,
  ListChecks,
  LogOut,
  ScrollText,
  Server,
  ShieldCheck,
  UserCog,
  Users,
} from 'lucide-react'
import { API_BASE, api } from './api'
import { isOwner, signOut, useSession } from './session'
import { useApi } from './useApi'

export const NAV = [
  ['Platform', [
    ['/', 'Overview', LayoutDashboard],
    ['/venues', 'Venues', Building2],
    ['/gates', 'Gates', DoorOpen],
    ['/flows', 'Flows', GitBranch],
  ]],
  ['People', [
    ['/staff', 'Staff accounts', UserCog],
    ['/guests', 'Guests', Fingerprint],
  ]],
  ['Activity', [
    ['/entries', 'Entries', ListChecks],
    ['/sessions', 'Sessions', Activity],
    ['/outbox', 'Outbox', Bell],
    ['/reports', 'Reports', BarChart3],
  ]],
  ['Security', [
    ['/auth-events', 'Auth events', ShieldCheck],
    ['/audit', 'Admin audit log', ScrollText],
    ['/admins', 'Admin users', Users, 'owner'],
    ['/ops', 'Operations', Server],
  ]],
]

/**
 * The persistent environment banner. Which database this panel is changing is
 * the first thing to know and the easiest to be wrong about, so it is never
 * off screen, and a hosted database turns it red.
 */
export function EnvBanner() {
  const { data } = useApi(() => api.get('/health'))
  const db = data?.database
  const prod = db?.remote
  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 text-[12px] font-semibold ${prod ? 'bg-red-700 text-white' : 'bg-accent text-stone-950'}`}
    >
      <span className="tracking-[0.2em]">ADMIN</span>
      <span>{prod ? 'PRODUCTION DATABASE' : 'Local database'}</span>
      <span className="font-mono font-normal opacity-90">db {db?.host ?? '…'}</span>
      <span className="font-mono font-normal opacity-90">api {API_BASE}</span>
      {data?.environment?.simulateAadhaar && prod && <span className="rounded bg-white px-1.5 text-red-700">AADHAAR SIMULATED ON A REMOTE DATABASE</span>}
    </div>
  )
}

export default function Layout() {
  const { admin } = useSession()
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="sticky top-0 z-40">
        <EnvBanner />
      </div>
      <div className="flex flex-1">
        <aside className="sticky top-[30px] hidden h-[calc(100dvh-30px)] w-56 shrink-0 flex-col overflow-y-auto border-r border-line bg-surface md:flex">
          <div className="px-4 py-4">
            <p className="text-[15px] font-bold text-white">
              ChqIn <span className="text-accent">Admin</span>
            </p>
            <p className="text-[11.5px] text-stone-500">Internal. Not the venue dashboard.</p>
          </div>
          <nav className="flex-1 space-y-4 px-2 pb-4">
            {NAV.map(([group, items]) => (
              <div key={group}>
                <p className="px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-stone-600">{group}</p>
                {items
                  .filter(([, , , role]) => !role || (role === 'owner' && isOwner(admin)))
                  .map(([to, label, Icon]) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={to === '/'}
                      className={({ isActive }) =>
                        `flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] ${isActive ? 'bg-accent-soft text-amber-300' : 'text-stone-400 hover:bg-raised hover:text-stone-100'}`
                      }
                    >
                      <Icon size={15} /> {label}
                    </NavLink>
                  ))}
              </div>
            ))}
          </nav>
          <div className="border-t border-line p-3 text-[12px]">
            <p className="truncate text-stone-200">
              {admin?.name} · <span className="text-amber-300">{admin?.role}</span>
            </p>
            <p className="break-all text-stone-500" title={admin?.email}>
              {admin?.email}
            </p>
            <button onClick={signOut} className="mt-2 flex items-center gap-1.5 text-stone-400 hover:text-white">
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-4 md:p-6">
          <MobileNav />
          <Outlet />
        </main>
      </div>
    </div>
  )
}

/** Below md the sidebar is hidden; a scrolling strip keeps every screen reachable. */
function MobileNav() {
  const { admin } = useSession()
  return (
    <nav className="-mx-4 mb-4 flex gap-1 overflow-x-auto px-4 pb-2 md:hidden">
      {NAV.flatMap(([, items]) => items)
        .filter(([, , , role]) => !role || isOwner(admin))
        .map(([to, label]) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `shrink-0 rounded-md px-2.5 py-1 text-[12px] ${isActive ? 'bg-accent-soft text-amber-300' : 'bg-surface text-stone-400'}`}
          >
            {label}
          </NavLink>
        ))}
      <button onClick={signOut} className="shrink-0 rounded-md bg-surface px-2.5 py-1 text-[12px] text-stone-400">
        Sign out
      </button>
    </nav>
  )
}
