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

/** Every bill is a whole multiple of $5, so the drawer can only ever pay in
 * $5 units — any sub-$5 remainder is a shortfall by construction. */
const UNIT_CENTS = 500;
const BILL_UNITS = BILLS.map((b) => (b * 100) / UNIT_CENTS); // 20, 10, 4, 2, 1

/** Above this much DP work, fall back to the greedy fit. Real drawers are
 * orders of magnitude smaller; this only guards absurd input. */
const MAX_FILL_WORK = 4_000_000;
const INF = 0x3fffffff;

/** Original greedy fit — largest bill first. Optimal when the drawer is deep,
 * wrong when a big bill blocks an exact fit, so it's only the fallback. */
function greedyFill(amountCents: Cents, available: BillCounts): BillBreakdown {
  const breakdown: BillBreakdown = {};
  let remaining = amountCents;
  for (const bill of BILLS) {
    const billCents = bill * 100;
    const used = Math.min(
      Math.floor(remaining / billCents),
      available[String(bill)] ?? 0,
    );
    if (used > 0) {
      breakdown[String(bill)] = used;
      remaining -= used * billCents;
    }
  }
  return breakdown;
}

/** Largest payable amount not exceeding `amountCents`, using the fewest bills
 * — so the drawer keeps its small denominations for the next payment.
 * Greedy alone underpays whenever a large bill crowds out an exact fit
 * ($60 due against 1×$50 + 3×$20 pays $50 and carries $10 over). */
function bestFill(amountCents: Cents, available: BillCounts): BillBreakdown {
  const target = Math.floor(amountCents / UNIT_CENTS);
  if (target <= 0) return {};

  // No denomination can ever be used more times than it takes to fill the
  // target on its own — capping keeps the DP bounded by the amount due.
  const counts = BILL_UNITS.map((u, i) =>
    Math.min(Math.max(0, Math.floor(available[String(BILLS[i])] ?? 0)), Math.floor(target / u)),
  );
  const cap = Math.min(
    target,
    counts.reduce((sum, c, i) => sum + c * BILL_UNITS[i], 0),
  );
  if (cap <= 0) return {};
  const work = counts.reduce((sum, c) => sum + c + 1, 0) * (cap + 1);
  if (work > MAX_FILL_WORK) return greedyFill(amountCents, available);

  // dp[u] = fewest bills that make exactly u units; take[i][u] = how many of
  // bill i that solution used, for reconstruction.
  let dp = new Int32Array(cap + 1).fill(INF);
  dp[0] = 0;
  const take: Int32Array[] = [];
  for (let i = 0; i < BILLS.length; i++) {
    const unit = BILL_UNITS[i];
    const next = new Int32Array(cap + 1).fill(INF);
    const taken = new Int32Array(cap + 1);
    for (let u = 0; u <= cap; u++) {
      if (dp[u] === INF) continue;
      for (let k = 0; k <= counts[i]; k++) {
        const nu = u + k * unit;
        if (nu > cap) break;
        const cost = dp[u] + k;
        if (cost < next[nu]) {
          next[nu] = cost;
          taken[nu] = k;
        }
      }
    }
    dp = next;
    take.push(taken);
  }

  let best = 0;
  for (let u = cap; u >= 0; u--) {
    if (dp[u] < INF) {
      best = u;
      break;
    }
  }

  const breakdown: BillBreakdown = {};
  let u = best;
  for (let i = BILLS.length - 1; i >= 0; i--) {
    const k = take[i][u];
    if (k > 0) breakdown[String(BILLS[i])] = k;
    u -= k * BILL_UNITS[i];
  }
  return breakdown;
}

/**
 * Fit `amountCents` against the bills actually in the drawer: pay as much as
 * the bills allow, never more than what's due, and report the rest as
 * shortfall (which becomes carryover). Exact by construction in integer cents.
 */
export function billBreakdown(
  amountCents: Cents,
  available: BillCounts,
): { breakdown: BillBreakdown; paidCents: Cents; shortfallCents: Cents } {
  const amount = Math.max(0, Math.round(amountCents));
  const breakdown = bestFill(amount, available);
  const paidCents = breakdownTotalCents(breakdown);
  return { breakdown, paidCents, shortfallCents: amount - paidCents };
}

/** What a breakdown is worth, in cents. */
export function breakdownTotalCents(breakdown: BillBreakdown): Cents {
  return BILLS.reduce((sum, b) => sum + (breakdown[String(b)] ?? 0) * b * 100, 0);
}

/** The first bill the drawer can't cover for this breakdown, or null when it
 * covers all of them. Guards a payment computed against stale counts. */
export function missingBill(
  counts: BillCounts,
  breakdown: BillBreakdown,
): number | null {
  for (const b of BILLS) {
    const used = breakdown[String(b)] ?? 0;
    if (used > (counts[String(b)] ?? 0)) return b;
  }
  return null;
}

/** Drawer after paying out a breakdown. */
export function subtractBreakdown(
  counts: BillCounts,
  breakdown: BillBreakdown,
): BillCounts {
  const out: BillCounts = { ...counts };
  for (const b of BILLS) {
    const used = breakdown[String(b)] ?? 0;
    if (used > 0) out[String(b)] = (counts[String(b)] ?? 0) - used;
  }
  return out;
}

export function formatBreakdown(breakdown: BillBreakdown): string {
  return BILLS.filter((b) => (breakdown[String(b)] ?? 0) > 0)
    .map((b) => `${breakdown[String(b)]}×$${b}`)
    .join(' + ');
}

export function cashTotalCents(counts: BillCounts): Cents {
  return BILLS.reduce((sum, b) => sum + (counts[String(b)] ?? 0) * b * 100, 0);
}
