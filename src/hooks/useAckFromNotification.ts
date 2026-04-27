import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Two paths into here:
//   1. App was closed and the OK action opened a new tab with `?ack=<listId>`.
//   2. App was already open; the SW posted `{ type: 'ack-list', listId }`.
// Both call the `ack-shopping-day` edge function which pushes the
// "<name> acknowledged" notification to the *other* member.
export function useAckFromNotification(userId: string) {
  useEffect(() => {
    if (!userId) return

    const ack = async (listIds: string[]) => {
      if (listIds.length === 0) return
      try {
        await supabase.functions.invoke('ack-shopping-day', { body: { listIds } })
      } catch (err) {
        console.error('ack failed', err)
      }
    }

    const url = new URL(window.location.href)
    const queued = url.searchParams.get('ack')
    if (queued) {
      url.searchParams.delete('ack')
      window.history.replaceState({}, '', url.toString())
      const ids = queued.split(',').map((s) => s.trim()).filter(Boolean)
      void ack(ids)
    }

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'ack-list' && Array.isArray(event.data.listIds)) {
        void ack(event.data.listIds.filter((s: unknown) => typeof s === 'string'))
      }
    }
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage)
  }, [userId])
}
