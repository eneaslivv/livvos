/** Parse a date string as LOCAL midnight (not UTC).
 *  Accepts plain "YYYY-MM-DD" and ISO timestamps ("YYYY-MM-DDTHH:MM:SS...").
 *  Returns null for empty / malformed input so callers don't render "Invalid Date".
 *  `new Date("2026-03-18")` creates UTC midnight which shifts back one day
 *  in negative-UTC-offset timezones — this helper avoids that. */
export function parseLocalDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const datePart = dateStr.split('T')[0];
  const parts = datePart.split('-');
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Get today as "YYYY-MM-DD" in user's local timezone */
export function todayLocal(): string {
  return new Date().toLocaleDateString('en-CA');
}
