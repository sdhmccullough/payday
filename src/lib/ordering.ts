// Ledger ordering for the Cash and History tabs.
//
// Rows migrated from v1 carry no epoch timestamp — `at` / `paidAt` are null
// and the only date they hold is the label v1 rendered ("Mar 6, 2026").
// Sorting on the timestamp alone treated every one of those rows as time 0,
// so they all sank below the v2 rows and, among themselves, came out in RTDB
// key order rather than date order. Each row is resolved to the best date it
// can offer before sorting; rows that still have none sort last, and exact
// ties fall back to the key, which is time-ordered in both v1 (base36
// Date.now) and v2 (push id).

import { parseDateKey, parseFullDateLabel } from './dates';
import type { CashTxn, HistoryEntry } from './schema';

/** When a cash transaction happened, epoch ms, or null if unknowable. */
export function cashTxnTime(t: CashTxn): number | null {
  return t.at ?? parseFullDateLabel(t.dateLabel);
}

/** When a payment was handed over, epoch ms, or null if unknowable. */
export function historyPaidTime(e: HistoryEntry): number | null {
  return e.paidAt ?? parseFullDateLabel(e.paidDateLabel);
}

/** History sorts by the week it covers — that's the date the card shows and
 * the one the year/month filters and charts bucket on, so a week paid late
 * stays with its own period instead of jumping to the top of the list. */
function historyWeekTime(e: HistoryEntry): number | null {
  if (e.weekStart) {
    const t = parseDateKey(e.weekStart).getTime();
    if (Number.isFinite(t)) return t;
  }
  return historyPaidTime(e);
}

/** Newest first; unknown dates last. */
function compareTimeDesc(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

function compareKeyDesc(a: string, b: string): number {
  return a > b ? -1 : a < b ? 1 : 0;
}

export function orderCashTxns(
  txns: Record<string, CashTxn>,
): Array<[string, CashTxn]> {
  return Object.entries(txns).sort(
    ([ka, a], [kb, b]) =>
      compareTimeDesc(cashTxnTime(a), cashTxnTime(b)) || compareKeyDesc(ka, kb),
  );
}

export function orderHistory(
  history: Record<string, HistoryEntry>,
): Array<[string, HistoryEntry]> {
  return Object.entries(history).sort(
    ([ka, a], [kb, b]) =>
      compareTimeDesc(historyWeekTime(a), historyWeekTime(b)) ||
      compareTimeDesc(historyPaidTime(a), historyPaidTime(b)) ||
      compareKeyDesc(ka, kb),
  );
}
