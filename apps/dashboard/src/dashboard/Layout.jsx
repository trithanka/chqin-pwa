import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarCheck,
  Clock,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  MapPin,
  QrCode,
  Radio,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'
import { useSession } from '../session'
import Logo from '../components/Logo'

const NAV = [
  {
    heading: 'Front Desk',
    items: [
      { to: '/app', end: true, label: 'Today', icon: LayoutDashboard },
      { to: '/app/bookings', label: 'Bookings', icon: CalendarCheck },
      { to: '/app/guests', label: 'Guests', icon: Users },
    ],
  },
  {
    heading: 'Property & Concierge',
    items: [
      { to: '/app/code', label: 'Check-in QR Code', icon: QrCode },
      { to: '/app/settings', label: 'Settings', icon: Settings },
    ],
  },
]

const initial = (text, fallback) => (text?.trim()?.[0] ?? fallback).toUpperCase()

function getBreadcrumbs(pathname, venueName) {
  const parts = pathname.split('/').filter(Boolean)
  const items = [
    { label: venueName || 'Front Desk', to: '/app' },
  ]

  if (parts.length <= 1) {
    items.push({ label: 'Today' })
  } else if (parts[1] === 'bookings') {
    if (parts.length === 2) {
      items.push({ label: 'Bookings' })
    } else {
      items.push({ label: 'Bookings', to: '/app/bookings' })
      items.push({ label: 'Reservation Details' })
    }
  } else if (parts[1] === 'guests') {
    if (parts.length === 2) {
      items.push({ label: 'Guests' })
    } else {
      items.push({ label: 'Guests', to: '/app/guests' })
      items.push({ label: 'Guest Profile' })
    }
  } else if (parts[1] === 'code') {
    items.push({ label: 'Check-in QR Code' })
  } else if (parts[1] === 'settings') {
    items.push({ label: 'Settings' })
  } else {
    items.push({ label: parts[1] })
  }

  return items
}

export default function Layout() {
  const { user, signOut } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const venue = user?.venue

  // Real-time desk clock
  const [timeStr, setTimeStr] = useState(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  )

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeStr(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    }, 10000)
    return () => clearInterval(timer)
  }, [])

  const breadcrumbs = getBreadcrumbs(location.pathname, venue?.name)

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row bg-[#f8fafc]">
      {/* Sidebar Rail */}
      <aside className="print-hide relative flex shrink-0 flex-col overflow-hidden border-b border-white/[0.08] bg-[#090d16] px-3.5 py-4 lg:sticky lg:top-0 lg:h-dvh lg:w-[264px] lg:border-b-0 lg:border-r lg:py-5 lg:px-4 z-30">
        {/* Soft atmospheric gradient glow behind logo */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 -left-16 size-64 rounded-full bg-gradient-to-br from-sky-500/15 via-blue-600/10 to-transparent blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 right-0 size-48 rounded-full bg-indigo-600/5 blur-3xl"
        />

        {/* Brand Header */}
        <div className="relative flex items-center justify-between px-2 lg:mb-5">
          <div className="flex items-center gap-2.5">
            <Logo className="h-6 w-auto text-white" />
            <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-300">
              Business
            </span>
          </div>
        </div>

        {/* Property Badge */}
        <div className="relative mb-5 hidden items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] p-3 shadow-inner backdrop-blur-md lg:flex">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-600 text-[15px] font-extrabold text-white shadow-md ring-1 ring-white/20">
            {initial(venue?.name, 'P')}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="flex items-center justify-between gap-1">
              <p className="truncate text-[13.5px] font-bold text-white tracking-tight" title={venue?.name}>
                {venue?.name ?? 'Your property'}
              </p>
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="relative flex size-1.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
              </span>
              <span className="truncate text-[11px] font-medium text-emerald-400/90">
                Live Desk Active
              </span>
            </div>
          </div>
        </div>

        {/* Navigation items */}
        <nav className="relative mt-2 flex gap-1.5 overflow-x-auto pb-1 lg:pb-0 lg:mt-0 lg:flex-col lg:gap-5 lg:overflow-visible no-scrollbar">
          {NAV.map(({ heading, items }) => (
            <div key={heading} className="flex gap-1 lg:flex-col lg:gap-1">
              <p className="mb-1.5 hidden px-3 text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-400/60 lg:block">
                {heading}
              </p>
              {items.map(({ to, end, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `group relative flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13.5px] font-semibold transition-all duration-150 ${
                      isActive
                        ? 'bg-white/[0.09] text-white shadow-sm ring-1 ring-white/10'
                        : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span className="absolute inset-y-2 left-0 hidden w-[3.5px] rounded-r-full bg-gradient-to-b from-sky-400 to-blue-500 shadow-sm shadow-sky-400/50 lg:block" />
                      )}
                      <Icon
                        size={17}
                        strokeWidth={isActive ? 2.3 : 1.9}
                        className={`transition-colors duration-150 ${
                          isActive ? 'text-sky-400' : 'text-slate-400 group-hover:text-slate-200'
                        }`}
                      />
                      <span className="truncate">{label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* User Footer / Sign Out */}
        <div className="relative mt-auto hidden border-t border-white/[0.08] pt-3.5 lg:block">
          <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.02] p-2 ring-1 ring-white/[0.05]">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-tr from-slate-700 to-slate-600 text-[12px] font-bold text-white shadow-xs ring-1 ring-white/10">
              {initial(user?.name, 'U')}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-bold text-slate-200">{user?.name}</p>
              <p className="truncate text-[11px] font-medium capitalize text-slate-400">{user?.role || 'Staff'}</p>
            </div>
            <button
              type="button"
              aria-label="Sign out"
              title="Sign out"
              onClick={async () => {
                await signOut()
                navigate('/')
              }}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-red-400"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top Reception Bar with Live Breadcrumbs & Back Navigation */}
        <header className="print-hide sticky top-0 z-20 hidden border-b border-slate-200/80 bg-white/85 px-6 py-2.5 backdrop-blur-md sm:flex sm:items-center sm:justify-between shadow-2xs">
          {/* Breadcrumbs Navigation & Back Trigger */}
          <div className="flex items-center gap-2.5 text-[13px]">
            {location.pathname !== '/app' && (
              <button
                type="button"
                onClick={() => navigate(-1)}
                aria-label="Back to previous page"
                title="Go back"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200/90 bg-white px-2.5 py-1 text-[12px] font-bold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 transition-all cursor-pointer"
              >
                <ArrowLeft size={13} className="text-slate-500" />
                <span>Back</span>
              </button>
            )}

            <div className="flex items-center gap-1.5 text-slate-500 font-medium">
              <Radio size={13} className="text-emerald-500 animate-pulse shrink-0" />
            </div>

            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px]">
              {breadcrumbs.map((crumb, idx) => {
                const isLast = idx === breadcrumbs.length - 1
                return (
                  <div key={crumb.label} className="flex items-center gap-1.5 min-w-0">
                    {idx > 0 && (
                      <span className="text-slate-300 font-normal select-none">/</span>
                    )}
                    {crumb.to && !isLast ? (
                      <NavLink
                        to={crumb.to}
                        className="font-medium text-slate-500 hover:text-slate-900 transition-colors truncate max-w-[180px]"
                      >
                        {crumb.label}
                      </NavLink>
                    ) : (
                      <span
                        className={`truncate max-w-[220px] ${
                          isLast ? 'font-bold text-slate-900' : 'font-medium text-slate-500'
                        }`}
                      >
                        {crumb.label}
                      </span>
                    )}
                  </div>
                )
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-600 bg-slate-100/90 px-2.5 py-1 rounded-lg border border-slate-200/50">
              <Clock size={13} className="text-slate-400" />
              <span className="tabular-nums">{timeStr}</span>
            </div>

            <NavLink
              to="/app/code"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-2.5 py-1 text-[12px] font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition-all"
            >
              <QrCode size={13} className="text-brand" />
              <span>Desk QR</span>
            </NavLink>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden px-4 py-6 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-[1120px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

