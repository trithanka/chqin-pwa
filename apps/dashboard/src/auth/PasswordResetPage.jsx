import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, CheckCircle2, MailCheck } from 'lucide-react'
import { Button, Field, Input } from '../components/ui'
import PasswordField from '../components/PasswordField'
import { AuthShell } from './LoginPage'
import { api } from '../api'

/**
 * The way back into an account, in two screens.
 *
 * Before this existed, an owner who forgot their password was locked out with
 * no path back — nothing in the system knew their email address, let alone had
 * a way to mail them.
 */

/** Screen one: ask for the address. */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  const submit = async (e) => {
    e?.preventDefault()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      return setError('Enter the email you signed up with.')
    }

    setBusy(true)
    setError(null)
    try {
      await api.post('/staff/password/forgot', { email: email.trim() })
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // Deliberately says "if there is an account" rather than confirming one.
  // The API answers the same either way for the same reason sign-in gives one
  // message for a wrong email and a wrong password.
  if (sent) {
    return (
      <AuthShell
        title="Check your email"
        sub={`If ${email.trim()} has an account, a link to choose a new password is on its way. It works once and expires in an hour.`}
        footer={
          <Link to="/" className="font-semibold text-brand hover:underline">
            Back to sign in
          </Link>
        }
      >
        <div className="flex items-center gap-3 rounded-lg bg-emerald-50 px-4 py-3.5 text-[13.5px] font-medium text-emerald-800">
          <MailCheck className="h-5 w-5 shrink-0" aria-hidden />
          <p>Nothing in your inbox after a few minutes? Check spam, then try again.</p>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Forgot your password?"
      sub="We'll email you a link to set a new one."
      footer={
        <Link to="/" className="font-semibold text-brand hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={submit}>
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2.5 text-[13px] font-medium text-red-700">
            {error}
          </p>
        )}

        <Field label="Work email" error={error}>
          <Input
            type="email"
            value={email}
            invalid={!!error}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="priya@hotelaurora.com"
            autoComplete="email"
          />
        </Field>

        <Button type="submit" loading={busy} iconRight={ArrowRight}>
          Send the link
        </Button>
      </form>
    </AuthShell>
  )
}

/** Screen two: the link's landing page. */
export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const navigate = useNavigate()

  const submit = async (e) => {
    e?.preventDefault()

    const next = {}
    // Same floor the API enforces; saying it here saves a round trip.
    if (password.length < 10) next.password = 'Use at least 10 characters.'
    if (confirm !== password) next.confirm = "Those don't match."
    setErrors(next)
    if (Object.keys(next).length) return

    setBusy(true)
    try {
      await api.post('/staff/password/reset', { token, password })
      setDone(true)
    } catch (err) {
      setErrors({ form: err.message })
    } finally {
      setBusy(false)
    }
  }

  if (!token) {
    return (
      <AuthShell
        title="That link is incomplete"
        sub="Open the link straight from the email, or ask for a new one."
        footer={
          <Link to="/forgot-password" className="font-semibold text-brand hover:underline">
            Send a new link
          </Link>
        }
      />
    )
  }

  if (done) {
    return (
      <AuthShell
        title="Password changed"
        // Worth saying plainly: the reset signs out every other device, which
        // is the point when the reason for it was someone else having access.
        sub="You've been signed out everywhere else. Sign in with your new password."
        footer={
          <Link to="/" className="font-semibold text-brand hover:underline">
            Go to sign in
          </Link>
        }
      >
        <Button onClick={() => navigate('/')} iconRight={ArrowRight}>
          Sign in
        </Button>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Choose a new password" sub="Then sign in with it.">
      <form className="flex flex-col gap-4" onSubmit={submit}>
        {errors.form && (
          <p className="rounded-lg bg-red-50 px-3 py-2.5 text-[13px] font-medium text-red-700">
            {errors.form}
          </p>
        )}

        <PasswordField
          label="New password"
          value={password}
          onChange={setPassword}
          error={errors.password}
          hint="At least 10 characters."
          meter
        />

        <PasswordField
          label="Confirm password"
          value={confirm}
          onChange={setConfirm}
          error={errors.confirm}
        />

        <Button type="submit" loading={busy} iconRight={ArrowRight}>
          Save and sign out everywhere
        </Button>
      </form>
    </AuthShell>
  )
}

/**
 * The address-confirmation link. Nothing is gated on it yet — this only
 * records that the address is real.
 */
export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const [state, setState] = useState('working')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setState('failed')
      setMessage('Open the link straight from the email.')
      return
    }

    api
      .post('/staff/email/verify', { token })
      .then(() => setState('done'))
      .catch((err) => {
        setState('failed')
        setMessage(err.message)
      })
  }, [token])

  return (
    <AuthShell
      title={
        state === 'working' ? 'Confirming…' : state === 'done' ? 'Email confirmed' : "That didn't work"
      }
      sub={
        state === 'done'
          ? 'Thanks — we can reach you about your property now.'
          : state === 'failed'
            ? message
            : undefined
      }
      footer={
        <Link to="/" className="font-semibold text-brand hover:underline">
          Back to sign in
        </Link>
      }
    >
      {state === 'done' && (
        <div className="flex items-center gap-3 rounded-lg bg-emerald-50 px-4 py-3.5 text-[13.5px] font-medium text-emerald-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />
          <p>Nothing else to do here.</p>
        </div>
      )}
    </AuthShell>
  )
}
