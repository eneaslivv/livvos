const LOCALE = 'es-AR';
const TIMEZONE = 'America/Argentina/Buenos_Aires';

const timeFmt = new Intl.DateTimeFormat(LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: TIMEZONE,
});

const dayMonthFmt = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: 'short',
  timeZone: TIMEZONE,
});

const fullDateFmt = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: TIMEZONE,
});

const weekdayFmt = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'long',
  timeZone: TIMEZONE,
});

function isoDayKey(d: Date): string {
  // YYYY-MM-DD in Buenos Aires, for comparing "same day"
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  return parts;
}

// Short relative label used in notification rows: "Hace 3 min", "Hace 2 h",
// "Ayer 14:32", "12 abr 09:14". Argentina timezone.
export function formatNotificationTime(dateString: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 30) return 'Recién';
  if (diffSec < 60) return `Hace ${diffSec} s`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Hace ${diffMin} min`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 12) return `Hace ${diffHr} h`;

  const today = isoDayKey(now);
  const dayOfDate = isoDayKey(date);

  if (dayOfDate === today) return `Hoy ${timeFmt.format(date)}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayOfDate === isoDayKey(yesterday)) return `Ayer ${timeFmt.format(date)}`;

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 7) return `${weekdayFmt.format(date)} ${timeFmt.format(date)}`;

  return `${dayMonthFmt.format(date)} ${timeFmt.format(date)}`;
}

// Full timestamp for hover tooltips / detail views: "23 de abril de 2026, 14:32"
export function formatNotificationFullDate(dateString: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  return fullDateFmt.format(date);
}

// Just the time in Buenos Aires, e.g. "14:32" — used as an accent in the toast.
export function formatNotificationClock(dateString: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  return timeFmt.format(date);
}
