import { describe, expect, it } from 'vitest';
import {
  filterByPeriod,
  historyMonths,
  historyYears,
  lastNWeeks,
  monthlyRollup,
  summarize,
} from '../src/features/history/insights';
import type { HistoryEntry } from '../src/lib/schema';

function entry(weekStart: string, amountPaidCents: number, minutes = 600): HistoryEntry {
  return {
    weekStart,
    minutes,
    wagesCents: amountPaidCents,
    fuelCents: 0,
    bonusCents: 0,
    carryoverCents: 0,
    totalCents: amountPaidCents,
    amountPaidCents,
    shortfallCents: 0,
    paidDateLabel: '',
    paidAt: null,
  };
}

// Fixed "now": Friday Jul 31 2026 (current week starts Sat Jul 25).
const NOW = new Date(2026, 6, 31, 12, 0);

describe('summarize', () => {
  it('buckets this-month / ytd / all-time by amountPaid', () => {
    const s = summarize(
      [entry('2026-07-18', 54000), entry('2026-06-20', 30000), entry('2025-12-27', 10000)],
      [],
      NOW,
    );
    expect(s.thisMonthCents).toBe(54000);
    expect(s.ytdCents).toBe(84000);
    expect(s.allTimeCents).toBe(94000);
    expect(s.priorCents).toBe(0);
  });

  it('folds imported prior payments into every window they fall in', () => {
    const s = summarize(
      [entry('2026-07-18', 54000)],
      [
        { dateKey: '2026-01-23', amountCents: 340000, label: 'Customer Withdrawal' },
        { dateKey: '2025-06-06', amountCents: 200000, label: 'ATM Withdrawal' },
      ],
      NOW,
    );
    expect(s.allTimeCents).toBe(54000 + 340000 + 200000);
    expect(s.ytdCents).toBe(54000 + 340000); // 2026 rows only
    expect(s.thisMonthCents).toBe(54000); // no prior rows in July 2026
    expect(s.priorCents).toBe(540000);
  });
});

describe('lastNWeeks', () => {
  it('produces N contiguous Saturday buckets ending at the current week', () => {
    const points = lastNWeeks([entry('2026-07-18', 54000)], 12, NOW);
    expect(points).toHaveLength(12);
    expect(points[11].weekStart).toBe('2026-07-25'); // current week
    expect(points[10].weekStart).toBe('2026-07-18');
    expect(points[10].payCents).toBe(54000);
    expect(points[11].payCents).toBe(0);
  });

  it('sums multiple entries in the same week', () => {
    const points = lastNWeeks(
      [entry('2026-07-18', 10000), entry('2026-07-18', 5000)],
      2,
      NOW,
    );
    expect(points[0].payCents).toBe(15000);
  });
});

describe('monthlyRollup', () => {
  it('produces N contiguous month buckets ending at the current month', () => {
    const points = monthlyRollup(
      [entry('2026-07-18', 54000), entry('2026-01-03', 20000)],
      12,
      NOW,
    );
    expect(points).toHaveLength(12);
    expect(points[11].month).toBe('2026-07');
    expect(points[11].payCents).toBe(54000);
    expect(points[5].month).toBe('2026-01');
    expect(points[5].payCents).toBe(20000);
  });

  it('merges prior payments into month buckets with zero minutes', () => {
    const points = monthlyRollup(
      [entry('2026-01-03', 20000, 600)],
      12,
      NOW,
      [{ dateKey: '2026-01-23', amountCents: 340000, label: 'Customer Withdrawal' }],
    );
    const jan = points.find((p) => p.month === '2026-01')!;
    expect(jan.payCents).toBe(20000 + 340000);
    expect(jan.minutes).toBe(600); // prior rows contribute no hours
  });
});

describe('filters', () => {
  const entries: Array<[string, HistoryEntry]> = [
    ['a', entry('2026-07-18', 1)],
    ['b', entry('2026-06-20', 2)],
    ['c', entry('2025-12-27', 3)],
  ];

  it('lists years newest-first and months ascending', () => {
    const all = entries.map(([, e]) => e);
    expect(historyYears(all)).toEqual([2026, 2025]);
    expect(historyMonths(all, 2026)).toEqual([5, 6]); // Jun, Jul
  });

  it('filters by year and month', () => {
    expect(filterByPeriod(entries, 'all', 'all')).toHaveLength(3);
    expect(filterByPeriod(entries, 2026, 'all')).toHaveLength(2);
    expect(filterByPeriod(entries, 2026, 6).map(([id]) => id)).toEqual(['a']);
    expect(filterByPeriod(entries, 2025, 11).map(([id]) => id)).toEqual(['c']);
  });
});
