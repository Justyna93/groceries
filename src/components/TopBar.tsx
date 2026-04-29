import { useState } from 'react'
import type { Member } from '../types'
import { BellIcon, BellOffIcon, CardIcon, MoonIcon, PlusIcon, SunIcon, UsersIcon, XIcon } from './Icons'
import { useDarkMode } from '../hooks/useDarkMode'
import { usePushNotifications } from '../hooks/usePushNotifications'

type Props = {
  members: Member[]
  currentEmail?: string
  currentUserId: string
  onAddMember: (email: string) => void
  onRemoveMember: (id: string) => void
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function formatLastSeen(iso?: string | null): string {
  if (!iso) return 'away'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'away'
  const diffMs = Date.now() - then
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

type LoyaltyApp = {
  id: string
  name: string
  url: string
}

const LOYALTY_APPS: LoyaltyApp[] = [
  {
    id: 'partnerkaart',
    name: 'Partnerkaart',
    url: 'https://partnerkaart.ee/',
  },
  {
    id: 'maxima',
    name: 'Maxima Eesti',
    url: 'https://www.maxima.ee/',
  },
]

export function TopBar({ members, currentEmail, currentUserId, onAddMember, onRemoveMember }: Props) {
  const [open, setOpen] = useState(false)
  const [appsOpen, setAppsOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { isDark, toggle: toggleTheme } = useDarkMode()
  const push = usePushNotifications(currentUserId)

  const online = members.filter((m) => m.online).length

  const pushSupported = push.state !== 'unsupported'
  const pushOn = push.subscribed && push.state === 'granted'
  const pushBlocked = push.state === 'denied'

  const submit = () => {
    const e = newEmail.trim().toLowerCase()
    if (!e) return
    if (!EMAIL_RE.test(e)) {
      setError('Enter a valid email')
      return
    }
    if (members.some((m) => m.email.toLowerCase() === e)) {
      setError('Already invited')
      return
    }
    onAddMember(e)
    setNewEmail('')
    setError(null)
  }

  return (
    <header className="sticky top-0 z-10 bg-surface-50/85 dark:bg-night-bg/85 backdrop-blur border-b border-surface-200 dark:border-night-edge">
      <div className="flex items-center justify-between px-4 py-3">
        <h1 className="text-[15px] font-semibold tracking-tight">Groceries</h1>

        <div className="flex items-center gap-2">
          {pushSupported && (
            <button
              type="button"
              onClick={() => (pushOn ? push.disable() : push.enable())}
              disabled={pushBlocked || push.state === 'subscribing'}
              className="p-1.5 rounded-full bg-white dark:bg-night-card border border-surface-200 dark:border-night-edge text-ink-700 dark:text-night-sub hover:bg-surface-100 dark:hover:bg-surface-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label={
                pushBlocked
                  ? 'Notifications blocked in browser settings'
                  : pushOn
                    ? 'Disable shopping-day notifications'
                    : 'Enable shopping-day notifications'
              }
              title={
                pushBlocked
                  ? 'Notifications blocked — re-enable in your browser settings'
                  : pushOn
                    ? 'Notifications on'
                    : 'Enable notifications'
              }
            >
              {pushOn ? (
                <BellIcon className="w-[18px] h-[18px]" />
              ) : (
                <BellOffIcon className="w-[18px] h-[18px]" />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setAppsOpen((o) => !o)
              setOpen(false)
            }}
            className="p-1.5 rounded-full bg-white dark:bg-night-card border border-surface-200 dark:border-night-edge text-ink-700 dark:text-night-sub hover:bg-surface-100 dark:hover:bg-surface-700 transition"
            aria-expanded={appsOpen}
            aria-label="Loyalty apps"
            title="Loyalty cards"
          >
            <CardIcon className="w-[18px] h-[18px]" />
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            className="p-1.5 rounded-full bg-white dark:bg-night-card border border-surface-200 dark:border-night-edge text-ink-700 dark:text-night-sub hover:bg-surface-100 dark:hover:bg-surface-700 transition"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDark ? 'Light mode' : 'Dark mode'}
          >
            {isDark ? (
              <SunIcon className="w-[18px] h-[18px]" />
            ) : (
              <MoonIcon className="w-[18px] h-[18px]" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setOpen((o) => !o)
              setAppsOpen(false)
            }}
            className="relative flex items-center gap-1.5 rounded-full bg-white dark:bg-night-card border border-surface-200 dark:border-night-edge px-2.5 py-1.5 text-ink-700 dark:text-night-sub hover:bg-surface-100 dark:hover:bg-surface-700 transition"
            aria-expanded={open}
            aria-label="Members"
          >
            <UsersIcon className="w-[18px] h-[18px]" />
            <span className="text-xs font-medium">{members.length}</span>
            {online > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-presence-on border-2 border-white dark:border-night-bg" />
            )}
          </button>
        </div>
      </div>

      {appsOpen && (
        <div className="px-4 pb-3">
          <div className="card p-2 space-y-1">
            {LOYALTY_APPS.map((app) => (
              <a
                key={app.id}
                href={app.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setAppsOpen(false)}
                className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700"
              >
                <div className="w-8 h-8 rounded-full bg-surface-100 dark:bg-night-edge grid place-items-center text-ink-700 dark:text-night-sub">
                  <CardIcon className="w-[18px] h-[18px]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink-900 dark:text-night-text truncate">
                    {app.name}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {open && (
        <div className="px-4 pb-3">
          <div className="card p-2 space-y-1">
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700"
              >
                <div className="relative w-8 h-8 rounded-full bg-surface-100 dark:bg-night-edge grid place-items-center text-xs font-semibold text-ink-700 dark:text-night-sub">
                  {m.initials}
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-surface-800 ${
                      m.online ? 'bg-presence-on' : 'bg-presence-off'
                    }`}
                    aria-label={m.online ? 'viewing' : 'away'}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink-900 dark:text-night-text truncate">{m.name}</div>
                  <div className="text-[11px] text-ink-500 dark:text-night-mute truncate">
                    {m.email}
                    {m.pending && ' · invited'}
                  </div>
                </div>
                <span className="text-[11px] text-ink-500 dark:text-night-mute shrink-0">
                  {m.pending
                    ? 'pending'
                    : m.online
                      ? 'viewing'
                      : formatLastSeen(m.lastSeenAt)}
                </span>
                {m.email.toLowerCase() !== (currentEmail ?? '').toLowerCase() && (
                  <button
                    type="button"
                    onClick={() => onRemoveMember(m.id)}
                    className="text-ink-400 hover:text-ink-700 dark:hover:text-night-text p-1 rounded-md hover:bg-surface-100 dark:hover:bg-surface-700 shrink-0"
                    aria-label={`Remove ${m.name}`}
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            <div className="pt-1 border-t border-surface-200 dark:border-night-edge mt-1">
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={newEmail}
                  onChange={(e) => {
                    setNewEmail(e.target.value)
                    if (error) setError(null)
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  placeholder="Invite by email"
                  className={`flex-1 text-sm px-2 py-1.5 rounded-md bg-surface-50 dark:bg-night-deep dark:text-night-text border outline-none ${
                    error
                      ? 'border-red-400'
                      : 'border-surface-200 dark:border-night-edge focus:border-accent-500/40'
                  }`}
                />
                <button
                  type="button"
                  onClick={submit}
                  className="flex items-center gap-1 text-sm text-accent-600 hover:text-accent-500 px-2 py-1.5 rounded-md hover:bg-surface-100 dark:hover:bg-surface-700"
                >
                  <PlusIcon className="w-4 h-4" /> Invite
                </button>
              </div>
              {error && (
                <div className="text-[11px] text-red-500 px-2 pt-1">{error}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
