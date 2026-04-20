import { useState } from 'react'
import { TopBar } from './components/TopBar'
import { AddNewList } from './components/AddNewList'
import { ListBlock } from './components/ListBlock'
import { initialLists, initialMembers } from './data'
import type { GroceryList, Member } from './types'

export default function App() {
  const [members, setMembers] = useState<Member[]>(initialMembers)
  const [lists, setLists] = useState<GroceryList[]>(initialLists)

  const addList = () => {
    const list: GroceryList = {
      id: crypto.randomUUID(),
      title: 'New list',
      date: new Date().toISOString().slice(0, 10),
      items: [],
      notes: '',
      photos: [],
    }
    setLists((prev) => [list, ...prev])
  }

  const updateList = (id: string, next: GroceryList) => {
    setLists((prev) => prev.map((l) => (l.id === id ? next : l)))
  }

  const deleteList = (id: string) => {
    setLists((prev) => prev.filter((l) => l.id !== id))
  }

  const addMember = (email: string) => {
    // Derive a placeholder display name & initials from the email local-part
    // until the invitee accepts and we get their real profile.
    const local = email.split('@')[0] ?? email
    const name = local
      .split(/[._-]/)
      .filter(Boolean)
      .map((p) => p[0]!.toUpperCase() + p.slice(1))
      .join(' ') || email
    const initials = local.slice(0, 2).toUpperCase()
    setMembers((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        email,
        name,
        initials,
        online: false,
        pending: true,
      },
    ])
  }

  const removeMember = (id: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== id))
  }

  return (
    <div className="min-h-full flex flex-col">
      <TopBar
        members={members}
        onAddMember={addMember}
        onRemoveMember={removeMember}
      />

      <main className="flex-1 px-4 py-4 space-y-3">
        <AddNewList onAdd={addList} />
        {lists.map((list) => (
          <ListBlock
            key={list.id}
            list={list}
            onChange={(next) => updateList(list.id, next)}
            onDelete={() => deleteList(list.id)}
          />
        ))}
        {lists.length === 0 && (
          <p className="text-center text-sm text-ink-500 dark:text-night-mute py-8">
            No lists yet. Tap “Add New List” to start.
          </p>
        )}
      </main>
    </div>
  )
}
