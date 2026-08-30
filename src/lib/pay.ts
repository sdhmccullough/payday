// The one place a week turns into money. The timesheet footer, the Save & Pay
// dialog, and the commit that writes history all read from here, so what the
// household is shown is always what gets paid and what gets recorded.

import { dayMinutes, type DayEntry, type Settings } from './schema';
import { billBreakdown, type BillBreakdown, type BillCounts, type Cents } from './money';

export interface WeekTotals {
  /** Paid minutes across the week (each day's span minus its unpaid break). */
  minutes: number;
  /** Days flagged for the flat fuel reimbursement. */
  fuelDays: number;
  wagesCents: Cents;
  fuelCents: Cents;
}

export interface PayComputation extends WeekTotals {
  bonusCents: Cents;
  carryoverCents: Cents;
  /** Wages + fuel + bonus + carryover: what's owed. */
  totalCents: Cents;
  /** What the bills in the drawer can actually cover. */
  paidCents: Cents;
  /** Owed minus paid — becomes next week's carryover. */
  shortfallCents: Cents;
  breakdown: BillBreakdown;
}

export function weekTotals(
  days: Record<string, DayEntry>,
  settings: Settings,
): WeekTotals {
  let minutes = 0;
  let fuelDays = 0;
  for (const day of Object.values(days)) {
    minutes += dayMinutes(day);
    if (day.fuel) fuelDays++;
  }
  return {
    minutes,
    fuelDays,
    // Rate is per hour, hours are quarter-hour marks; round the half cent.
    wagesCents: Math.round((minutes / 60) * settings.hourlyRateCents),
    fuelCents: fuelDays * settings.fuelRateCents,
  };
}

/** What paying this week right now would do, against the drawer as it stands. */
export function computePay(
  days: Record<string, DayEntry>,
  settings: Settings,
  extras: { bonusCents: Cents; carryoverCents: Cents },
  counts: BillCounts,
): PayComputation {
  const totals = weekTotals(days, settings);
  const totalCents =
    totals.wagesCents + totals.fuelCents + extras.bonusCents + extras.carryoverCents;
  const { breakdown, paidCents, shortfallCents } = billBreakdown(totalCents, counts);
  return {
    ...totals,
    bonusCents: extras.bonusCents,
    carryoverCents: extras.carryoverCents,
    totalCents,
    paidCents,
    shortfallCents,
    breakdown,
  };
}
