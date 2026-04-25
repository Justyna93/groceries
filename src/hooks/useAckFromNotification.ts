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

    const ack = async (listId: string) => {
      try {
        await supabase.functions.invoke('ack-shopping-day', { body: { listId } })
      } catch (err) {
        console.error('ack failed', err)
      }
    }

    const url = new URL(window.location.href)
    const queued = url.searchParams.get('ack')
    if (queued) {
      url.searchParams.delete('ack')
      window.history.replaceState({}, '', url.toString())
      void ack(queued)
    }

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'ack-list' && typeof event.data.listId === 'string') {
        void ack(event.data.listId)
      }
    }
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage)
  }, [userId])
}
