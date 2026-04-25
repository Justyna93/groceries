import { useEffect, useRef, useState } from 'react'

type Props = {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  className?: string
  multiline?: boolean
  /** Called when Enter is pressed (only if not multiline). Return false to keep editing. */
  onEnter?: () => void
  /** Fires when the editing state flips (true on focus, false on commit/cancel). */
  onEditingChange?: (editing: boolean) => void
}

/**
 * Click-to-edit text. Renders a span by default and swaps to an input/textarea on click.
 * Commits on blur or Enter (for single-line).
 */
export function EditableText({
  value,
  onChange,
  placeholder,
  className = '',
  multiline = false,
  onEnter,
  onEditingChange,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  useEffect(() => setDraft(value), [value])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      if ('select' in inputRef.current) inputRef.current.select()
    }
  }, [editing])

  // Cleanup: notify parent we stopped editing if unmounted mid-edit.
  useEffect(() => {
    return () => {
      if (editing) onEditingChange?.(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startEditing = () => {
    setEditing(true)
    onEditingChange?.(true)
  }

  const stopEditing = () => {
    setEditing(false)
    onEditingChange?.(false)
  }

  const commit = () => {
    stopEditing()
    if (draft !== value) onChange(draft)
  }

  if (!editing) {
    const empty = value.trim() === ''
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={startEditing}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            startEditing()
          }
        }}
        className={`editable cursor-text inline-block ${empty ? 'text-ink-400' : ''} ${className}`}
      >
        {empty ? placeholder ?? 'Click to edit' : value}
      </span>
    )
  }

  if (multiline) {
    return (
      <textarea
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        placeholder={placeholder}
        className={`editable w-full resize-none bg-white border border-accent-500/40 px-2 py-1.5 outline-none ${className}`}
        rows={3}
      />
    )
  }

  return (
    <input
      ref={inputRef as React.RefObject<HTMLInputElement>}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
          onEnter?.()
        } else if (e.key === 'Escape') {
          setDraft(value)
          stopEditing()
        }
      }}
      placeholder={placeholder}
      className={`editable bg-white border border-accent-500/40 outline-none ${className}`}
    />
  )
}
