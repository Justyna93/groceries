import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// Two-step OTP flow: send a 6-digit code to the email, then verify it inline.
// We don't use the magic-link URL because iOS Mail can't open an installed
// PWA from a link — the session would be set in a Safari tab instead of the
// home-screen icon. Typing the code into the PWA keeps the session in-app.

type Status =
  | { kind: 'email' }
  | { kind: 'sending' }
  | { kind: 'code'; email: string }
  | { kind: 'verifying'; email: string }
  | { kind: 'error'; email?: string; message: string }

export function SignIn() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'email' })
  const codeInputRef = useRef<HTMLInputElement>(null)

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return
    setStatus({ kind: 'sending' })
    const { error } = await supabase.auth.signInWithOtp({ email: trimmed })
    if (error) {
      setStatus({ kind: 'error', message: error.message, email: trimmed })
    } else {
      setEmail(trimmed)
      setStatus({ kind: 'code', email: trimmed })
    }
  }

  const verify = async (token: string) => {
    if (status.kind !== 'code' && status.kind !== 'error') return
    const targetEmail = 'email' in status && status.email ? status.email : email
    setStatus({ kind: 'verifying', email: targetEmail })
    const { error } = await supabase.auth.verifyOtp({
      email: targetEmail,
      token,
      type: 'email',
    })
    if (error) {
      setCode('')
      setStatus({ kind: 'error', email: targetEmail, message: error.message })
      // Refocus so the user can re-type without an extra tap.
      requestAnimationFrame(() => codeInputRef.current?.focus())
    }
    // On success, onAuthStateChange in useSession swaps to the app — nothing
    // for this component to do.
  }

  // Auto-submit when 6 digits are entered.
  useEffect(() => {
    if (code.length === 6 && (status.kind === 'code' || status.kind === 'error')) {
      void verify(code)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  const inEmailStep = status.kind === 'email' || status.kind === 'sending' ||
    (status.kind === 'error' && !status.email)
  const inCodeStep = status.kind === 'code' || status.kind === 'verifying' ||
    (status.kind === 'error' && !!status.email)

  return (
    <div className="min-h-full flex items-center justify-center px-6 py-12">
      <div className="card w-full p-6 space-y-4">
        <div>
          <h1 className="text-lg font-semibold">Groceries</h1>
          <p className="text-sm text-ink-500 dark:text-night-mute mt-1">
            {inCodeStep
              ? 'Enter the 6-digit code we just emailed you.'
              : "We'll email you a 6-digit sign-in code."}
          </p>
        </div>

        {inEmailStep && (
          <form onSubmit={sendCode} className="space-y-3">
            <label className="block text-sm">
              <span className="sr-only">Email</span>
              <input
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status.kind === 'sending'}
                className="w-full rounded-md border border-surface-200 bg-white px-3 py-2 text-sm focus:border-accent-500/40 focus:ring-2 focus:ring-accent-500/40 focus:outline-none dark:border-night-edge dark:bg-night-card"
              />
            </label>
            <button
              type="submit"
              disabled={status.kind === 'sending'}
              className="w-full rounded-md bg-accent-500 px-3 py-2 text-sm font-medium text-white hover:bg-accent-600 disabled:opacity-60"
            >
              {status.kind === 'sending' ? 'Sending…' : 'Send code'}
            </button>
            {status.kind === 'error' && (
              <p className="text-sm text-red-600 dark:text-red-400">{status.message}</p>
            )}
          </form>
        )}

        {inCodeStep && (
          <div className="space-y-3">
            <p className="text-sm">
              Code sent to <span className="font-medium">{
                status.kind === 'code' || status.kind === 'verifying' || (status.kind === 'error' && status.email)
                  ? status.email
                  : email
              }</span>.
            </p>
            <input
              ref={codeInputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              autoFocus
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              disabled={status.kind === 'verifying'}
              className="w-full rounded-md border border-surface-200 bg-white px-3 py-3 text-center text-lg font-mono tracking-[0.4em] focus:border-accent-500/40 focus:ring-2 focus:ring-accent-500/40 focus:outline-none dark:border-night-edge dark:bg-night-card disabled:opacity-60"
            />
            {status.kind === 'verifying' && (
              <p className="text-sm text-ink-500 dark:text-night-mute">Verifying…</p>
            )}
            {status.kind === 'error' && (
              <p className="text-sm text-red-600 dark:text-red-400">{status.message}</p>
            )}
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                className="text-ink-500 hover:underline dark:text-night-mute"
                onClick={() => {
                  setCode('')
                  setStatus({ kind: 'email' })
                }}
              >
                Use a different email
              </button>
              <button
                type="button"
                className="text-accent-500 hover:underline disabled:opacity-60"
                disabled={status.kind === 'verifying'}
                onClick={async () => {
                  const target =
                    status.kind === 'code' || status.kind === 'verifying' ||
                    (status.kind === 'error' && status.email)
                      ? status.email!
                      : email
                  setStatus({ kind: 'sending' })
                  const { error } = await supabase.auth.signInWithOtp({ email: target })
                  setStatus(
                    error
                      ? { kind: 'error', email: target, message: error.message }
                      : { kind: 'code', email: target },
                  )
                }}
              >
                Resend
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
