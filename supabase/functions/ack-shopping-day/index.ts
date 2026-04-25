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

  let body: { listId?: string } = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid body' }, 400)
  }
  if (!body.listId) return json({ error: 'listId required' }, 400)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  })

  const [listRes, ackerRes, othersRes] = await Promise.all([
    admin.from('lists').select('id, title').eq('id', body.listId).single(),
    admin.from('members').select('name').eq('profile_id', userId).single(),
    admin.from('push_subscriptions').select('endpoint, p256dh, auth').neq('user_id', userId),
  ])

  if (listRes.error || !listRes.data) return json({ error: 'list not found' }, 404)
  if (othersRes.error) return json({ error: othersRes.error.message }, 500)

  const ackerName = ackerRes.data?.name ?? 'Someone'
  const subs = (othersRes.data ?? []) as Subscription[]
  if (subs.length === 0) return json({ skipped: 'no other subscriber' })

  const dead = await sendToAll(subs, {
    kind: 'ack',
    listId: listRes.data.id,
    listTitle: listRes.data.title,
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
