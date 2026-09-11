import { Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './auth/LoginPage'
import RegisterPage from './auth/RegisterPage'
import {
  ForgotPasswordPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from './auth/PasswordResetPage'
import Layout from './dashboard/Layout'
import TodayPage from './dashboard/TodayPage'
import BookingsPage, { BookingDetailPage } from './dashboard/BookingsPage'
import GuestsPage, { GuestDetailPage } from './dashboard/GuestsPage'
import CodePage from './dashboard/CodePage'
import SettingsPage from './dashboard/SettingsPage'
import { useSession } from './session'

/**
 * ChqIn for Business.
 *
 * Signed out: sign in, or set up a new property (registering *is* onboarding).
 * Signed in: today's arrivals, bookings, guests, and the desk code.
 */
export default function App() {
  const { status } = useSession()

  // Until /staff/me answers we don't know, and guessing "signed out" would
  // bounce a signed-in user to the login screen on every refresh.
  if (status === 'checking') {
    return (
      <div className="grid min-h-dvh place-items-center text-[13.5px] font-medium text-slate-400">
        Loading…
      </div>
    )
  }

  const signedIn = status === 'authenticated'

  return (
    <Routes>
      <Route path="/" element={signedIn ? <Navigate to="/app" replace /> : <LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Reachable signed in or out: a reset link is opened from an inbox,
          which may well be on a device that is still signed in as someone. */}
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />

      <Route path="/app" element={signedIn ? <Layout /> : <Navigate to="/" replace />}>
        <Route index element={<TodayPage />} />
        <Route path="bookings" element={<BookingsPage />} />
        <Route path="bookings/:id" element={<BookingDetailPage />} />
        <Route path="guests" element={<GuestsPage />} />
        <Route path="guests/:id" element={<GuestDetailPage />} />
        <Route path="code" element={<CodePage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
