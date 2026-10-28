import { Navigate, Route, Routes } from 'react-router-dom'
import { LoaderCircle } from 'lucide-react'
import Layout from './Layout'
import { isOwner, useSession } from './session'
import { AcceptPage, SignInPage } from './pages/SignIn'
import Overview from './pages/Overview'
import Venues, { VenueDetail } from './pages/Venues'
import Gates from './pages/Gates'
import Flows, { FlowDetail, PublishFlow, Simulator, StepLibrary } from './pages/Flows'
import { Admins, AuditLog, AuthEvents, Outbox, WhatsApp } from './pages/Logs'
import { Operations, Reports } from './pages/Ops'
import { EntryDetail, EntryList, GuestDetail, GuestList, SessionDetail, SessionList, StaffDetail, StaffList } from './pages/People'

/**
 * ChqIn Admin. Signed out (or half signed in, awaiting the code): the sign-in
 * screens. Signed in: the platform.
 */
export default function App() {
  const { status, admin } = useSession()

  if (status === 'checking') {
    return (
      <div className="grid min-h-dvh place-items-center text-stone-500">
        <LoaderCircle className="animate-spin" />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/accept" element={<AcceptPage />} />
      {status !== 'ready' ? (
        <Route path="*" element={<SignInPage />} />
      ) : (
        <Route element={<Layout />}>
          <Route index element={<Overview />} />
          <Route path="venues" element={<Venues />} />
          <Route path="venues/:id" element={<VenueDetail />} />
          <Route path="gates" element={<Gates />} />
          <Route path="flows" element={<Flows />} />
          <Route path="flows/steps" element={<StepLibrary />} />
          <Route path="flows/simulate" element={<Simulator />} />
          <Route path="flows/publish" element={<PublishFlow />} />
          <Route path="flows/:id" element={<FlowDetail />} />
          <Route path="staff" element={<StaffList />} />
          <Route path="staff/:id" element={<StaffDetail />} />
          <Route path="guests" element={<GuestList />} />
          <Route path="guests/:id" element={<GuestDetail />} />
          <Route path="entries" element={<EntryList />} />
          <Route path="entries/:id" element={<EntryDetail />} />
          <Route path="sessions" element={<SessionList />} />
          <Route path="sessions/:id" element={<SessionDetail />} />
          <Route path="outbox" element={<Outbox />} />
          <Route path="whatsapp" element={<WhatsApp />} />
          <Route path="auth-events" element={<AuthEvents />} />
          <Route path="audit" element={<AuditLog />} />
          {isOwner(admin) && <Route path="admins" element={<Admins />} />}
          <Route path="reports" element={<Reports />} />
          <Route path="ops" element={<Operations />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      )}
    </Routes>
  )
}
