// Pushes the "🧺 Today is a shopping day in <List>" notification.
//
// Triggers:
//   1. pg_cron at 7am + 8am UTC (covers 9am Warsaw across DST). Idempotent
//      via the `shopping_day_notifications (list_id, notified_on)` table.
//   2. The web app, right after creating a list whose date is today, with
//      body `{ listId }` to skip the date scan.
//
// Auth: requires the service-role key (cron uses Vault; the web app uses
// the user's JWT). RLS bypassed via the service-role client.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sendToAll, type Subscription } from '../_shared/push.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
})

type Body = { listId?: string }

Deno.serve(async (req) => {
  let body: Body = {}
  try {
    body = await req.json()
  } catch {
    // pg_cron sends a tiny body; tolerate missing JSON.
  }

  const today = new Date().toISOString().slice(0, 10)

  // Pick the lists to notify on.
  const listsQuery = body.listId
    ? admin.from('lists').select('id, title, date').eq('id', body.listId).limit(1)
    : admin.from('lists').select('id, title, date').eq('date', today)
  const { data: lists, error: listsErr } = await listsQuery
  if (listsErr) return json({ error: listsErr.message }, 500)
  if (!lists?.length) return json({ skipped: 'no lists today' })

  // Filter out lists already notified today (idempotency for cron).
  const { data: already } = await admin
    .from('shopping_day_notifications')
    .select('list_id')
    .eq('notified_on', today)
  const alreadySet = new Set((already ?? []).map((r) => r.list_id))
  const todo = lists.filter((l) => l.date === today && !alreadySet.has(l.id))
  if (todo.length === 0) return json({ skipped: 'already notified' })

  // Pull every active subscription. With 2 users this is ~2 rows.
  const { data: subs, error: subsErr } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
  if (subsErr) return json({ error: subsErr.message }, 500)
  const subscriptions = (subs ?? []) as Subscription[]

  const sentFor: string[] = []
  for (const list of todo) {
    const dead = await sendToAll(subscriptions, {
      kind: 'shopping-day',
      listId: list.id,
      listTitle: list.title,
    })
    if (dead.length) {
      await admin.from('push_subscriptions').delete().in('endpoint', dead)
    }
    await admin
      .from('shopping_day_notifications')
      .insert({ list_id: list.id, notified_on: today })
    sentFor.push(list.id)
  }

  return json({ sent: sentFor })
})

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
