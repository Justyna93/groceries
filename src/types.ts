export type Member = {
  id: string
  email: string
  name: string
  initials: string
  online: boolean
  /** True until the invite is accepted. */
  pending?: boolean
  /** ISO timestamp of the last heartbeat we recorded. Null until their first session. */
  lastSeenAt?: string | null
}

export type BulletItem = {
  id: string
  text: string
  done: boolean
}

export type ListPhoto = {
  id: string
  url: string
}

export type GroceryList = {
  id: string
  title: string
  date: string // ISO yyyy-mm-dd
  items: BulletItem[]
  notes: string
  photos: ListPhoto[]
}
