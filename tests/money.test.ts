import { describe, expect, it } from 'vitest';
import {
  billBreakdown,
  cashTotalCents,
  centsFromDollars,
  formatBreakdown,
  formatCents,
  parseDollarInput,
} from '../src/lib/money';

describe('cents conversion and formatting', () => {
  it('rounds float dollars to integer cents', () => {
    expect(centsFromDollars(22.005)).toBe(2201);
    expect(centsFromDollars(183.33333333333334)).toBe(18333);
  });

  it('formats cents', () => {
    expect(formatCents(18333)).toBe('$183.33');
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(130025)).toBe('$1,300.25');
    expect(formatCents(-500)).toBe('-$5.00');
  });

  it('parses user dollar input', () => {
    expect(parseDollarInput('22')).toBe(2200);
    expect(parseDollarInput('22.5')).toBe(2250);
    expect(parseDollarInput('$1,300.25')).toBe(130025);
    expect(parseDollarInput('')).toBeNull();
    expect(parseDollarInput('abc')).toBeNull();
    expect(parseDollarInput('-5')).toBeNull();
  });
});

describe('billBreakdown', () => {
  it('greedily fits available bills', () => {
    // $540 against 5×$100, 1×$50, 2×$20: after 5×$100 the $50 no longer
    // fits in the remaining $40, so greedy takes 2×$20.
    const { breakdown, paidCents, shortfallCents } = billBreakdown(54000, {
      '100': 5,
      '50': 1,
      '20': 2,
      '10': 0,
      '5': 0,
    });
    expect(breakdown).toEqual({ '100': 5, '20': 2 });
    expect(paidCents).toBe(54000);
    expect(shortfallCents).toBe(0);
  });

  it('never produces the v1 float phantom shortfall', () => {
    // 8h20m at $22/hr = 18333 cents exactly; $5s available.
    const { paidCents, shortfallCents } = billBreakdown(18333, {
      '100': 1,
      '50': 1,
      '20': 1,
      '10': 1,
      '5': 1,
    });
    expect(paidCents).toBe(18000); // 100+50+20+10 — the $5 doesn't fit in 333c
    expect(shortfallCents).toBe(333);
  });

  it('pays zero when the drawer is empty', () => {
    const { paidCents, shortfallCents, breakdown } = billBreakdown(10000, {});
    expect(paidCents).toBe(0);
    expect(shortfallCents).toBe(10000);
    expect(breakdown).toEqual({});
  });

  it('is exact for whole amounts with ample cash', () => {
    const { paidCents, shortfallCents, breakdown } = billBreakdown(54000, {
      '100': 10,
      '50': 10,
      '20': 10,
      '10': 10,
      '5': 10,
    });
    expect(paidCents).toBe(54000);
    expect(shortfallCents).toBe(0);
    expect(breakdown).toEqual({ '100': 5, '20': 2 });
  });
});

describe('helpers', () => {
  it('formats a breakdown high-to-low', () => {
    expect(formatBreakdown({ '100': 5, '20': 2 })).toBe('5×$100 + 2×$20');
  });

  it('totals a drawer', () => {
    expect(cashTotalCents({ '100': 2, '5': 3 })).toBe(21500);
  });
});
