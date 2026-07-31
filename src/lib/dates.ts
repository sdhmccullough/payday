// Date helpers. All keys use the LOCAL calendar date — never
// toISOString(), which converts to UTC first and shifts the date across
// midnight for UTC+ timezones (the source of the v1 week-wipe bug).

export const DAY_NAMES = [
  'Saturday',
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
] as const;

/** Indices into the Sat-anchored week for Mon–Fri. */
export const WEEKDAY_INDICES = [2, 3, 4, 5, 6] as const;

export function toLocalDateKey(d: Date): string {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

/** Most recent Saturday at local midnight (weeks run Sat–Fri). */
export function currentWeekSaturday(now = new Date()): Date {
  const day = now.getDay();
  const diff = day === 6 ? 0 : -(day + 1);
  const sat = new Date(now);
  sat.setDate(now.getDate() + diff);
  sat.setHours(0, 0, 0, 0);
  return sat;
}

export function currentWeekStart(now = new Date()): string {
  return toLocalDateKey(currentWeekSaturday(now));
}

/** Date for day `index` (0–6) of the week starting at `weekStart`. */
export function weekDayDate(weekStart: string, index: number): Date {
  const d = parseDateKey(weekStart);
  d.setDate(d.getDate() + index);
  return d;
}

export function weekDayKey(weekStart: string, index: number): string {
  return toLocalDateKey(weekDayDate(weekStart, index));
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatFull(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function weekLabel(weekStart: string): string {
  const sat = parseDateKey(weekStart);
  const fri = new Date(sat);
  fri.setDate(sat.getDate() + 6);
  return `${formatShort(sat)} – ${formatShort(fri)}`;
}

/** Minutes between two "HH:MM" strings; overnight wraps are rejected upstream. */
export function minutesBetween(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff > 0 ? diff : 0;
}
