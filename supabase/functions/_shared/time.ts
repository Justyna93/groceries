// The household's wall clock. Everything user-facing about "today" and "9am"
// is in this timezone, never UTC or the server's locale.
export const TIMEZONE = 'Europe/Warsaw'

/**
 * `yyyy-mm-dd` for an instant in TIMEZONE — the format `lists.date` stores.
 *
 * `new Date().toISOString().slice(0, 10)` would answer in UTC, which is a day
 * behind between local midnight and 02:00/03:00 here. A list dated today by
 * someone shopping-planning at 00:30 would not be found by a query for
 * `date = <UTC today>`.
 */
export function localDate(at: Date = new Date()): string {
  // en-CA formats dates as yyyy-mm-dd.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

/** Hour of day, 0–23, for an instant in TIMEZONE. */
export function localHour(at: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TIMEZONE,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(at),
  )
}
