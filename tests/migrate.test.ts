import { describe, expect, it } from 'vitest';
import { buildV2Updates } from '../src/store/migrate';

// Golden test: a realistic v1 blob (shape produced by the vanilla app)
// through the converter.

const V1_STATE = {
  hourlyRate: 22,
  fuelRate: 10,
  weekStart: '2026-07-25',
  days: {
    '2026-07-27': { start: '08:00', end: '17:00', fuel: true },
    '2026-07-28': { start: '08:00', end: '16:20', fuel: false },
  },
  cash: { '100': 5, '50': 1, '20': 2, '10': 0, '5': 3 },
  cashTransactions: [
    {
      id: 'mdl3xyzabcd',
      type: 'withdrawal',
      label: 'Payment: Jul 18 – Jul 24',
      amount: 540,
      breakdown: { '100': 5, '20': 2 },
      date: 'Jul 24, 2026',
    },
  ],
  history: [
    {
      id: 'mdl2aaaabbb',
      weekStart: '2026-07-18',
      weekLabel: 'Jul 18 – Jul 24',
      hours: 24.333333333333332,
      wages: 535.3333333333334,
      fuel: 30,
      bonus: 0,
      carryover: 0,
      total: 565.3333333333334,
      amountPaid: 540,
      shortfall: 25.333333333333371,
      paidDate: 'Jul 24, 2026',
    },
  ],
  carryover: 25.333333333333371,
  bonus: 0,
};

describe('buildV2Updates', () => {
  it('converts a full v1 blob', () => {
    const u = buildV2Updates(V1_STATE);

    expect(u['settings']).toEqual({
      hourlyRateCents: 2200,
      fuelRateCents: 1000,
    });

    const week = u['week'] as Record<string, unknown>;
    expect(week.weekStart).toBe('2026-07-25');
    expect(week.carryoverCents).toBe(2533); // float epsilon rounded away
    expect(week.bonusCents).toBe(0);
    expect(week.days).toEqual({
      '2026-07-27': { start: '08:00', end: '17:00', fuel: true },
      '2026-07-28': { start: '08:00', end: '16:20', fuel: false },
    });

    expect(u['cash/counts']).toEqual({ '100': 5, '50': 1, '20': 2, '10': 0, '5': 3 });

    const txn = u['cashTransactions/mdl3xyzabcd'] as Record<string, unknown>;
    expect(txn.amountCents).toBe(54000);
    expect(txn.dateLabel).toBe('Jul 24, 2026');

    const hist = u['history/mdl2aaaabbb'] as Record<string, unknown>;
    expect(hist.minutes).toBe(1460); // 24.3333 h
    expect(hist.wagesCents).toBe(53533);
    expect(hist.amountPaidCents).toBe(54000);
    expect(hist.shortfallCents).toBe(2533);

    expect(u['stateV1Backup']).toBe(V1_STATE);
    expect(u['state']).toBeNull();
    expect(u['meta/schemaVersion']).toBe(2);
  });

  it('handles an empty household (no v1 blob)', () => {
    const u = buildV2Updates(null);
    expect(u).toEqual({ 'meta/schemaVersion': 2 });
  });

  it('defaults missing amountPaid to total (oldest v1 rows)', () => {
    const u = buildV2Updates({
      history: [{ id: 'h1', total: 100, hours: 5 }],
    });
    const h = u['history/h1'] as Record<string, unknown>;
    expect(h.amountPaidCents).toBe(10000);
  });
});
