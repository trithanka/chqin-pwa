import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { API_BASE, api } from '../api'
import { confirmCode, signIn, signOut, useSession } from '../session'
import { Button, Field, Input, Panel } from '../ui'

function Shell({ title, subtitle, children }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="bg-accent px-4 py-1.5 text-[12px] font-semibold tracking-[0.2em] text-stone-950">
        ADMIN <span className="ml-3 font-mono font-normal tracking-normal">api {API_BASE}</span>
      </div>
      <div className="grid flex-1 place-items-center p-4">
        <Panel className="w-full max-w-sm p-6">
          <p className="text-[18px] font-bold text-white">
            ChqIn <span className="text-accent">Admin</span>
          </p>
          <p className="mb-5 mt-1 text-[13px] text-stone-400">{subtitle ?? title}</p>
          {children}
        </Panel>
      </div>
    </div>
  )
}

function useForm(run) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setProblem(null)
    try {
      await run()
    } catch (err) {
      setProblem(err.message)
    } finally {
      setBusy(false)
    }
  }
  return { busy, problem, submit }
}

/** Password, then the code. Two screens because the API issues two kinds of session. */
export function SignInPage() {
  const { status } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const first = useForm(() => signIn(email, password))
  const second = useForm(() => confirmCode(code))

  if (status === 'totp') {
    return (
      <Shell subtitle="Enter the six-digit code from your authenticator app.">
        <form onSubmit={second.submit} className="space-y-4">
          <Field label="Code">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              className="text-center font-mono text-[18px] tracking-[0.4em]"
            />
          </Field>
          {second.problem && <p className="text-[13px] text-red-300">{second.problem}</p>}
          <Button type="submit" tone="primary" className="w-full" loading={second.busy} disabled={code.length !== 6}>
            Verify
          </Button>
          <button type="button" onClick={signOut} className="w-full text-[12px] text-stone-500 hover:text-stone-300">
            Start again
          </button>
        </form>
      </Shell>
    )
  }

  return (
    <Shell subtitle="For the ChqIn team. Venue staff sign in at the business dashboard.">
      <form onSubmit={first.submit} className="space-y-4">
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus />
        </Field>
        <Field label="Password">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        {first.problem && <p className="text-[13px] text-red-300">{first.problem}</p>}
        <Button type="submit" tone="primary" className="w-full" loading={first.busy} disabled={!email || !password}>
          Continue
        </Button>
      </form>
    </Shell>
  )
}

/** An invite, or a 2FA reset: scan the secret, prove it works, and (for an invite) choose a password. */
export function AcceptPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [info, setInfo] = useState(null)
  const [failure, setFailure] = useState(null)
  const [qr, setQr] = useState(null)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    api
      .get('/auth/link', { token })
      .then((data) => {
        setInfo(data)
        return QRCode.toDataURL(data.otpauth, { margin: 1, width: 200 })
      })
      .then(setQr)
      .catch((err) => setFailure(err.message))
  }, [token])

  const form = useForm(async () => {
    await api.post('/auth/accept', { token, password: password || undefined, code })
    setDone(true)
  })

  if (failure) return <Shell subtitle={failure} />
  if (!info) return <Shell subtitle="Checking the link…" />
  if (done)
    return (
      <Shell subtitle="All set. Sign in with your email, password and a code from the app.">
        <a href="/" className="text-[13px] text-amber-300 hover:underline">
          Go to sign in
        </a>
      </Shell>
    )

  return (
    <Shell subtitle={`${info.name} (${info.email}) — ${info.needsPassword ? 'set up your admin account' : 'set up two-factor again'}.`}>
      <form onSubmit={form.submit} className="space-y-4">
        <div className="rounded-md bg-white p-2">{qr && <img src={qr} alt="Authenticator QR code" className="mx-auto" />}</div>
        <p className="break-all text-center font-mono text-[11.5px] text-stone-400">{info.secret}</p>
        {info.needsPassword && (
          <Field label="Password" hint="At least 12 characters.">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
        )}
        <Field label="Code from the app">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            className="text-center font-mono tracking-[0.4em]"
          />
        </Field>
        {form.problem && <p className="text-[13px] text-red-300">{form.problem}</p>}
        <Button
          type="submit"
          tone="primary"
          className="w-full"
          loading={form.busy}
          disabled={code.length !== 6 || (info.needsPassword && password.length < 12)}
        >
          Finish
        </Button>
      </form>
    </Shell>
  )
}
