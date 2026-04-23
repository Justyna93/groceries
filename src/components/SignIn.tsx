import { useState } from 'react'
import { supabase } from '../lib/supabase'

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; email: string }
  | { kind: 'error'; message: string }

export function SignIn() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return
    setStatus({ kind: 'sending' })
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) {
      setStatus({ kind: 'error', message: error.message })
    } else {
      setStatus({ kind: 'sent', email: trimmed })
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center px-6 py-12">
      <div className="card w-full p-6 space-y-4">
        <div>
          <h1 className="text-lg font-semibold">Groceries</h1>
          <p className="text-sm text-ink-500 dark:text-night-mute mt-1">
            Sign in with a magic link. We'll email you a one-tap sign-in link.
          </p>
        </div>

        {status.kind === 'sent' ? (
          <div className="text-sm space-y-2">
            <p>
              Check <span className="font-medium">{status.email}</span> for a sign-in link.
            </p>
            <button
              type="button"
              className="text-accent-500 hover:underline"
              onClick={() => setStatus({ kind: 'idle' })}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
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
              {status.kind === 'sending' ? 'Sending…' : 'Send magic link'}
            </button>
            {status.kind === 'error' && (
              <p className="text-sm text-red-600 dark:text-red-400">{status.message}</p>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
