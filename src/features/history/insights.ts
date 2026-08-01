// Pure rollups feeding the insights header and charts. All bucketing is by
// weekStart (local-calendar keys), which every entry has; paidAt refines the
// summary windows when present.

import type { HistoryEntry, PriorPayment } from '../../lib/schema';
import {
  currentWeekSaturday,
  formatShort,
  parseDateKey,
  toLocalDateKey,
} from '../../lib/dates';

export interface WeekPoint {
  weekStart: string;
  label: string;
  payCents: number;
  minutes: number;
}

export interface MonthPoint {
  month: string; // YYYY-MM
  label: string;
  payCents: number;
  minutes: number;
}

export interface Summary {
  thisMonthCents: number;
  ytdCents: number;
  allTimeCents: number;
  /** Portion of allTimeCents that came from imported pre-app bank records. */
  priorCents: number;
}

function entryDate(e: HistoryEntry): Date | null {
  if (e.paidAt) return new Date(e.paidAt);
  if (e.weekStart) return parseDateKey(e.weekStart);
  return null;
}

export function summarize(
  entries: HistoryEntry[],
  prior: PriorPayment[] = [],
  now = new Date(),
): Summary {
  let thisMonthCents = 0;
  let ytdCents = 0;
  let allTimeCents = 0;
  let priorCents = 0;
  const bucket = (d: Date | null, cents: number) => {
    allTimeCents += cents;
    if (!d) return;
    if (d.getFullYear() === now.getFullYear()) {
      ytdCents += cents;
      if (d.getMonth() === now.getMonth()) thisMonthCents += cents;
    }
  };
  for (const e of entries) bucket(entryDate(e), e.amountPaidCents);
  for (const p of prior) {
    priorCents += p.amountCents;
    bucket(p.dateKey ? parseDateKey(p.dateKey) : null, p.amountCents);
  }
  return { thisMonthCents, ytdCents, allTimeCents, priorCents };
}

/** The N most recent Sat-anchored weeks (oldest first), summed per week. */
export function lastNWeeks(
  entries: HistoryEntry[],
  n: number,
  now = new Date(),
): WeekPoint[] {
  const sums = new Map<string, { payCents: number; minutes: number }>();
  for (const e of entries) {
    if (!e.weekStart) continue;
    const s = sums.get(e.weekStart) ?? { payCents: 0, minutes: 0 };
    s.payCents += e.amountPaidCents;
    s.minutes += e.minutes;
    sums.set(e.weekStart, s);
  }
  const points: WeekPoint[] = [];
  const sat = currentWeekSaturday(now);
  sat.setDate(sat.getDate() - 7 * (n - 1));
  for (let i = 0; i < n; i++) {
    const key = toLocalDateKey(sat);
    const s = sums.get(key);
    points.push({
      weekStart: key,
      label: formatShort(new Date(sat)),
      payCents: s?.payCents ?? 0,
      minutes: s?.minutes ?? 0,
    });
    sat.setDate(sat.getDate() + 7);
  }
  return points;
}

/** The N most recent calendar months (oldest first), summed per month.
 * Imported pre-app payments contribute pay (but no minutes — hours were
 * never recorded for them). */
export function monthlyRollup(
  entries: HistoryEntry[],
  n: number,
  now = new Date(),
  prior: PriorPayment[] = [],
): MonthPoint[] {
  const sums = new Map<string, { payCents: number; minutes: number }>();
  const add = (key: string, payCents: number, minutes: number) => {
    const s = sums.get(key) ?? { payCents: 0, minutes: 0 };
    s.payCents += payCents;
    s.minutes += minutes;
    sums.set(key, s);
  };
  for (const e of entries) {
    if (!e.weekStart) continue;
    const d = parseDateKey(e.weekStart);
    add(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      e.amountPaidCents,
      e.minutes,
    );
  }
  for (const p of prior) {
    if (!p.dateKey) continue;
    const d = parseDateKey(p.dateKey);
    add(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      p.amountCents,
      0,
    );
  }
  const points: MonthPoint[] = [];
  const cursor = new Date(now.getFullYear(), now.getMonth() - (n - 1), 1);
  for (let i = 0; i < n; i++) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    const s = sums.get(key);
    points.push({
      month: key,
      label: cursor.toLocaleDateString('en-US', { month: 'short' }),
      payCents: s?.payCents ?? 0,
      minutes: s?.minutes ?? 0,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return points;
}

/** Distinct years present in history, newest first. */
export function historyYears(entries: HistoryEntry[]): number[] {
  const years = new Set<number>();
  for (const e of entries) {
    if (e.weekStart) years.add(parseDateKey(e.weekStart).getFullYear());
  }
  return [...years].sort((a, b) => b - a);
}

/** Months (0–11) present for a given year, ascending. */
export function historyMonths(entries: HistoryEntry[], year: number): number[] {
  const months = new Set<number>();
  for (const e of entries) {
    if (!e.weekStart) continue;
    const d = parseDateKey(e.weekStart);
    if (d.getFullYear() === year) months.add(d.getMonth());
  }
  return [...months].sort((a, b) => a - b);
}

export function filterByPeriod(
  entries: Array<[string, HistoryEntry]>,
  year: number | 'all',
  month: number | 'all',
): Array<[string, HistoryEntry]> {
  if (year === 'all') return entries;
  return entries.filter(([, e]) => {
    if (!e.weekStart) return false;
    const d = parseDateKey(e.weekStart);
    if (d.getFullYear() !== year) return false;
    return month === 'all' || d.getMonth() === month;
  });
}
