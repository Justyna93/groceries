import { useRef, useState } from 'react'
import type { GroceryList, BulletItem } from '../types'
import { EditableText } from './EditableText'
import { CameraIcon, NoteIcon, PlusIcon, TrashIcon, XIcon } from './Icons'

type Props = {
  list: GroceryList
  onChange: (next: GroceryList) => void
  onDelete: () => void
}

const COLLAPSED_LIMIT = 5

export function ListBlock({ list, onChange, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [newItem, setNewItem] = useState('')
  const [showNotes, setShowNotes] = useState(list.notes.trim() !== '')
  const fileRef = useRef<HTMLInputElement>(null)

  const update = (patch: Partial<GroceryList>) => onChange({ ...list, ...patch })

  const updateItem = (id: string, patch: Partial<BulletItem>) => {
    update({ items: list.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) })
  }

  const removeItem = (id: string) => {
    update({ items: list.items.filter((it) => it.id !== id) })
  }

  const addItem = () => {
    const t = newItem.trim()
    if (!t) return
    const item: BulletItem = {
      id: crypto.randomUUID(),
      text: t,
      done: false,
    }
    update({ items: [...list.items, item] })
    setNewItem('')
  }

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    Promise.all(
      files.map(
        (f) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.readAsDataURL(f)
          }),
      ),
    ).then((urls) => update({ photos: [...list.photos, ...urls] }))
    e.target.value = ''
  }

  const removePhoto = (idx: number) => {
    update({ photos: list.photos.filter((_, i) => i !== idx) })
  }

  const hiddenCount = Math.max(0, list.items.length - COLLAPSED_LIMIT)
  const visibleItems = expanded ? list.items : list.items.slice(0, COLLAPSED_LIMIT)

  // Pretty date like "Apr 20"
  const prettyDate = (() => {
    try {
      return new Date(list.date).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
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
          onChange={(t) => update({ title: t })}
          placeholder="Untitled list"
          className="font-semibold text-[17px] text-ink-900 dark:text-night-text truncate"
        />
        <div className="flex items-center gap-0.5 shrink-0">
          <input
            type="date"
            value={list.date}
            onChange={(e) => update({ date: e.target.value })}
            className="text-xs text-ink-500 dark:text-night-mute bg-transparent editable cursor-text w-[96px] mr-0.5 dark:[color-scheme:dark]"
            aria-label="Date"
          />
          <span className="hidden text-xs text-ink-500" aria-hidden>
            {prettyDate}
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
            onClick={onDelete}
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
          {list.photos.map((src, i) => (
            <div key={i} className="relative shrink-0">
              <img
                src={src}
                alt=""
                className="w-16 h-16 rounded-xl object-cover border border-surface-200 dark:border-night-edge"
              />
              <button
                type="button"
                onClick={() => removePhoto(i)}
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
              onClick={() => updateItem(item.id, { done: !item.done })}
              className={`mt-1.5 w-4 h-4 rounded-full border-[1.5px] shrink-0 transition ${
                item.done
                  ? 'bg-accent-500 border-accent-500'
                  : 'border-ink-400 hover:border-ink-700 dark:hover:border-night-sub'
              }`}
              aria-label={item.done ? 'Mark as not done' : 'Mark as done'}
            />
            <EditableText
              value={item.text}
              onChange={(t) => updateItem(item.id, { text: t })}
              placeholder="Item"
              className={`flex-1 text-[15px] ${
                item.done
                  ? 'line-through text-ink-400'
                  : 'text-ink-900 dark:text-night-text'
              }`}
            />
            <button
              type="button"
              onClick={() => removeItem(item.id)}
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
              onChange={(t) => update({ notes: t })}
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
