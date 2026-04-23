import { TopBar } from './components/TopBar'
import { AddNewList } from './components/AddNewList'
import { ListBlock } from './components/ListBlock'
import { SignIn } from './components/SignIn'
import { useGroceryData } from './hooks/useGroceryData'
import { useSession } from './hooks/useSession'
import { supabase } from './lib/supabase'

export default function App() {
  const session = useSession()

  if (session.status === 'loading') {
    return (
      <div className="min-h-full flex items-center justify-center">
        <p className="text-sm text-ink-500 dark:text-night-mute">Loading…</p>
      </div>
    )
  }

  if (session.status === 'anonymous') {
    return <SignIn />
  }

  return <AuthenticatedApp userId={session.session.user.id} email={session.session.user.email ?? ''} />
}

function AuthenticatedApp({ userId, email }: { userId: string; email: string }) {
  const data = useGroceryData(userId)

  return (
    <div className="min-h-full flex flex-col">
      <TopBar
        members={data.members}
        currentEmail={email}
        onAddMember={data.addMember}
        onRemoveMember={data.removeMember}
      />

      <main className="flex-1 px-4 py-4 space-y-3">
        <AddNewList onAdd={data.addList} />
        {data.loading ? (
          <p className="text-center text-sm text-ink-500 dark:text-night-mute py-8">
            Loading lists…
          </p>
        ) : (
          <>
            {data.lists.map((list) => (
              <ListBlock
                key={list.id}
                list={list}
                onUpdateList={(patch) => data.updateList(list.id, patch)}
                onDeleteList={() => data.deleteList(list.id)}
                onAddItem={(text) => data.addItem(list.id, text)}
                onUpdateItem={data.updateItem}
                onDeleteItem={data.deleteItem}
                onAddPhoto={(file) => data.addPhoto(list.id, file)}
                onDeletePhoto={data.deletePhoto}
              />
            ))}
            {data.lists.length === 0 && (
              <p className="text-center text-sm text-ink-500 dark:text-night-mute py-8">
                No lists yet. Tap “Add New List” to start.
              </p>
            )}
          </>
        )}
      </main>

      <footer className="px-4 py-3 text-center">
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="text-xs text-ink-500 hover:underline dark:text-night-mute"
        >
          Sign out ({email})
        </button>
      </footer>
    </div>
  )
}
