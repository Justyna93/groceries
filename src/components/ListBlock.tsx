import { useRef, useState } from 'react'
import type { GroceryList, BulletItem } from '../types'
import { EditableText } from './EditableText'
import { CameraIcon, NoteIcon, PlusIcon, TrashIcon, XIcon } from './Icons'

type Props = {
  list: GroceryList
  onUpdateList: (patch: { title?: string; date?: string; notes?: string }) => void
  onDeleteList: () => void
  onAddItem: (text: string) => void
  onUpdateItem: (id: string, patch: Partial<BulletItem>) => void
  onDeleteItem: (id: string) => void
  onAddPhoto: (file: File) => void
  onDeletePhoto: (id: string) => void
}

const COLLAPSED_LIMIT = 5

export function ListBlock({
  list,
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

  // Pretty date: "Today", "Tomorrow", or "DD mmm"
  const prettyDate = (() => {
    try {
      const d = new Date(list.date)
      if (Number.isNaN(d.getTime())) return list.date
      const startOfDay = (x: Date) =>
        new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
      const target = startOfDay(d)
      const today = startOfDay(new Date())
      const dayMs = 24 * 60 * 60 * 1000
      if (target === today) return 'Today'
      if (target === today + dayMs) return 'Tomorrow'
      return d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
      })
    } catch {
      return list.date
    }
  })()

  return (
    <section className="card p-4 space-y-3">
      {/* Header: title + date on same row */}
      <div className="flex items-baseline justify-between gap-3">
        <EditableText
          value={list.title}
          onChange={(t) => onUpdateList({ title: t })}
          placeholder="Untitled list"
          className="font-semibold text-[17px] text-ink-900 dark:text-night-text truncate"
        />
        <div className="flex items-center gap-0.5 shrink-0">
          <span className="relative inline-flex items-center mr-0.5">
            <span className="text-xs text-ink-500 dark:text-night-mute px-1 editable">
              {prettyDate}
            </span>
            <input
              type="date"
              value={list.date}
              onChange={(e) => onUpdateList({ date: e.target.value })}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer dark:[color-scheme:dark]"
              aria-label="Date"
            />
          </span>
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

      {/* Photos */}
      {list.photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
          {list.photos.map((photo) => (
            <div key={photo.id} className="relative shrink-0">
              <img
                src={photo.url}
                alt=""
                className="w-16 h-16 rounded-xl object-cover border border-surface-200 dark:border-night-edge bg-surface-100 dark:bg-night-edge"
              />
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
              placeholder="Item"
              className={`flex-1 text-[15px] ${
                item.done
                  ? 'line-through text-ink-400'
                  : 'text-ink-900 dark:text-night-text'
              }`}
            />
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
              placeholder="Write a note…"
              multiline
              className="text-[14px] text-ink-700 dark:text-night-sub block w-full"
            />
          </div>
        )}
      </div>
    </section>
  )
}
