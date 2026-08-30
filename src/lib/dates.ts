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

/** Round "HH:MM" to the nearest 15 minutes (pay-period convention), clamped
 * inside the same day. Applied when times are ENTERED (punch, suggestion
 * apply); displayed detections stay at finer precision. */
export function roundToNearest15(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  let total = Math.round((h * 60 + m) / 15) * 15;
  if (total >= 24 * 60) total = 24 * 60 - 15;
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

const MONTH_ABBR = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
] as const;

/** Inverse of formatFull: "Mar 6, 2026" → local-midnight epoch ms, or null
 * when the text isn't a date the app wrote (v1 rows carry free-form labels
 * like "Last Friday"). Ledger rows migrated from v1 have no epoch timestamp,
 * so their display label is the only date they can be ordered by. */
export function parseFullDateLabel(label: string): number | null {
  const m = /^\s*([A-Za-z]{3,})\.?\s+(\d{1,2}),\s*(\d{4})\s*$/.exec(label);
  if (!m) return null;
  const month = MONTH_ABBR.indexOf(
    m[1].slice(0, 3).toLowerCase() as (typeof MONTH_ABBR)[number],
  );
  if (month < 0) return null;
  const day = Number(m[2]);
  if (day < 1 || day > 31) return null;
  const d = new Date(Number(m[3]), month, day);
  return d.getMonth() === month && d.getDate() === day ? d.getTime() : null;
}
