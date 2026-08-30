import { describe, expect, it } from 'vitest';
import { orderCashTxns, orderHistory } from '../src/lib/ordering';
import { parseFullDateLabel } from '../src/lib/dates';
import type { CashTxn, HistoryEntry } from '../src/lib/schema';

function txn(dateLabel: string, at: number | null, label = dateLabel): CashTxn {
  return { type: 'deposit', label, amountCents: 1000, dateLabel, at };
}

function entry(
  weekStart: string,
  paidDateLabel: string,
  paidAt: number | null,
): HistoryEntry {
  return {
    weekStart,
    minutes: 600,
    wagesCents: 1000,
    fuelCents: 0,
    bonusCents: 0,
    carryoverCents: 0,
    totalCents: 1000,
    amountPaidCents: 1000,
    shortfallCents: 0,
    paidDateLabel,
    paidAt,
  };
}

const ms = (label: string) => parseFullDateLabel(label) as number;

describe('parseFullDateLabel', () => {
  it('parses the label formatFull writes, at local midnight', () => {
    expect(parseFullDateLabel('Mar 6, 2026')).toBe(new Date(2026, 2, 6).getTime());
    expect(parseFullDateLabel('December 31, 2025')).toBe(
      new Date(2025, 11, 31).getTime(),
    );
  });

  it('rejects free-form and impossible dates', () => {
    expect(parseFullDateLabel('')).toBeNull();
    expect(parseFullDateLabel('Last Friday')).toBeNull();
    expect(parseFullDateLabel('Foo 3, 2026')).toBeNull();
    expect(parseFullDateLabel('Feb 30, 2026')).toBeNull();
  });
});

describe('orderCashTxns', () => {
  it('sorts newest first', () => {
    const ordered = orderCashTxns({
      a: txn('Mar 6, 2026', ms('Mar 6, 2026')),
      b: txn('Jul 3, 2026', ms('Jul 3, 2026')),
      c: txn('May 1, 2026', ms('May 1, 2026')),
    });
    expect(ordered.map(([k]) => k)).toEqual(['b', 'c', 'a']);
  });

  it('interleaves v1 rows (no epoch) with v2 rows by their label date', () => {
    const ordered = orderCashTxns({
      v2new: txn('Jul 3, 2026', ms('Jul 3, 2026')),
      v1old: txn('Mar 6, 2026', null),
      v1mid: txn('May 1, 2026', null),
      v2mid: txn('Jun 5, 2026', ms('Jun 5, 2026')),
    });
    expect(ordered.map(([k]) => k)).toEqual(['v2new', 'v2mid', 'v1mid', 'v1old']);
  });

  it('sinks undatable rows to the bottom, newest key first', () => {
    const ordered = orderCashTxns({
      k1: txn('Last Friday', null),
      k2: txn('Two weeks ago', null),
      dated: txn('Mar 6, 2026', null),
    });
    expect(ordered.map(([k]) => k)).toEqual(['dated', 'k2', 'k1']);
  });

  it('breaks same-day ties by key, newest first', () => {
    const ordered = orderCashTxns({
      m9y3a: txn('Mar 6, 2026', null),
      m9y4b: txn('Mar 6, 2026', null),
    });
    expect(ordered.map(([k]) => k)).toEqual(['m9y4b', 'm9y3a']);
  });
});

describe('orderHistory', () => {
  it('sorts by the week covered, newest first', () => {
    const ordered = orderHistory({
      a: entry('2026-03-07', 'Mar 13, 2026', ms('Mar 13, 2026')),
      b: entry('2026-07-04', 'Jul 10, 2026', ms('Jul 10, 2026')),
      c: entry('2026-05-02', 'May 8, 2026', ms('May 8, 2026')),
    });
    expect(ordered.map(([k]) => k)).toEqual(['b', 'c', 'a']);
  });

  it('orders v1 rows (no paidAt) by week alongside v2 rows', () => {
    const ordered = orderHistory({
      v2: entry('2026-07-04', 'Jul 10, 2026', ms('Jul 10, 2026')),
      v1: entry('2026-08-01', 'Aug 7, 2026', null),
    });
    expect(ordered.map(([k]) => k)).toEqual(['v1', 'v2']);
  });

  it('keeps a late-paid old week with its own period', () => {
    const ordered = orderHistory({
      late: entry('2026-05-02', 'Jul 24, 2026', ms('Jul 24, 2026')),
      recent: entry('2026-07-04', 'Jul 10, 2026', ms('Jul 10, 2026')),
    });
    expect(ordered.map(([k]) => k)).toEqual(['recent', 'late']);
  });

  it('breaks same-week ties by when the payment was made', () => {
    const ordered = orderHistory({
      first: entry('2026-07-04', 'Jul 10, 2026', ms('Jul 10, 2026')),
      second: entry('2026-07-04', 'Jul 18, 2026', ms('Jul 18, 2026')),
    });
    expect(ordered.map(([k]) => k)).toEqual(['second', 'first']);
  });
});
