// All money is integer cents in schema v2. Dollars exist only at the
// render/input edges. This kills the v1 float bugs (phantom shortfalls,
// epsilon carryover).

export type Cents = number;

export function centsFromDollars(dollars: number): Cents {
  return Math.round(dollars * 100);
}

export function centsToDollars(cents: Cents): number {
  return cents / 100;
}

export function formatCents(cents: Cents): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const rem = String(abs % 100).padStart(2, '0');
  return `${sign}$${dollars.toLocaleString('en-US')}.${rem}`;
}

/** Parse a user-typed dollar amount ("22", "22.5", "$1,300.25") to cents. */
export function parseDollarInput(raw: string): Cents | null {
  const cleaned = raw.replace(/[$,\s]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return centsFromDollars(n);
}

export const BILLS = [100, 50, 20, 10, 5] as const;
export type Bill = (typeof BILLS)[number];

export type BillCounts = Record<string, number>;
export type BillBreakdown = Record<string, number>;

/**
 * Greedy fit of `amountCents` against available bill counts.
 * Bills only come in whole dollars, so any sub-dollar remainder is always a
 * shortfall (carryover) — exact by construction in integer cents.
 */
export function billBreakdown(
  amountCents: Cents,
  available: BillCounts,
): { breakdown: BillBreakdown; paidCents: Cents; shortfallCents: Cents } {
  const breakdown: BillBreakdown = {};
  let remaining = Math.max(0, Math.round(amountCents));
  for (const bill of BILLS) {
    const billCents = bill * 100;
    const have = available[String(bill)] ?? 0;
    const used = Math.min(Math.floor(remaining / billCents), have);
    if (used > 0) {
      breakdown[String(bill)] = used;
      remaining -= used * billCents;
    }
  }
  return {
    breakdown,
    paidCents: Math.round(amountCents) - remaining,
    shortfallCents: remaining,
  };
}

export function formatBreakdown(breakdown: BillBreakdown): string {
  return BILLS.filter((b) => (breakdown[String(b)] ?? 0) > 0)
    .map((b) => `${breakdown[String(b)]}×$${b}`)
    .join(' + ');
}

export function cashTotalCents(counts: BillCounts): Cents {
  return BILLS.reduce((sum, b) => sum + (counts[String(b)] ?? 0) * b * 100, 0);
}
