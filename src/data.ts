import type { GroceryList, Member } from './types'

export const initialMembers: Member[] = [
  { id: 'm1', email: 'you@family.com', name: 'You', initials: 'Y', online: true },
  { id: 'm2', email: 'alex@family.com', name: 'Alex', initials: 'A', online: true },
  { id: 'm3', email: 'sam@family.com', name: 'Sam', initials: 'S', online: false },
]

const today = new Date().toISOString().slice(0, 10)

export const initialLists: GroceryList[] = [
  {
    id: 'l1',
    title: 'Pharmacy',
    date: today,
    items: [
      { id: 'i1', text: 'Vitamin D', done: false },
      { id: 'i2', text: 'Toothpaste', done: true },
      { id: 'i3', text: 'Band-aids', done: false },
      { id: 'i4', text: 'Sunscreen SPF 50', done: false },
      { id: 'i5', text: 'Ibuprofen', done: false },
      { id: 'i6', text: 'Cough drops', done: false },
      { id: 'i7', text: 'Contact lens solution', done: false },
    ],
    notes: 'Ask pharmacist about allergy meds restock.',
    photos: [],
  },
  {
    id: 'l2',
    title: 'Bio market',
    date: today,
    items: [
      { id: 'i8', text: 'Organic apples', done: false },
      { id: 'i9', text: 'Whole-grain bread', done: false },
      { id: 'i10', text: 'Local honey', done: false },
    ],
    notes: '',
    photos: [],
  },
  {
    id: 'l3',
    title: 'Supermarket',
    date: today,
    items: [
      { id: 'i11', text: 'Milk', done: false },
      { id: 'i12', text: 'Eggs', done: false },
      { id: 'i13', text: 'Pasta', done: true },
      { id: 'i14', text: 'Olive oil', done: false },
    ],
    notes: '',
    photos: [],
  },
]
