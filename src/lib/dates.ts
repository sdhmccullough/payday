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

/** Current local time as "HH:MM" (exact minutes — punch is ground truth). */
export function nowHHMM(d = new Date()): string {
  return (
    String(d.getHours()).padStart(2, '0') +
    ':' +
    String(d.getMinutes()).padStart(2, '0')
  );
}

/** Round "HH:MM" to the nearest 5 minutes, clamped inside the same day.
 * Used for presence-detected suggestions (estimates), never for punches. */
export function roundToNearest5(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  let total = Math.round((h * 60 + m) / 5) * 5;
  if (total >= 24 * 60) total = 24 * 60 - 5;
  return (
    String(Math.floor(total / 60)).padStart(2, '0') +
    ':' +
    String(total % 60).padStart(2, '0')
  );
}

/** "HH:MM" → "7:58 AM" for display. */
export function formatHHMM12(hhmm: string): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/** Minutes between two "HH:MM" strings; overnight wraps are rejected upstream. */
export function minutesBetween(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff > 0 ? diff : 0;
}
