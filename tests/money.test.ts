import { describe, expect, it } from 'vitest';
import {
  BILLS,
  billBreakdown,
  breakdownTotalCents,
  cashTotalCents,
  centsFromDollars,
  formatBreakdown,
  formatCents,
  missingBill,
  parseDollarInput,
  subtractBreakdown,
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
  it('fits available bills', () => {
    // $540 against 5×$100, 1×$50, 2×$20: the $50 can't fit in the last $40,
    // so the exact fit is 5×$100 + 2×$20.
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

describe('billBreakdown pays as much as the drawer allows', () => {
  it('skips a big bill when smaller ones cover the amount exactly', () => {
    // Greedy took the $50 first and then had nothing that fit in the last $10,
    // carrying $10 over while three $20s sat in the drawer.
    const { breakdown, paidCents, shortfallCents } = billBreakdown(6000, {
      '50': 1,
      '20': 3,
    });
    expect(paidCents).toBe(6000);
    expect(shortfallCents).toBe(0);
    expect(breakdown).toEqual({ '20': 3 });
  });

  it('prefers the fewest bills when several combinations tie', () => {
    const { breakdown } = billBreakdown(10000, {
      '100': 1,
      '50': 2,
      '20': 5,
      '10': 5,
      '5': 5,
    });
    expect(breakdown).toEqual({ '100': 1 });
  });

  it('matches an exhaustive search on random drawers', () => {
    const best = (amount: number, counts: Record<string, number>): number => {
      let top = 0;
      const walk = (i: number, paid: number) => {
        if (paid > amount) return;
        if (paid > top) top = paid;
        if (i >= BILLS.length) return;
        for (let k = 0; k <= (counts[String(BILLS[i])] ?? 0); k++) {
          walk(i + 1, paid + k * BILLS[i] * 100);
        }
      };
      walk(0, 0);
      return top;
    };

    let seed = 20260830;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let t = 0; t < 300; t++) {
      const counts: Record<string, number> = {};
      for (const b of BILLS) counts[String(b)] = rnd(4);
      const amount = rnd(60000);
      const { breakdown, paidCents, shortfallCents } = billBreakdown(amount, counts);
      expect(paidCents).toBe(best(amount, counts));
      expect(breakdownTotalCents(breakdown)).toBe(paidCents);
      expect(paidCents + shortfallCents).toBe(amount);
      for (const b of BILLS) {
        expect(breakdown[String(b)] ?? 0).toBeLessThanOrEqual(counts[String(b)]);
      }
    }
  });
});

describe('drawer bookkeeping', () => {
  it('reports the first bill a drawer cannot cover', () => {
    expect(missingBill({ '100': 2, '20': 1 }, { '100': 2, '20': 1 })).toBeNull();
    expect(missingBill({ '100': 1 }, { '100': 2 })).toBe(100);
    expect(missingBill({ '100': 2 }, { '100': 1, '5': 1 })).toBe(5);
  });

  it('subtracts a breakdown from the counts', () => {
    expect(subtractBreakdown({ '100': 3, '20': 2 }, { '100': 2 })).toEqual({
      '100': 1,
      '20': 2,
    });
  });

  it('totals a breakdown', () => {
    expect(breakdownTotalCents({ '100': 2, '20': 1, '5': 3 })).toBe(23500);
  });
});
