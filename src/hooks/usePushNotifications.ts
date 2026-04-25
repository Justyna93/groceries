import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

type PermissionState = 'unsupported' | 'default' | 'granted' | 'denied' | 'subscribing'

export function usePushNotifications(userId: string) {
  const [state, setState] = useState<PermissionState>(() => {
    if (typeof window === 'undefined') return 'default'
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      return 'unsupported'
    }
    return Notification.permission as PermissionState
  })
  const [subscribed, setSubscribed] = useState(false)

  // On mount, see whether this device already has a saved subscription.
  // `serviceWorker.ready` would hang forever if no SW is registered (e.g. in
  // `vite dev`), so check `getRegistration()` first and degrade to unsupported.
  useEffect(() => {
    if (state === 'unsupported') return
    let cancelled = false
    ;(async () => {
      const existing = await navigator.serviceWorker.getRegistration()
      if (!existing) {
        if (!cancelled) setState('unsupported')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (!cancelled) setSubscribed(!!sub)
    })()
    return () => {
      cancelled = true
    }
  }, [state])

  const enable = useCallback(async () => {
    if (state === 'unsupported') return
    if (!VAPID_PUBLIC_KEY) {
      console.error('VITE_VAPID_PUBLIC_KEY is not set')
      return
    }
    setState('subscribing')

    let permission = Notification.permission
    if (permission === 'default') {
      permission = await Notification.requestPermission()
    }
    if (permission !== 'granted') {
      setState(permission as PermissionState)
      return
    }

    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      })
    }

    const json = sub.toJSON()
    await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
        user_agent: navigator.userAgent,
      },
      { onConflict: 'endpoint' },
    )

    setSubscribed(true)
    setState('granted')
  }, [state, userId])

  const disable = useCallback(async () => {
    if (state === 'unsupported') return
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      await sub.unsubscribe()
    }
    setSubscribed(false)
  }, [state])

  return { state, subscribed, enable, disable }
}

// Push API expects a Uint8Array, not a base64url string.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
