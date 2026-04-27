import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Database } from '../lib/database.types'
import type { GroceryList, Member } from '../types'

type PresenceMeta = { at: number; listId?: string | null; itemId?: string | null }
export type EditingContext = { listId?: string; itemId?: string } | null

type MemberRow = Database['public']['Tables']['members']['Row']
type ListRow = Database['public']['Tables']['lists']['Row']
type ItemRow = Database['public']['Tables']['items']['Row']
type PhotoRow = Database['public']['Tables']['photos']['Row']

const HEARTBEAT_MS = 30_000
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

export function useGroceryData(userId: string) {
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [listRows, setListRows] = useState<ListRow[]>([])
  const [itemRows, setItemRows] = useState<ItemRow[]>([])
  const [photoRows, setPhotoRows] = useState<PhotoRow[]>([])
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [presenceState, setPresenceState] = useState<Map<string, PresenceMeta>>(new Map())
  const presenceChannelRef = useRef<RealtimeChannel | null>(null)

  // --------------------------------------------------------------------------
  // Initial load
  // --------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [m, l, i, p] = await Promise.all([
        supabase.from('members').select('*').order('created_at'),
        supabase.from('lists').select('*').order('created_at', { ascending: false }),
        supabase.from('items').select('*').order('position'),
        supabase.from('photos').select('*').order('created_at'),
      ])
      if (cancelled) return
      if (m.data) setMembers(m.data)
      if (l.data) setListRows(l.data)
      if (i.data) setItemRows(i.data)
      if (p.data) setPhotoRows(p.data)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // --------------------------------------------------------------------------
  // Realtime subscriptions — keep raw rows in sync across clients
  // --------------------------------------------------------------------------
  useEffect(() => {
    const channel = supabase
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
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

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
      setPhotoUrls((prev) => {
        const next = { ...prev }
        for (const [id, url] of pairs) {
          if (url) next[id] = url
        }
        return next
      })
      missing.forEach((p) => resolvingPhotos.current.delete(p.id))
    })()
  }, [photoRows, photoUrls])

  // --------------------------------------------------------------------------
  // Assembled view for the UI
  // --------------------------------------------------------------------------
  const lists: GroceryList[] = useMemo(
    () =>
      listRows.map((l) => ({
        id: l.id,
        title: l.title,
        date: l.date,
        notes: l.notes,
        items: itemRows
          .filter((i) => i.list_id === l.id)
          .sort((a, b) => a.position - b.position)
          .map((i) => ({ id: i.id, text: i.text, done: i.done })),
        photos: photoRows
          .filter((p) => p.list_id === l.id)
          .map((p) => ({ id: p.id, url: photoUrls[p.id] ?? '' })),
      })),
    [listRows, itemRows, photoRows, photoUrls],
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
  // --------------------------------------------------------------------------
  const addList = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10)
    const { data, error } = await supabase
      .from('lists')
      .insert({ created_by: userId })
      .select('id, date')
      .single()
    if (error || !data) return
    // If the new list's default date is today, fire the shopping-day push now
    // rather than waiting for the 9am cron. The edge function dedupes via
    // shopping_day_notifications, so a same-day cron run won't repeat it.
    if (data.date === today) {
      void supabase.functions.invoke('send-shopping-reminders', {
        body: { source: 'app' },
      })
    }
  }, [userId])

  const updateList = useCallback(
    async (id: string, patch: { title?: string; date?: string; notes?: string }) => {
      await supabase.from('lists').update(patch).eq('id', id)
    },
    [],
  )

  const deleteList = useCallback(async (id: string) => {
    // Best-effort: remove photos from storage before the row cascade kicks in.
    const paths = photoRows.filter((p) => p.list_id === id).map((p) => p.storage_path)
    if (paths.length) {
      await supabase.storage.from(BUCKET).remove(paths)
    }
    await supabase.from('lists').delete().eq('id', id)
  }, [photoRows])

  const addItem = useCallback(
    async (listId: string, text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      const maxPos = itemRows
        .filter((i) => i.list_id === listId)
        .reduce((acc, i) => Math.max(acc, i.position), -1)
      await supabase
        .from('items')
        .insert({ list_id: listId, text: trimmed, position: maxPos + 1 })
    },
    [itemRows],
  )

  const updateItem = useCallback(
    async (id: string, patch: { text?: string; done?: boolean }) => {
      await supabase.from('items').update(patch).eq('id', id)
    },
    [],
  )

  const deleteItem = useCallback(async (id: string) => {
    await supabase.from('items').delete().eq('id', id)
  }, [])

  const addPhoto = useCallback(
    async (listId: string, file: File) => {
      const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg'
      const path = `${listId}/${crypto.randomUUID()}.${ext}`
      const up = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || 'image/jpeg',
      })
      if (up.error) {
        console.error('photo upload failed', up.error)
        return
      }
      await supabase
        .from('photos')
        .insert({ list_id: listId, storage_path: path, uploaded_by: userId })
    },
    [userId],
  )

  const deletePhoto = useCallback(
    async (photoId: string) => {
      const row = photoRows.find((p) => p.id === photoId)
      if (!row) return
      await supabase.storage.from(BUCKET).remove([row.storage_path])
      await supabase.from('photos').delete().eq('id', photoId)
    },
    [photoRows],
  )

  const addMember = useCallback(async (email: string) => {
    const normalized = email.trim().toLowerCase()
    if (!normalized) return
    const { name, initials } = deriveNameAndInitials(normalized)
    await supabase
      .from('members')
      .insert({ email: normalized, name, initials, pending: true })
  }, [])

  const removeMember = useCallback(async (id: string) => {
    await supabase.from('members').delete().eq('id', id)
  }, [])

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
