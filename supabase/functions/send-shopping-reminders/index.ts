// Sends ONE aggregated "🧺 Today is a shopping day" notification listing every
// list dated today. Subsequent calls during the day re-render the same
// notification (date-keyed `tag` in the SW), so adding a 2nd list just updates
// the body to "Open Pharmacy, Bio." instead of stacking a second alert.
//
// Triggers:
//   1. pg_cron at 7am + 8am UTC (covers 9am Warsaw across DST). Skipped if
//      we already fired one today.
//   2. The web app, right after creating a list dated today. Body is ignored;
//      we always re-aggregate from the DB.
//
// Auth: service-role (cron via Vault; web app via the user's JWT).

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sendToAll, type Subscription } from '../_shared/push.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
})

type Body = { source?: string }

Deno.serve(async (req) => {
  let body: Body = {}
  try {
    body = await req.json()
  } catch {
    // pg_cron sends a tiny body; tolerate missing JSON.
  }

  const today = new Date().toISOString().slice(0, 10)
  const fromCron = body.source === 'cron'

  const { data: lists, error: listsErr } = await admin
    .from('lists')
    .select('id, title')
    .eq('date', today)
  if (listsErr) return json({ error: listsErr.message }, 500)
  if (!lists?.length) return json({ skipped: 'no lists today' })

  // Cron must not double-fire (7am + 8am UTC); the web-app trigger always
  // proceeds so a freshly-added list updates the in-tray notification.
  if (fromCron) {
    const { count } = await admin
      .from('shopping_day_notifications')
      .select('list_id', { count: 'exact', head: true })
      .eq('notified_on', today)
    if (count && count > 0) return json({ skipped: 'already notified today' })
  }

  const { data: subs, error: subsErr } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
  if (subsErr) return json({ error: subsErr.message }, 500)
  const subscriptions = (subs ?? []) as Subscription[]

  const dead = await sendToAll(subscriptions, {
    kind: 'shopping-day',
    listIds: lists.map((l) => l.id),
    listTitles: lists.map((l) => l.title),
  })
  if (dead.length) {
    await admin.from('push_subscriptions').delete().in('endpoint', dead)
  }

  // Record dedup rows for any list we haven't recorded yet, so a later cron
  // run on the same date short-circuits.
  const { data: already } = await admin
    .from('shopping_day_notifications')
    .select('list_id')
    .eq('notified_on', today)
  const have = new Set((already ?? []).map((r) => r.list_id))
  const toInsert = lists.filter((l) => !have.has(l.id))
  if (toInsert.length) {
    await admin
      .from('shopping_day_notifications')
      .insert(toInsert.map((l) => ({ list_id: l.id, notified_on: today })))
  }

  return json({ sent: lists.length, listIds: lists.map((l) => l.id) })
})

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
