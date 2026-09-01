import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill them in.',
  )
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

// Keep the Realtime socket authenticated as the signed-in user.
//
// supabase-js forwards the access token to Realtime only on `SIGNED_IN` and
// `TOKEN_REFRESHED`. Reopening the app with a still-valid persisted session
// emits `INITIAL_SESSION` instead, so the socket keeps running on the bare
// anon key. Every table here is RLS-protected behind `is_member()`, which is
// false for anon — so `postgres_changes` subscriptions join happily and then
// deliver *nothing*, until the token happens to refresh minutes later. That
// is what made live updates look broken-then-fixed at random.
supabase.auth.onAuthStateChange((_event, session) => {
  void supabase.realtime.setAuth(session?.access_token ?? null)
})
