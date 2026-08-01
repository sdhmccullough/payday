import { describe, expect, it } from 'vitest';
import { historyToCsv, toCsv } from '../src/lib/csv';
import type { HistoryEntry } from '../src/lib/schema';

describe('toCsv', () => {
  it('quotes fields containing commas, quotes, and newlines', () => {
    const csv = toCsv(
      ['a', 'b'],
      [['plain', 'has,comma'], ['has"quote', 'has\nnewline']],
    );
    expect(csv).toContain('"has,comma"');
    expect(csv).toContain('"has""quote"');
    expect(csv).toContain('"has\nnewline"');
  });

  it('starts with a UTF-8 BOM and uses CRLF endings', () => {
    const csv = toCsv(['x'], [['1']]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('\r\n');
  });
});

describe('historyToCsv', () => {
  const entry: HistoryEntry = {
    weekStart: '2026-07-18',
    minutes: 1460,
    wagesCents: 53533,
    fuelCents: 3000,
    bonusCents: 0,
    carryoverCents: 0,
    totalCents: 56533,
    amountPaidCents: 54000,
    shortfallCents: 2533,
    paidDateLabel: 'Jul 24, 2026',
    paidAt: null,
  };

  it('renders cents as dollar decimals and minutes as hours', () => {
    const csv = historyToCsv([entry]);
    const [header, row] = csv.replace('﻿', '').trim().split('\r\n');
    expect(header).toBe(
      'week_start,week,hours,wages,fuel,bonus,carryover,total,amount_paid,shortfall,paid_date',
    );
    expect(row).toBe(
      '2026-07-18,Jul 18 – Jul 24,24.33,535.33,30.00,0.00,0.00,565.33,540.00,25.33,"Jul 24, 2026"',
    );
  });
});
