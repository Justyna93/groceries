// Shared web-push helper used by `send-shopping-reminders` and
// `ack-shopping-day`. The Deno runtime in Supabase Edge Functions can
// import the `web-push` npm package directly via `npm:` specifiers.
//
// Required Function secrets (Project Settings → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY   — same value as VITE_VAPID_PUBLIC_KEY in the web app
//   VAPID_PRIVATE_KEY  — keep secret
//   VAPID_SUBJECT      — `mailto:you@example.com`
//
// Generate the keypair once with:
//   npx web-push generate-vapid-keys

import webpush from 'npm:web-push@3.6.7'

const PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:noreply@example.com'

if (PUBLIC_KEY && PRIVATE_KEY) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY)
}

export type Subscription = {
  endpoint: string
  p256dh: string
  auth: string
}

export type Payload =
  | { kind: 'shopping-day'; listIds: string[]; listTitles: string[] }
  | { kind: 'ack'; listIds: string[]; listTitles: string[]; ackerName: string }

// Returns the list of endpoints that the Push service rejected as gone (404/410)
// so the caller can clean them out of the database.
export async function sendToAll(
  subs: Subscription[],
  payload: Payload,
): Promise<string[]> {
  const dead: string[] = []
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 12 },
        )
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode
        if (status === 404 || status === 410) {
          dead.push(sub.endpoint)
        } else {
          console.error('push failed', sub.endpoint, err)
        }
      }
    }),
  )
  return dead
}
