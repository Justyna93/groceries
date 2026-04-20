import { PlusIcon } from './Icons'

type Props = { onAdd: () => void }

export function AddNewList({ onAdd }: Props) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="w-full card flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-50 dark:hover:bg-surface-700 transition"
    >
      <span className="w-8 h-8 rounded-full bg-surface-100 dark:bg-night-edge grid place-items-center text-ink-700 dark:text-night-sub">
        <PlusIcon className="w-[18px] h-[18px]" />
      </span>
      <span className="text-sm font-medium text-ink-700 dark:text-night-sub">Add New List</span>
    </button>
  )
}
