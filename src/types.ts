export type Member = {
  id: string
  email: string
  name: string
  initials: string
  online: boolean
  /** True until the invite is accepted. */
  pending?: boolean
}

export type BulletItem = {
  id: string
  text: string
  done: boolean
}

export type GroceryList = {
  id: string
  title: string
  date: string // ISO yyyy-mm-dd
  items: BulletItem[]
  notes: string
  photos: string[] // data URLs
}
