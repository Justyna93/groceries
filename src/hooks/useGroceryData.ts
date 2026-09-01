import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { isProtectedMemberEmail } from '../lib/constants'
import { todayIso } from '../lib/dates'
import type { Database } from '../lib/database.types'
import type { GroceryList, Member } from '../types'

type PresenceMeta = { at: number; listId?: string | null; itemId?: string | null }
export type EditingContext = { listId?: string; itemId?: string } | null

type MemberRow = Database['public']['Tables']['members']['Row']
type ListRow = Database['public']['Tables']['lists']['Row']
type ItemRow = Database['public']['Tables']['items']['Row']
type PhotoRow = Database['public']['Tables']['photos']['Row']

const HEARTBEAT_MS = 30_000
const DAY_ROLLOVER_CHECK_MS = 60_000
const REFRESH_THROTTLE_MS = 5_000
const SHOPPING_PUSH_DELAY_MS = 5_000
const RESUBSCRIBE_BASE_MS = 2_000
const RESUBSCRIBE_MAX_MS = 30_000
const PHOTO_URL_TTL_SECONDS = 60 * 60
const BUCKET = 'list-photos'

function deriveNameAndInitials(email: string): { name: string; initials: string } {
  const local = email.split('@')[0] ?? email
  const name =
    local
      .split(/[._-]/)
      .filter(Boolean)
      .map((p) => p[0]!.toUpperCase() + p.slice(1))
      .join(' ') || email
  const initials = local.slice(0, 2).toUpperCase()
  return { name, initials }
}

const upsertById = <T extends { id: string }>(rows: T[], row: T): T[] => {
  const idx = rows.findIndex((r) => r.id === row.id)
  if (idx === -1) return [...rows, row]
  const next = rows.slice()
  next[idx] = row
  return next
}
const removeById = <T extends { id: string }>(rows: T[], id: string): T[] =>
  rows.filter((r) => r.id !== id)
const patchById = <T extends { id: string }>(rows: T[], id: string, patch: Partial<T>): T[] =>
  rows.map((r) => (r.id === id ? { ...r, ...patch } : r))

export function useGroceryData(userId: string) {
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [listRows, setListRows] = useState<ListRow[]>([])
  const [itemRows, setItemRows] = useState<ItemRow[]>([])
  const [photoRows, setPhotoRows] = useState<PhotoRow[]>([])
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [presenceState, setPresenceState] = useState<Map<string, PresenceMeta>>(new Map())
  const [today, setToday] = useState(todayIso)
  const presenceChannelRef = useRef<RealtimeChannel | null>(null)

  // Snapshots the mutators read without having to re-create themselves (and go
  // stale) every time a row changes.
  const listRowsRef = useRef(listRows)
  const itemRowsRef = useRef(itemRows)
  const photoRowsRef = useRef(photoRows)
  useEffect(() => {
    listRowsRef.current = listRows
    itemRowsRef.current = itemRows
    photoRowsRef.current = photoRows
  })

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Pending push timer per list, so a quickly-corrected date pick (e.g. iOS
  // committing today before the user spins to another day) cancels the push.
  const pendingPushRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  useEffect(() => {
    const timers = pendingPushRef.current
    return () => {
      timers.forEach((t) => clearTimeout(t))
      timers.clear()
    }
  }, [])

  // --------------------------------------------------------------------------
  // Fetching
  // --------------------------------------------------------------------------
  const lastRefreshRef = useRef(0)
  // Optimistic rows live only in local state until their write lands. A refetch
  // in that window would erase them for a beat, so refreshes wait it out.
  const inFlightWritesRef = useRef(0)

  const refresh = useCallback(async (force = false) => {
    const now = Date.now()
    if (!force) {
      if (inFlightWritesRef.current > 0) return
      if (now - lastRefreshRef.current < REFRESH_THROTTLE_MS) return
    }
    lastRefreshRef.current = now

    const [m, l, i, p] = await Promise.all([
      supabase.from('members').select('*').order('created_at'),
      supabase.from('lists').select('*').order('created_at', { ascending: false }),
      supabase.from('items').select('*').order('position'),
      supabase.from('photos').select('*').order('created_at'),
    ])
    if (!mountedRef.current || inFlightWritesRef.current > 0) return
    if (m.data) setMembers(m.data)
    if (l.data) setListRows(l.data)
    if (i.data) setItemRows(i.data)
    if (p.data) setPhotoRows(p.data)
  }, [])

  // Initial load. Self-heal first: if this login reused an auth account that
  // predates the current invite (e.g. a re-invite after removal), the
  // members row may still be pending with no profile_id attached — RLS would
  // otherwise hide everything with no way back in. See migration 0005.
  useEffect(() => {
    ;(async () => {
      await supabase.rpc('claim_pending_membership')
      await refresh(true)
      if (mountedRef.current) setLoading(false)
    })()
  }, [refresh])

  // Catch up on anything the socket missed while the tab was backgrounded —
  // mobile browsers freeze WebSockets aggressively.
  useEffect(() => {
    const onWake = () => {
      if (!document.hidden) void refresh()
    }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)
    window.addEventListener('online', onWake)
    return () => {
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', onWake)
      window.removeEventListener('online', onWake)
    }
  }, [refresh])

  // --------------------------------------------------------------------------
  // Realtime subscriptions — keep raw rows in sync across clients
  // --------------------------------------------------------------------------
  const subscribedOnceRef = useRef(false)
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    let channel: RealtimeChannel | null = null
    let retryTimer: number | undefined
    let attempt = 0

    const teardown = () => {
      if (channel) {
        void supabase.removeChannel(channel)
        channel = null
      }
    }

    const scheduleRetry = () => {
      if (cancelled || retryTimer !== undefined) return
      const delay = Math.min(RESUBSCRIBE_BASE_MS * 2 ** attempt, RESUBSCRIBE_MAX_MS)
      attempt += 1
      retryTimer = window.setTimeout(() => {
        retryTimer = undefined
        teardown()
        void start()
      }, delay)
    }

    const start = async () => {
      if (cancelled) return
      // The socket must carry the user's JWT: with only the anon key, every
      // RLS policy here (is_member()) evaluates false and the server sends no
      // change events at all. supabase.ts keeps this current on auth changes;
      // this call covers the very first subscribe, which can race ahead of the
      // session being read back out of storage.
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      await supabase.realtime.setAuth(data.session?.access_token ?? null)
      if (cancelled) return

      channel = supabase
        .channel('postgres:groceries')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'members' },
          (payload) => {
            if (payload.eventType === 'DELETE') {
              setMembers((prev) => removeById(prev, (payload.old as MemberRow).id))
            } else {
              setMembers((prev) => upsertById(prev, payload.new as MemberRow))
            }
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'lists' },
          (payload) => {
            if (payload.eventType === 'DELETE') {
              setListRows((prev) => removeById(prev, (payload.old as ListRow).id))
            } else {
              setListRows((prev) => upsertById(prev, payload.new as ListRow))
            }
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'items' },
          (payload) => {
            if (payload.eventType === 'DELETE') {
              setItemRows((prev) => removeById(prev, (payload.old as ItemRow).id))
            } else {
              setItemRows((prev) => upsertById(prev, payload.new as ItemRow))
            }
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'photos' },
          (payload) => {
            if (payload.eventType === 'DELETE') {
              setPhotoRows((prev) => removeById(prev, (payload.old as PhotoRow).id))
            } else {
              setPhotoRows((prev) => upsertById(prev, payload.new as PhotoRow))
            }
          },
        )
        .subscribe((status, err) => {
          if (cancelled) return
          if (status === 'SUBSCRIBED') {
            attempt = 0
            // Anything that changed while we were disconnected never arrives
            // as an event, so reconcile against the server on every re-join.
            if (subscribedOnceRef.current) void refresh()
            subscribedOnceRef.current = true
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('realtime channel lost, resubscribing', status, err)
            scheduleRetry()
          }
        })
    }

    void start()

    return () => {
      cancelled = true
      if (retryTimer !== undefined) window.clearTimeout(retryTimer)
      teardown()
    }
  }, [userId, refresh])

  // --------------------------------------------------------------------------
  // Presence — the "online" dot, keyed by profile_id (auth user id)
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!userId) return
    const channel = supabase.channel('presence:household', {
      config: { presence: { key: userId } },
    })
    channel.on('presence', { event: 'sync' }, () => {
      const raw = channel.presenceState() as Record<string, PresenceMeta[]>
      const next = new Map<string, PresenceMeta>()
      for (const [key, metas] of Object.entries(raw)) {
        if (!metas.length) continue
        const latest = metas.reduce((a, b) => (b.at > a.at ? b : a))
        next.set(key, latest)
      }
      setPresenceState(next)
    })
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        presenceChannelRef.current = channel
        await channel.track({ at: Date.now() })
      }
    })
    return () => {
      presenceChannelRef.current = null
      supabase.removeChannel(channel)
    }
  }, [userId])

  const setEditingContext = useCallback((ctx: EditingContext) => {
    const channel = presenceChannelRef.current
    if (!channel) return
    void channel.track({
      at: Date.now(),
      listId: ctx?.listId ?? null,
      itemId: ctx?.itemId ?? null,
    })
  }, [])

  // --------------------------------------------------------------------------
  // Heartbeat — write members.last_seen_at every 30s + on hide/unload
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!userId) return
    const tick = () => {
      supabase
        .from('members')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('profile_id', userId)
        .then(() => {})
    }
    tick()
    const interval = window.setInterval(tick, HEARTBEAT_MS)
    const onVisibility = () => {
      if (document.hidden) tick()
    }
    window.addEventListener('beforeunload', tick)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('beforeunload', tick)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [userId])

  // --------------------------------------------------------------------------
  // Day rollover — recheck the calendar day so a list dated "today" stops
  // being today at midnight, even if the app was left open overnight.
  // --------------------------------------------------------------------------
  useEffect(() => {
    const check = () => setToday((prev) => (todayIso() === prev ? prev : todayIso()))
    const interval = window.setInterval(check, DAY_ROLLOVER_CHECK_MS)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [])

  // --------------------------------------------------------------------------
  // Past dates are cleared to NULL: a shopping day that has been and gone is
  // no date at all, and leaving it set keeps the list sorted above undated
  // ones. Runs on load and again whenever the day rolls over.
  // --------------------------------------------------------------------------
  const sweepingRef = useRef(false)
  useEffect(() => {
    if (loading || sweepingRef.current) return
    const stale = listRows.filter((l) => l.date !== null && l.date < today)
    if (stale.length === 0) return

    // No local write needed: the assembled `lists` memo below already reads a
    // past date as no date, so the UI is right from the first paint and this
    // effect only has to make the database agree.
    const ids = stale.map((l) => l.id)
    sweepingRef.current = true
    void (async () => {
      const { error } = await supabase.from('lists').update({ date: null }).in('id', ids)
      if (error) console.error('clearing past list dates failed', error)
      sweepingRef.current = false
    })()
  }, [listRows, today, loading])

  // --------------------------------------------------------------------------
  // Photo URL resolution — sign private-bucket paths for <img src>
  // --------------------------------------------------------------------------
  const resolvingPhotos = useRef<Set<string>>(new Set())
  useEffect(() => {
    const missing = photoRows.filter(
      (p) => !photoUrls[p.id] && !resolvingPhotos.current.has(p.id),
    )
    if (missing.length === 0) return
    missing.forEach((p) => resolvingPhotos.current.add(p.id))
    ;(async () => {
      const pairs = await Promise.all(
        missing.map(async (p) => {
          const { data } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(p.storage_path, PHOTO_URL_TTL_SECONDS)
          return [p.id, data?.signedUrl ?? ''] as const
        }),
      )
      if (!mountedRef.current) return
      const resolved = pairs.filter(([, url]) => url)
      // Ids that failed to sign stay marked as in-flight on purpose: releasing
      // them would leave them "missing" again on the next render and spin this
      // effect into an endless signing loop.
      resolved.forEach(([id]) => resolvingPhotos.current.delete(id))
      if (resolved.length === 0) return
      setPhotoUrls((prev) => {
        const next = { ...prev }
        for (const [id, url] of resolved) next[id] = url
        return next
      })
    })()
  }, [photoRows, photoUrls])

  // --------------------------------------------------------------------------
  // Assembled view for the UI
  // --------------------------------------------------------------------------
  const lists: GroceryList[] = useMemo(
    () =>
      listRows
        // Sort by shopping date ascending — earliest first, undated lists last.
        // Falls back to created_at desc within each bucket so the order is
        // stable when multiple lists share a date (or none at all).
        .slice()
        .sort((a, b) => {
          if (a.date && b.date) {
            if (a.date !== b.date) return a.date < b.date ? -1 : 1
          } else if (a.date) {
            return -1
          } else if (b.date) {
            return 1
          }
          return (b.created_at ?? '').localeCompare(a.created_at ?? '')
        })
        .map((l) => ({
          id: l.id,
          title: l.title,
          // Belt-and-braces with the sweep above: a past date reads as "no
          // date" from the first paint, before the UPDATE has landed.
          date: l.date !== null && l.date < today ? null : l.date,
          notes: l.notes,
          items: itemRows
            .filter((i) => i.list_id === l.id)
            // Done items pile at the top, most-recently-crossed first.
            // updateItem assigns position=min-1 on done, position=max+1 on undone,
            // so a single asc sort keeps done above undone.
            .sort((a, b) => {
              if (a.done !== b.done) return a.done ? -1 : 1
              return a.position - b.position
            })
            .map((i) => ({ id: i.id, text: i.text, done: i.done })),
          photos: photoRows
            .filter((p) => p.list_id === l.id)
            .map((p) => ({ id: p.id, url: photoUrls[p.id] ?? '' })),
        })),
    [listRows, itemRows, photoRows, photoUrls, today],
  )

  const uiMembers: Member[] = useMemo(
    () =>
      members.map((m) => ({
        id: m.id,
        email: m.email,
        name: m.name,
        initials: m.initials,
        pending: m.pending,
        lastSeenAt: m.last_seen_at,
        online: m.profile_id ? presenceState.has(m.profile_id) : false,
      })),
    [members, presenceState],
  )

  const memberByProfileId = useMemo(() => {
    const m = new Map<string, Member>()
    for (const row of uiMembers) {
      const profileId = members.find((r) => r.id === row.id)?.profile_id
      if (profileId) m.set(profileId, row)
    }
    return m
  }, [uiMembers, members])

  const viewersByList = useMemo(() => {
    const out: Record<string, Member[]> = {}
    for (const [profileId, meta] of presenceState) {
      if (profileId === userId || !meta.listId) continue
      const member = memberByProfileId.get(profileId)
      if (!member) continue
      ;(out[meta.listId] ??= []).push(member)
    }
    return out
  }, [presenceState, memberByProfileId, userId])

  const editorsByItem = useMemo(() => {
    const out: Record<string, Member[]> = {}
    for (const [profileId, meta] of presenceState) {
      if (profileId === userId || !meta.itemId) continue
      const member = memberByProfileId.get(profileId)
      if (!member) continue
      ;(out[meta.itemId] ??= []).push(member)
    }
    return out
  }, [presenceState, memberByProfileId, userId])

  // --------------------------------------------------------------------------
  // Mutators
  //
  // Every one of these paints the change locally first and rolls back if the
  // server rejects it. Waiting for the round trip — or worse, for the realtime
  // echo of our own write — is what made taps feel like they did nothing.
  // Row ids are minted client-side so inserts can be optimistic too.
  // --------------------------------------------------------------------------
  const track = useCallback(async <T,>(op: () => Promise<T>): Promise<T> => {
    inFlightWritesRef.current += 1
    try {
      return await op()
    } finally {
      inFlightWritesRef.current -= 1
    }
  }, [])

  const addList = useCallback(async () => {
    // New lists have no date until the user picks one — that's what gates the
    // shopping-day notification (fired in updateList when date becomes today).
    const optimistic: ListRow = {
      id: crypto.randomUUID(),
      title: 'New list',
      date: null,
      notes: '',
      created_by: userId,
      created_at: new Date().toISOString(),
    }
    setListRows((prev) => upsertById(prev, optimistic))
    await track(async () => {
      const { error } = await supabase
        .from('lists')
        .insert({ id: optimistic.id, created_by: userId })
      if (error) {
        console.error('addList failed', error)
        setListRows((prev) => removeById(prev, optimistic.id))
      }
    })
  }, [userId, track])

  const updateList = useCallback(
    async (
      id: string,
      patch: { title?: string; date?: string | null; notes?: string },
    ) => {
      const previous = listRowsRef.current.find((l) => l.id === id)
      setListRows((prev) => patchById(prev, id, patch))

      const failed = await track(async () => {
        const { error } = await supabase.from('lists').update(patch).eq('id', id)
        if (error) {
          console.error('updateList failed', error)
          if (previous) setListRows((prev) => patchById(prev, id, previous))
          return true
        }
        return false
      })
      if (failed) return

      // Fire the shopping-day push only when the date *changes to* today, so
      // edits to the title or notes on a today-list don't re-trigger it. The
      // edge function dedupes via shopping_day_notifications.
      if (patch.date !== undefined) {
        // Cancel any pending push for this list — handles iOS Safari opening
        // the date picker and committing today's date before the user spins
        // to the day they actually wanted.
        const pending = pendingPushRef.current.get(id)
        if (pending) {
          clearTimeout(pending)
          pendingPushRef.current.delete(id)
        }
        // Read the day fresh rather than from the today state: this callback is
        // not re-created on rollover, so the state would be stale at midnight.
        const currentDay = todayIso()
        if (patch.date === currentDay && previous?.date !== currentDay) {
          const timer = setTimeout(() => {
            pendingPushRef.current.delete(id)
            void supabase.functions.invoke('send-shopping-reminders', {
              body: { source: 'app' },
            })
          }, SHOPPING_PUSH_DELAY_MS)
          pendingPushRef.current.set(id, timer)
        }
      }
    },
    [track],
  )

  const deleteList = useCallback(
    async (id: string) => {
      const previousList = listRowsRef.current.find((l) => l.id === id)
      if (!previousList) return
      const previousItems = itemRowsRef.current.filter((i) => i.list_id === id)
      const previousPhotos = photoRowsRef.current.filter((p) => p.list_id === id)

      setListRows((prev) => removeById(prev, id))
      setItemRows((prev) => prev.filter((i) => i.list_id !== id))
      setPhotoRows((prev) => prev.filter((p) => p.list_id !== id))

      await track(async () => {
        const { error } = await supabase.from('lists').delete().eq('id', id)
        if (error) {
          console.error('deleteList failed', error)
          setListRows((prev) => upsertById(prev, previousList))
          setItemRows((prev) => [...prev, ...previousItems])
          setPhotoRows((prev) => [...prev, ...previousPhotos])
          return
        }
        // The row cascade takes the photo records with it, but the storage
        // objects have to go separately.
        const paths = previousPhotos.map((p) => p.storage_path)
        if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
      })
    },
    [track],
  )

  const addItem = useCallback(
    async (listId: string, text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      const maxPos = itemRowsRef.current
        .filter((i) => i.list_id === listId)
        .reduce((acc, i) => Math.max(acc, i.position), -1)
      const optimistic: ItemRow = {
        id: crypto.randomUUID(),
        list_id: listId,
        text: trimmed,
        done: false,
        position: maxPos + 1,
        created_at: new Date().toISOString(),
      }
      setItemRows((prev) => upsertById(prev, optimistic))
      await track(async () => {
        const { error } = await supabase.from('items').insert({
          id: optimistic.id,
          list_id: listId,
          text: trimmed,
          position: optimistic.position,
        })
        if (error) {
          console.error('addItem failed', error)
          setItemRows((prev) => removeById(prev, optimistic.id))
        }
      })
    },
    [track],
  )

  const updateItem = useCallback(
    async (id: string, patch: { text?: string; done?: boolean }) => {
      const current = itemRowsRef.current.find((i) => i.id === id)
      const next: { text?: string; done?: boolean; position?: number } = { ...patch }
      if (patch.done !== undefined && current) {
        const siblings = itemRowsRef.current.filter((i) => i.list_id === current.list_id)
        if (patch.done) {
          const minPos = siblings.reduce((acc, i) => Math.min(acc, i.position), 0)
          next.position = minPos - 1
        } else {
          const maxPos = siblings.reduce((acc, i) => Math.max(acc, i.position), -1)
          next.position = maxPos + 1
        }
      }
      setItemRows((prev) => patchById(prev, id, next))
      await track(async () => {
        const { error } = await supabase.from('items').update(next).eq('id', id)
        if (error) {
          console.error('updateItem failed', error)
          if (current) setItemRows((prev) => patchById(prev, id, current))
        }
      })
    },
    [track],
  )

  const deleteItem = useCallback(
    async (id: string) => {
      const previous = itemRowsRef.current.find((i) => i.id === id)
      if (!previous) return
      setItemRows((prev) => removeById(prev, id))
      await track(async () => {
        const { error } = await supabase.from('items').delete().eq('id', id)
        if (error) {
          console.error('deleteItem failed', error)
          setItemRows((prev) => upsertById(prev, previous))
        }
      })
    },
    [track],
  )

  const addPhoto = useCallback(
    async (listId: string, file: File) => {
      const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg'
      const id = crypto.randomUUID()
      const path = `${listId}/${id}.${ext}`
      await track(async () => {
        const up = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type || 'image/jpeg',
        })
        if (up.error) {
          console.error('photo upload failed', up.error)
          return
        }
        const optimistic: PhotoRow = {
          id,
          list_id: listId,
          storage_path: path,
          uploaded_by: userId,
          created_at: new Date().toISOString(),
        }
        // Show the local file straight away rather than waiting on a signed
        // URL for bytes this device already has.
        setPhotoUrls((prev) => ({ ...prev, [id]: URL.createObjectURL(file) }))
        setPhotoRows((prev) => upsertById(prev, optimistic))

        const { error } = await supabase
          .from('photos')
          .insert({ id, list_id: listId, storage_path: path, uploaded_by: userId })
        if (error) {
          console.error('addPhoto failed', error)
          setPhotoRows((prev) => removeById(prev, id))
          await supabase.storage.from(BUCKET).remove([path])
        }
      })
    },
    [userId, track],
  )

  const deletePhoto = useCallback(
    async (photoId: string) => {
      const row = photoRowsRef.current.find((p) => p.id === photoId)
      if (!row) return
      setPhotoRows((prev) => removeById(prev, photoId))
      setPhotoUrls((prev) => {
        const url = prev[photoId]
        if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
        const next = { ...prev }
        delete next[photoId]
        return next
      })
      resolvingPhotos.current.delete(photoId)
      await track(async () => {
        const { error } = await supabase.from('photos').delete().eq('id', photoId)
        if (error) {
          console.error('deletePhoto failed', error)
          setPhotoRows((prev) => upsertById(prev, row))
          return
        }
        await supabase.storage.from(BUCKET).remove([row.storage_path])
      })
    },
    [track],
  )

  const addMember = useCallback(
    async (email: string) => {
      const normalized = email.trim().toLowerCase()
      if (!normalized) return
      const { name, initials } = deriveNameAndInitials(normalized)
      const optimistic: MemberRow = {
        id: crypto.randomUUID(),
        email: normalized,
        name,
        initials,
        profile_id: null,
        pending: true,
        last_seen_at: null,
        created_at: new Date().toISOString(),
      }
      setMembers((prev) => upsertById(prev, optimistic))
      await track(async () => {
        const { error } = await supabase
          .from('members')
          .insert({ id: optimistic.id, email: normalized, name, initials, pending: true })
        if (error) {
          console.error('addMember failed', error)
          setMembers((prev) => removeById(prev, optimistic.id))
        }
      })
    },
    [track],
  )

  const removeMember = useCallback(
    async (id: string) => {
      const previous = members.find((m) => m.id === id)
      if (!previous) return
      // Removing this member would revoke their access to everything, since
      // every RLS policy runs through is_member(). The database refuses it
      // too — this only saves the pointless round trip.
      if (isProtectedMemberEmail(previous.email)) {
        console.warn('refusing to remove protected member', previous.email)
        return
      }
      setMembers((prev) => removeById(prev, id))
      await track(async () => {
        const { error } = await supabase.from('members').delete().eq('id', id)
        if (error) {
          console.error('removeMember failed', error)
          setMembers((prev) => upsertById(prev, previous))
        }
      })
    },
    [members, track],
  )

  return {
    loading,
    lists,
    members: uiMembers,
    viewersByList,
    editorsByItem,
    setEditingContext,
    addList,
    updateList,
    deleteList,
    addItem,
    updateItem,
    deleteItem,
    addPhoto,
    deletePhoto,
    addMember,
    removeMember,
  }
}

export type UseGroceryData = ReturnType<typeof useGroceryData>
