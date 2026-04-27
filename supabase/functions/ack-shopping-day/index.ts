// User tapped "OK" on a shopping-day notification. Push an ack to the
// *other* member ("🧺 Kornel acknowledged …").
//
// Auth: invoked from the browser with the user's JWT, so we read who they
// are via the anon client, then switch to service-role to load the other
// user's subscriptions.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sendToAll, type Subscription } from '../_shared/push.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json({ error: 'no auth' }, 401)

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  })
  const { data: who } = await userClient.auth.getUser()
  if (!who.user) return json({ error: 'invalid session' }, 401)
  const userId = who.user.id

  let body: { listIds?: string[] } = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid body' }, 400)
  }
  const listIds = (body.listIds ?? []).filter((id) => typeof id === 'string')
  if (listIds.length === 0) return json({ error: 'listIds required' }, 400)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  })

  const [listsRes, ackerRes, othersRes] = await Promise.all([
    admin.from('lists').select('id, title').in('id', listIds),
    admin.from('members').select('name').eq('profile_id', userId).single(),
    admin.from('push_subscriptions').select('endpoint, p256dh, auth').neq('user_id', userId),
  ])

  if (listsRes.error) return json({ error: listsRes.error.message }, 500)
  if (othersRes.error) return json({ error: othersRes.error.message }, 500)
  if (!listsRes.data?.length) return json({ error: 'lists not found' }, 404)

  const ackerName = ackerRes.data?.name ?? 'Someone'
  const subs = (othersRes.data ?? []) as Subscription[]
  if (subs.length === 0) return json({ skipped: 'no other subscriber' })

  const dead = await sendToAll(subs, {
    kind: 'ack',
    listIds: listsRes.data.map((l) => l.id),
    listTitles: listsRes.data.map((l) => l.title),
    ackerName,
  })
  if (dead.length) {
    await admin.from('push_subscriptions').delete().in('endpoint', dead)
  }

  return json({ sent: subs.length - dead.length })
})

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
