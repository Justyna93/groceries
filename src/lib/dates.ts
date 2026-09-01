/**
 * Today as `yyyy-mm-dd` in the *local* calendar, the format `<input
 * type="date">` and `lists.date` both speak.
 *
 * `new Date().toISOString().slice(0, 10)` answers in UTC, which is a day
 * behind between local midnight and 02:00/03:00 in Warsaw — long enough to
 * call today's list "past" and wipe its date, or to miss the shopping-day
 * push on a list dated today.
 */
export function todayIso(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
