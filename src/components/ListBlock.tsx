import { useRef, useState } from 'react'
import type { GroceryList, BulletItem, Member } from '../types'
import { EditableText } from './EditableText'
import { CameraIcon, NoteIcon, PlusIcon, TrashIcon, XIcon } from './Icons'

type Props = {
  list: GroceryList
  viewers?: Member[]
  editorsByItem?: Record<string, Member[]>
  onEditingItem?: (itemId: string | null) => void
  onEditingList?: (editing: boolean) => void
  onUpdateList: (patch: { title?: string; date?: string | null; notes?: string }) => void
  onDeleteList: () => void
  onAddItem: (text: string) => void
  onUpdateItem: (id: string, patch: Partial<BulletItem>) => void
  onDeleteItem: (id: string) => void
  onAddPhoto: (file: File) => void
  onDeletePhoto: (id: string) => void
}

function Avatar({ member, size = 18 }: { member: Member; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-accent-500/15 text-accent-700 dark:text-accent-300 ring-2 ring-white dark:ring-night-card font-semibold"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      title={`${member.name} is editing`}
      aria-label={`${member.name} is editing`}
    >
      {member.initials}
    </span>
  )
}

function AvatarStack({ members, size = 18 }: { members: Member[]; size?: number }) {
  if (!members.length) return null
  return (
    <span className="inline-flex -space-x-1.5">
      {members.slice(0, 3).map((m) => (
        <Avatar key={m.id} member={m} size={size} />
      ))}
    </span>
  )
}

const COLLAPSED_LIMIT = 5

export function ListBlock({
  list,
  viewers = [],
  editorsByItem = {},
  onEditingItem,
  onEditingList,
  onUpdateList,
  onDeleteList,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onAddPhoto,
  onDeletePhoto,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const [newItem, setNewItem] = useState('')
  const [showNotes, setShowNotes] = useState(list.notes.trim() !== '')
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const addItem = () => {
    const t = newItem.trim()
    if (!t) return
    onAddItem(t)
    setNewItem('')
  }

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    files.forEach((f) => onAddPhoto(f))
    e.target.value = ''
  }

  const hiddenCount = Math.max(0, list.items.length - COLLAPSED_LIMIT)
  const visibleItems = expanded ? list.items : list.items.slice(0, COLLAPSED_LIMIT)

  // Pretty date: "Today", "Tomorrow", "DD mmm", or "Set date" when not picked.
  const { prettyDate, isToday } = (() => {
    if (!list.date) return { prettyDate: 'Set date', isToday: false }
    try {
      const d = new Date(list.date)
      if (Number.isNaN(d.getTime())) return { prettyDate: list.date, isToday: false }
      const startOfDay = (x: Date) =>
        new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
      const target = startOfDay(d)
      const today = startOfDay(new Date())
      const dayMs = 24 * 60 * 60 * 1000
      if (target === today) return { prettyDate: 'Today', isToday: true }
      if (target === today + dayMs) return { prettyDate: 'Tomorrow', isToday: false }
      return {
        prettyDate: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
        isToday: false,
      }
    } catch {
      return { prettyDate: list.date ?? 'Set date', isToday: false }
    }
  })()

  return (
    <section
      className={`card p-4 space-y-3 ${
        isToday ? 'border-2 border-[#c2410c] dark:border-[#ea580c]' : ''
      }`}
    >
      {/* Header: title + date on same row */}
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <EditableText
            value={list.title}
            onChange={(t) => onUpdateList({ title: t })}
            onEditingChange={(editing) => onEditingList?.(editing)}
            placeholder="Untitled list"
            className={`font-semibold text-[17px] truncate ${
              isToday
                ? 'text-[#c2410c] dark:text-[#ea580c]'
                : 'text-ink-900 dark:text-night-text'
            }`}
          />
          {viewers.length > 0 && <AvatarStack members={viewers} />}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <span className="relative inline-flex items-center">
            <span
              className={`text-xs px-1 editable ${
                list.date
                  ? 'text-ink-500 dark:text-night-mute'
                  : 'text-ink-400 italic'
              }`}
            >
              {prettyDate}
            </span>
            <input
              type="date"
              value={list.date ?? ''}
              onChange={(e) => onUpdateList({ date: e.target.value || null })}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer dark:[color-scheme:dark]"
              aria-label="Set date"
            />
          </span>
          {list.date && (
            <button
              type="button"
              onClick={() => onUpdateList({ date: null })}
              className="p-0.5 rounded-full text-ink-400 hover:text-ink-900 dark:hover:text-night-text hover:bg-surface-100 dark:hover:bg-night-edge"
              aria-label="Clear date"
              title="Clear date"
            >
              <XIcon className="w-3 h-3" />
            </button>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="p-1 rounded-full text-ink-500 dark:text-night-mute hover:text-ink-900 dark:hover:text-night-text hover:bg-surface-100 dark:hover:bg-night-edge"
            aria-label="Add photo"
            title="Add photo"
          >
            <CameraIcon className="w-4 h-4" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onPhoto}
          />
          <button
            type="button"
            onClick={onDeleteList}
            className="p-1 rounded-full text-ink-400 hover:text-ink-900 dark:hover:text-night-text hover:bg-surface-100 dark:hover:bg-night-edge"
            aria-label="Delete list"
            title="Delete list"
          >
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Bullets */}
      <ul className="space-y-1">
        {visibleItems.map((item) => (
          <li key={item.id} className="group flex items-start gap-2.5">
            <button
              type="button"
              onClick={() => onUpdateItem(item.id, { done: !item.done })}
              className={`mt-1.5 w-4 h-4 rounded-full border-[1.5px] shrink-0 transition ${
                item.done
                  ? 'bg-accent-500 border-accent-500'
                  : 'border-ink-400 hover:border-ink-700 dark:hover:border-night-sub'
              }`}
              aria-label={item.done ? 'Mark as not done' : 'Mark as done'}
            />
            <EditableText
              value={item.text}
              onChange={(t) => onUpdateItem(item.id, { text: t })}
              onEditingChange={(editing) => onEditingItem?.(editing ? item.id : null)}
              placeholder="Item"
              className={`flex-1 text-[15px] ${
                item.done
                  ? 'line-through text-ink-400'
                  : 'text-ink-900 dark:text-night-text'
              }`}
            />
            {editorsByItem[item.id]?.length ? (
              <AvatarStack members={editorsByItem[item.id]} size={16} />
            ) : null}
            <button
              type="button"
              onClick={() => onDeleteItem(item.id)}
              className="opacity-0 group-hover:opacity-100 text-ink-400 hover:text-ink-900 dark:hover:text-night-text p-1 rounded-md"
              aria-label="Remove item"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </li>
        ))}

        {/* New item input bullet */}
        <li className="flex items-center gap-2.5 pt-0.5">
          <span className="w-4 h-4 rounded-full border-[1.5px] border-dashed border-ink-400 shrink-0" />
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onFocus={() => onEditingList?.(true)}
            onBlur={() => onEditingList?.(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addItem()
              }
            }}
            placeholder="Add item…"
            className="flex-1 text-[15px] bg-transparent outline-none placeholder:text-ink-400 dark:text-night-text dark:placeholder:text-ink-500"
          />
          {newItem.trim() && (
            <button
              type="button"
              onClick={addItem}
              className="text-accent-600 hover:text-accent-500 p-1 rounded-md"
              aria-label="Add item"
            >
              <PlusIcon className="w-4 h-4" />
            </button>
          )}
        </li>
      </ul>

      {/* Show more */}
      {list.items.length > COLLAPSED_LIMIT && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-xs font-medium text-accent-600 hover:text-accent-500"
        >
          {expanded ? 'Show less' : `Show more… (+${hiddenCount})`}
        </button>
      )}

      {/* Notes */}
      <div className="pt-2 border-t border-surface-200 dark:border-night-edge">
        {!showNotes && list.notes.trim() === '' ? (
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="inline-flex items-center gap-1.5 text-xs text-ink-500 dark:text-night-mute hover:text-ink-900 dark:hover:text-night-text"
          >
            <NoteIcon className="w-4 h-4" />
            Add notes
          </button>
        ) : (
          <div>
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-500 dark:text-night-mute mb-1">
              <NoteIcon className="w-3.5 h-3.5" />
              Notes
            </div>
            <EditableText
              value={list.notes}
              onChange={(t) => onUpdateList({ notes: t })}
              onEditingChange={(editing) => onEditingList?.(editing)}
              placeholder="Write a note…"
              multiline
              className="text-[14px] text-ink-700 dark:text-night-sub block w-full"
            />
          </div>
        )}
      </div>

      {/* Photos (below Notes) */}
      {list.photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
          {list.photos.map((photo) => (
            <div key={photo.id} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setLightboxUrl(photo.url)}
                className="block focus:outline-none"
                aria-label="View photo"
              >
                <img
                  src={photo.url}
                  alt=""
                  className="w-16 h-16 rounded-xl object-cover border border-surface-200 dark:border-night-edge bg-surface-100 dark:bg-night-edge cursor-zoom-in"
                />
              </button>
              <button
                type="button"
                onClick={() => onDeletePhoto(photo.id)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white dark:bg-night-card border border-surface-200 dark:border-night-edge grid place-items-center text-ink-500 dark:text-night-mute hover:text-ink-900 dark:hover:text-night-text shadow-card"
                aria-label="Remove photo"
              >
                <XIcon className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {lightboxUrl && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <img
            src={lightboxUrl}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full rounded-lg shadow-card object-contain"
          />
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/90 grid place-items-center text-ink-900 hover:bg-white"
            aria-label="Close"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      )}
    </section>
  )
}
