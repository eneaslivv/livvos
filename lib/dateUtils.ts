/** Parse "YYYY-MM-DD" as LOCAL midnight (not UTC).
 *  `new Date("2026-03-18")` creates UTC midnight which shifts back one day
 *  in negative-UTC-offset timezones. This helper avoids that. */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Get today as "YYYY-MM-DD" in user's local timezone */
export function todayLocal(): string {
  return new Date().toLocaleDateString('en-CA');
}
