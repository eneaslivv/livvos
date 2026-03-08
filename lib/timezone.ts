/** Extracts city name from IANA timezone string (e.g. "America/New_York" → "New York") */
export const tzCity = (tz: string): string => {
  const parts = tz.split('/');
  return (parts[parts.length - 1] || tz).replace(/_/g, ' ');
};

/** Returns current time in a timezone as HH:MM string */
export const tzNow = (tz: string): string => {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: tz,
    }).format(new Date());
  } catch {
    return '--:--';
  }
};

/** Converts a local hour (0-23) to the equivalent time in a target timezone.
 *  Returns { time: "HH:MM", dayOffset: 0 | 1 | -1 } */
export const convertHourToTz = (
  hour: number,
  targetTz: string
): { time: string; dayOffset: number } => {
  try {
    const now = new Date();
    const local = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0);

    const localDay = local.getDate();
    const targetStr = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      day: 'numeric',
      hour12: false,
      timeZone: targetTz,
    }).format(local);

    // Format is "DD, HH:MM"
    const [dayPart, timePart] = targetStr.split(', ');
    const targetDay = parseInt(dayPart, 10);
    const dayOffset = targetDay - localDay;

    return { time: timePart || targetStr, dayOffset };
  } catch {
    return { time: '--:--', dayOffset: 0 };
  }
};

/** Short abbreviation for a timezone (e.g. "EST", "CET") */
export const tzAbbr = (tz: string): string => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
    }).formatToParts(new Date());
    return parts.find(p => p.type === 'timeZoneName')?.value || tzCity(tz);
  } catch {
    return tzCity(tz);
  }
};

export interface TimezoneGroup {
  group: string;
  zones: Array<{ value: string; label: string }>;
}

export const TIMEZONE_OPTIONS: TimezoneGroup[] = [
  {
    group: 'Americas',
    zones: [
      { value: 'America/New_York', label: 'New York (EST/EDT)' },
      { value: 'America/Chicago', label: 'Chicago (CST/CDT)' },
      { value: 'America/Denver', label: 'Denver (MST/MDT)' },
      { value: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT)' },
      { value: 'America/Anchorage', label: 'Anchorage (AKST/AKDT)' },
      { value: 'Pacific/Honolulu', label: 'Honolulu (HST)' },
      { value: 'America/Toronto', label: 'Toronto (EST/EDT)' },
      { value: 'America/Vancouver', label: 'Vancouver (PST/PDT)' },
      { value: 'America/Mexico_City', label: 'Mexico City (CST/CDT)' },
      { value: 'America/Bogota', label: 'Bogota (COT)' },
      { value: 'America/Lima', label: 'Lima (PET)' },
      { value: 'America/Santiago', label: 'Santiago (CLT/CLST)' },
      { value: 'America/Buenos_Aires', label: 'Buenos Aires (ART)' },
      { value: 'America/Sao_Paulo', label: 'Sao Paulo (BRT/BRST)' },
    ],
  },
  {
    group: 'Europe',
    zones: [
      { value: 'Europe/London', label: 'London (GMT/BST)' },
      { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
      { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
      { value: 'Europe/Madrid', label: 'Madrid (CET/CEST)' },
      { value: 'Europe/Rome', label: 'Rome (CET/CEST)' },
      { value: 'Europe/Amsterdam', label: 'Amsterdam (CET/CEST)' },
      { value: 'Europe/Zurich', label: 'Zurich (CET/CEST)' },
      { value: 'Europe/Stockholm', label: 'Stockholm (CET/CEST)' },
      { value: 'Europe/Moscow', label: 'Moscow (MSK)' },
      { value: 'Europe/Istanbul', label: 'Istanbul (TRT)' },
    ],
  },
  {
    group: 'Asia & Pacific',
    zones: [
      { value: 'Asia/Dubai', label: 'Dubai (GST)' },
      { value: 'Asia/Kolkata', label: 'Mumbai/Kolkata (IST)' },
      { value: 'Asia/Bangkok', label: 'Bangkok (ICT)' },
      { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
      { value: 'Asia/Hong_Kong', label: 'Hong Kong (HKT)' },
      { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
      { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
      { value: 'Asia/Seoul', label: 'Seoul (KST)' },
      { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
      { value: 'Australia/Melbourne', label: 'Melbourne (AEST/AEDT)' },
      { value: 'Pacific/Auckland', label: 'Auckland (NZST/NZDT)' },
    ],
  },
  {
    group: 'Africa & Middle East',
    zones: [
      { value: 'Africa/Cairo', label: 'Cairo (EET)' },
      { value: 'Africa/Lagos', label: 'Lagos (WAT)' },
      { value: 'Africa/Johannesburg', label: 'Johannesburg (SAST)' },
      { value: 'Africa/Nairobi', label: 'Nairobi (EAT)' },
      { value: 'Asia/Riyadh', label: 'Riyadh (AST)' },
      { value: 'Asia/Tehran', label: 'Tehran (IRST/IRDT)' },
    ],
  },
];
