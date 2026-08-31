import { describe, expect, it } from 'vitest';
import { computePay, invalidDayKeys, weekTotals } from '../src/lib/pay';
import {
  BILLS,
  breakdownTotalCents,
  cashTotalCents,
  subtractBreakdown,
  type BillCounts,
} from '../src/lib/money';
import type { DayEntry, Settings } from '../src/lib/schema';

const SETTINGS: Settings = {
  hourlyRateCents: 2200,
  fuelRateCents: 1000,
  paydayDay: 5,
};

function day(start: string, end: string, fuel = true, breakMinutes?: number): DayEntry {
  return { start, end, fuel, breakMinutes };
}

/** Mon–Fri 08:00–17:00 with fuel: 45 hours, 5 fuel days. */
const FULL_WEEK: Record<string, DayEntry> = {
  '2026-08-24': day('08:00', '17:00'),
  '2026-08-25': day('08:00', '17:00'),
  '2026-08-26': day('08:00', '17:00'),
  '2026-08-27': day('08:00', '17:00'),
  '2026-08-28': day('08:00', '17:00'),
};

describe('weekTotals', () => {
  it('adds up hours, wages and fuel', () => {
    const t = weekTotals(FULL_WEEK, SETTINGS);
    expect(t.minutes).toBe(45 * 60);
    expect(t.fuelDays).toBe(5);
    expect(t.wagesCents).toBe(99000); // 45h × $22
    expect(t.fuelCents).toBe(5000); // 5 × $10
  });

  it('deducts unpaid breaks from the day', () => {
    const t = weekTotals({ d: day('08:00', '17:00', true, 30) }, SETTINGS);
    expect(t.minutes).toBe(510); // 8.5h
    expect(t.wagesCents).toBe(18700);
  });

  it('rounds fractional cents once, at the week total', () => {
    // 8h20m at $22/hr = $183.3333 → 18333c, not 18334 or a float.
    const t = weekTotals({ d: day('08:00', '16:20', false) }, SETTINGS);
    expect(t.minutes).toBe(500);
    expect(t.wagesCents).toBe(18333);
  });

  it('pays nothing for a day whose end is not after its start', () => {
    const t = weekTotals({ d: day('17:00', '08:00', false) }, SETTINGS);
    expect(t.minutes).toBe(0);
    expect(t.wagesCents).toBe(0);
  });

  it('never lets a break push a day negative', () => {
    const t = weekTotals({ d: day('08:00', '09:00', false, 90) }, SETTINGS);
    expect(t.minutes).toBe(0);
  });
});

describe('computePay', () => {
  const drawer: BillCounts = { '100': 2, '50': 1, '20': 2, '10': 1, '5': 1 };

  it('owes wages + fuel + bonus + carryover', () => {
    const calc = computePay(
      FULL_WEEK,
      SETTINGS,
      { bonusCents: 5000, carryoverCents: 2500 },
      drawer,
    );
    expect(calc.totalCents).toBe(99000 + 5000 + 5000 + 2500);
    expect(calc.totalCents).toBe(111500);
  });

  it('pays what the drawer holds and carries the rest over', () => {
    const calc = computePay(
      FULL_WEEK,
      SETTINGS,
      { bonusCents: 0, carryoverCents: 0 },
      drawer,
    );
    expect(calc.totalCents).toBe(104000); // $1,040 owed
    expect(cashTotalCents(drawer)).toBe(30500); // only $305 in the drawer
    expect(calc.paidCents).toBe(30500); // every bill goes out
    expect(calc.shortfallCents).toBe(73500);
  });

  it('leaves a sub-$5 remainder as shortfall — no bill can cover it', () => {
    const calc = computePay(
      { d: day('08:00', '16:20', false) },
      SETTINGS,
      { bonusCents: 0, carryoverCents: 0 },
      { '100': 5, '50': 5, '20': 5, '10': 5, '5': 5 },
    );
    expect(calc.totalCents).toBe(18333);
    // Bills only make multiples of $5, so $180 is the most that can be paid.
    expect(calc.paidCents).toBe(18000);
    expect(calc.shortfallCents).toBe(333);
  });

  it('counts fuel for a flagged day even when no hours were logged', () => {
    // Documents current behaviour: the fuel switch is independent of hours.
    const calc = computePay(
      { d: { start: '', end: '', fuel: true } },
      SETTINGS,
      { bonusCents: 0, carryoverCents: 0 },
      { '5': 2 },
    );
    expect(calc.minutes).toBe(0);
    expect(calc.fuelCents).toBe(1000);
    expect(calc.totalCents).toBe(1000);
  });
});

describe('payment conserves cash', () => {
  const cases: Array<[string, BillCounts, number]> = [
    ['exact cover', { '100': 10, '50': 2, '20': 2, '10': 1, '5': 1 }, 0],
    ['tight drawer', { '20': 3, '5': 1 }, 0],
    ['empty drawer', {}, 0],
    ['with carryover', { '100': 3, '20': 1 }, 12345],
  ];

  it.each(cases)('%s: drawer drops by exactly what was paid', (_name, drawer, carry) => {
    const calc = computePay(
      FULL_WEEK,
      SETTINGS,
      { bonusCents: 0, carryoverCents: carry },
      drawer,
    );

    // What the payment record says was handed over…
    expect(breakdownTotalCents(calc.breakdown)).toBe(calc.paidCents);
    // …matches what leaves the drawer.
    const after = subtractBreakdown(drawer, calc.breakdown);
    expect(cashTotalCents(drawer) - cashTotalCents(after)).toBe(calc.paidCents);
    // No bill count goes negative, and nothing is paid that isn't owed.
    for (const b of BILLS) expect(after[String(b)] ?? 0).toBeGreaterThanOrEqual(0);
    expect(calc.paidCents).toBeLessThanOrEqual(calc.totalCents);
    // Owed = paid now + carried to next week.
    expect(calc.paidCents + calc.shortfallCents).toBe(calc.totalCents);
  });

  it('a shortfall paid next week settles the full amount', () => {
    const week1 = computePay(
      FULL_WEEK,
      SETTINGS,
      { bonusCents: 0, carryoverCents: 0 },
      { '100': 5 },
    );
    expect(week1.paidCents).toBe(50000);
    expect(week1.shortfallCents).toBe(54000);

    // Next week: nothing worked, carryover only, drawer refilled.
    const week2 = computePay(
      {},
      SETTINGS,
      { bonusCents: 0, carryoverCents: week1.shortfallCents },
      { '100': 5, '20': 2 },
    );
    expect(week2.totalCents).toBe(54000);
    expect(week2.paidCents).toBe(54000);
    expect(week2.shortfallCents).toBe(0);
    expect(week1.paidCents + week2.paidCents).toBe(104000);
  });
});

describe('invalidDayKeys', () => {
  it('flags a day whose end is not after its start', () => {
    expect(
      invalidDayKeys({
        '2026-08-24': day('08:00', '17:00'),
        '2026-08-25': day('17:00', '08:00'), // reversed
        '2026-08-26': day('09:00', '09:00'), // zero length
      }),
    ).toEqual(['2026-08-25', '2026-08-26']);
  });

  it('leaves unfinished and empty days alone', () => {
    expect(
      invalidDayKeys({
        '2026-08-24': day('08:00', ''), // punched in, still working
        '2026-08-25': day('', '17:00'),
        '2026-08-26': { start: '', end: '', fuel: true },
      }),
    ).toEqual([]);
  });
});

describe('deleting a payment returns what it took', () => {
  it('restores the drawer to its pre-payment state', () => {
    const before: BillCounts = { '100': 4, '50': 1, '20': 3, '10': 2, '5': 2 };
    const calc = computePay(
      FULL_WEEK,
      SETTINGS,
      { bonusCents: 0, carryoverCents: 0 },
      before,
    );
    const after = subtractBreakdown(before, calc.breakdown);

    // Deleting the history entry hands the same bills back.
    const restored: BillCounts = { ...after };
    for (const [bill, used] of Object.entries(calc.breakdown)) {
      restored[bill] = (restored[bill] ?? 0) + used;
    }

    expect(restored).toEqual(before);
    expect(breakdownTotalCents(calc.breakdown)).toBe(calc.paidCents);
    expect(cashTotalCents(restored) - cashTotalCents(after)).toBe(calc.paidCents);
  });
});
