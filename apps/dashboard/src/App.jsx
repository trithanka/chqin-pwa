import { Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './auth/LoginPage'
import RegisterPage from './auth/RegisterPage'
import Layout from './dashboard/Layout'
import TodayPage from './dashboard/TodayPage'
import BookingsPage, { BookingDetailPage } from './dashboard/BookingsPage'
import GuestsPage, { GuestDetailPage } from './dashboard/GuestsPage'
import CodePage from './dashboard/CodePage'
import { useSession } from './session'

/**
 * ChqIn for Business.
 *
 * Signed out: sign in, or set up a new property (registering *is* onboarding).
 * Signed in: today's arrivals, bookings, guests, and the desk code.
 */
export default function App() {
  const { session } = useSession()

  return (
    <Routes>
      <Route path="/" element={session ? <Navigate to="/app" replace /> : <LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route path="/app" element={session ? <Layout /> : <Navigate to="/" replace />}>
        <Route index element={<TodayPage />} />
        <Route path="bookings" element={<BookingsPage />} />
        <Route path="bookings/:id" element={<BookingDetailPage />} />
        <Route path="guests" element={<GuestsPage />} />
        <Route path="guests/:id" element={<GuestDetailPage />} />
        <Route path="code" element={<CodePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
