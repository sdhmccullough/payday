// Firebase sync layer. Lives outside React; listeners patch the zustand
// store, and store actions write back through SCOPED paths — never a
// whole-state overwrite, so concurrent members can't clobber each other.

import {
  onValue,
  ref,
  update,
  remove,
  runTransaction,
  serverTimestamp,
  push,
  get,
  child,
  type DatabaseReference,
  type Unsubscribe,
} from 'firebase/database';
import { db } from '../lib/firebase';
import { patchStore, readStore, useStore } from './useStore';
import {
  normalizeArchived,
  normalizeCounts,
  normalizeHistory,
  normalizeKeyed,
  normalizeMember,
  normalizePriorPayment,
  normalizeSettings,
  normalizeTxn,
  normalizeWeek,
  type DayEntry,
  type HistoryEntry,
} from '../lib/schema';
import { billBreakdown, cashTotalCents, type Cents } from '../lib/money';
import {
  currentWeekStart,
  formatFull,
  minutesBetween,
  weekLabel,
} from '../lib/dates';
import { runMigrationIfNeeded } from './migrate';

let subscriptions: Unsubscribe[] = [];
let currentHid: string | null = null;

// ---- offline cache --------------------------------------------------------
// RTDB's web SDK has no disk persistence, so we mirror household slices to
// localStorage (per uid+household) and hydrate before listeners attach.
// This is what makes an offline app launch show data instead of a blank.

const CACHE_SLICES = [
  'settings',
  'week',
  'cashCounts',
  'cashTransactions',
  'history',
  'archivedWeeks',
  'members',
  'priorPayments',
] as const;

function cacheKey(u: string, hid: string): string {
  return `payday:v2:${u}:${hid}`;
}

function hydrateFromCache(hid: string): void {
  const u = uid();
  if (!u) return;
  try {
    const raw = localStorage.getItem(cacheKey(u, hid));
    if (!raw) return;
    const cached = JSON.parse(raw) as Record<string, unknown>;
    patchStore({
      settings: normalizeSettings(cached.settings),
      week: normalizeWeek(cached.week),
      cashCounts: normalizeCounts(cached.cashCounts),
      cashTransactions: normalizeKeyed(cached.cashTransactions, normalizeTxn),
      history: normalizeKeyed(cached.history, normalizeHistory),
      archivedWeeks: normalizeKeyed(cached.archivedWeeks, normalizeArchived),
      members: normalizeKeyed(cached.members, normalizeMember),
      priorPayments: normalizeKeyed(cached.priorPayments, normalizePriorPayment),
    });
  } catch {
    /* corrupt cache — live data will replace it */
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const s = readStore();
    const u = s.user?.uid;
    if (!u || !s.householdId) return;
    try {
      const slice: Record<string, unknown> = {};
      for (const k of CACHE_SLICES) slice[k] = s[k];
      localStorage.setItem(cacheKey(u, s.householdId), JSON.stringify(slice));
    } catch {
      /* quota / private mode — Firebase remains source of truth */
    }
  }, 250);
}

function hhRef(path = ''): DatabaseReference {
  const hid = currentHid;
  if (!hid) throw new Error('No household attached');
  return ref(db, `households/${hid}${path ? '/' + path : ''}`);
}

function uid(): string | undefined {
  return readStore().user?.uid;
}

// ---- attach / detach ------------------------------------------------------

export async function attachHousehold(hid: string): Promise<void> {
  detachHousehold();
  currentHid = hid;
  patchStore({ householdId: hid, syncStatus: 'connecting' });

  hydrateFromCache(hid);

  try {
    await runMigrationIfNeeded(hid);
  } catch (err) {
    // Never block attach on migration; it retries on the next launch.
    console.error('Migration check failed:', err);
  }
  if (currentHid !== hid) return; // household switched mid-migration

  const nodes: Array<[string, (v: unknown) => void]> = [
    ['settings', (v) => patchStore({ settings: normalizeSettings(v) })],
    ['week', (v) => patchStore({ week: normalizeWeek(v) })],
    ['cash/counts', (v) => patchStore({ cashCounts: normalizeCounts(v) })],
    [
      'cashTransactions',
      (v) => patchStore({ cashTransactions: normalizeKeyed(v, normalizeTxn) }),
    ],
    ['history', (v) => patchStore({ history: normalizeKeyed(v, normalizeHistory) })],
    [
      'archivedWeeks',
      (v) => patchStore({ archivedWeeks: normalizeKeyed(v, normalizeArchived) }),
    ],
    ['members', (v) => patchStore({ members: normalizeKeyed(v, normalizeMember) })],
    [
      'priorPayments',
      (v) => patchStore({ priorPayments: normalizeKeyed(v, normalizePriorPayment) }),
    ],
  ];

  for (const [path, apply] of nodes) {
    subscriptions.push(
      onValue(
        hhRef(path),
        (snap) => {
          apply(snap.val());
          if (path === 'week') reconcileWeekIfStale();
          patchStore({ syncStatus: 'synced' });
        },
        () => patchStore({ syncStatus: 'offline' }),
      ),
    );
  }

  // Connection state drives the indicator.
  subscriptions.push(
    onValue(ref(db, '.info/connected'), (snap) => {
      patchStore({ syncStatus: snap.val() === true ? 'synced' : 'offline' });
    }),
  );

  // Mirror every store change into the offline cache.
  subscriptions.push(useStore.subscribe(schedulePersist));
}

export function detachHousehold(): void {
  for (const off of subscriptions) off();
  subscriptions = [];
  currentHid = null;
}

// ---- writes ---------------------------------------------------------------

function writing<T>(p: Promise<T>): Promise<T> {
  patchStore({ syncStatus: 'syncing' });
  return p.then(
    (v) => {
      patchStore({ syncStatus: 'synced' });
      return v;
    },
    (err) => {
      patchStore({ syncStatus: 'offline' });
      throw err;
    },
  );
}

export function setDayField(
  dateKey: string,
  patch: Partial<Pick<DayEntry, 'start' | 'end' | 'fuel'>>,
): Promise<void> {
  return writing(
    update(hhRef(`week/days/${dateKey}`), { ...patch, by: uid() ?? null }),
  );
}

export function clearDay(dateKey: string): Promise<void> {
  return writing(remove(hhRef(`week/days/${dateKey}`)));
}

export function fillDefaults(
  keys: string[],
  start: string,
  end: string,
): Promise<void> {
  const updates: Record<string, unknown> = {};
  for (const k of keys) {
    updates[`week/days/${k}/start`] = start;
    updates[`week/days/${k}/end`] = end;
    updates[`week/days/${k}/fuel`] = true;
    updates[`week/days/${k}/by`] = uid() ?? null;
  }
  return writing(update(hhRef(), updates));
}

export function resetWeekDays(): Promise<void> {
  return writing(remove(hhRef('week/days')));
}

export function setRates(hourlyRateCents: Cents, fuelRateCents: Cents): Promise<void> {
  return writing(update(hhRef('settings'), { hourlyRateCents, fuelRateCents }));
}

export function setBonus(bonusCents: Cents): Promise<void> {
  return writing(update(hhRef('week'), { bonusCents }));
}

export function clearCarryover(): Promise<void> {
  return writing(update(hhRef('week'), { carryoverCents: 0 }));
}

export function adjustBill(bill: number, delta: 1 | -1): Promise<void> {
  return writing(
    runTransaction(hhRef(`cash/counts/${bill}`), (count) =>
      Math.max(0, (typeof count === 'number' ? count : 0) + delta),
    ).then(() => undefined),
  );
}

export function deleteTransaction(id: string): Promise<void> {
  return writing(remove(hhRef(`cashTransactions/${id}`)));
}

export function deleteHistoryEntry(id: string): Promise<void> {
  return writing(remove(hhRef(`history/${id}`)));
}

export interface SavePayComputation {
  minutes: number;
  wagesCents: Cents;
  fuelCents: Cents;
  bonusCents: Cents;
  carryoverCents: Cents;
  totalCents: Cents;
  paidCents: Cents;
  shortfallCents: Cents;
  breakdown: Record<string, number>;
}

/** Pure computation of what Save & Pay would do against current store state. */
export function computeSavePay(): SavePayComputation {
  const { week, settings, cashCounts } = readStore();
  let minutes = 0;
  let fuelDays = 0;
  for (const day of Object.values(week.days)) {
    minutes += minutesBetween(day.start, day.end);
    if (day.fuel) fuelDays++;
  }
  const wagesCents = Math.round((minutes / 60) * settings.hourlyRateCents);
  const fuelCents = fuelDays * settings.fuelRateCents;
  const totalCents = wagesCents + fuelCents + week.bonusCents + week.carryoverCents;
  const { breakdown, paidCents, shortfallCents } = billBreakdown(totalCents, cashCounts);
  return {
    minutes,
    wagesCents,
    fuelCents,
    bonusCents: week.bonusCents,
    carryoverCents: week.carryoverCents,
    totalCents,
    paidCents,
    shortfallCents,
    breakdown,
  };
}

/**
 * Commit a payment: history entry + cash transaction + decremented bill
 * counts + week reset, in ONE multi-path update so members never observe a
 * half-applied payment.
 */
export function commitSavePay(calc: SavePayComputation): Promise<void> {
  const { week, cashCounts } = readStore();
  const label = weekLabel(week.weekStart);
  const now = Date.now();
  const historyKey = push(child(ref(db), 'x')).key as string;
  const txnKey = push(child(ref(db), 'x')).key as string;

  const entry: HistoryEntry = {
    weekStart: week.weekStart,
    minutes: calc.minutes,
    wagesCents: calc.wagesCents,
    fuelCents: calc.fuelCents,
    bonusCents: calc.bonusCents,
    carryoverCents: calc.carryoverCents,
    totalCents: calc.totalCents,
    amountPaidCents: calc.paidCents,
    shortfallCents: calc.shortfallCents,
    breakdown: Object.keys(calc.breakdown).length ? calc.breakdown : undefined,
    paidDateLabel: formatFull(new Date(now)),
    paidAt: now,
    by: uid(),
  };

  const updates: Record<string, unknown> = {};
  updates[`history/${historyKey}`] = { ...entry, paidAt: serverTimestamp() };
  if (calc.paidCents > 0) {
    updates[`cashTransactions/${txnKey}`] = {
      type: 'withdrawal',
      label: `Payment: ${label}`,
      amountCents: calc.paidCents,
      breakdown: entry.breakdown ?? null,
      dateLabel: entry.paidDateLabel,
      at: serverTimestamp(),
      by: uid() ?? null,
    };
  }
  for (const [bill, used] of Object.entries(calc.breakdown)) {
    updates[`cash/counts/${bill}`] = Math.max(0, (cashCounts[bill] ?? 0) - used);
  }
  updates['week/days'] = null;
  updates['week/bonusCents'] = 0;
  updates['week/carryoverCents'] = calc.shortfallCents;

  return writing(update(hhRef(), updates));
}

// ---- week rollover --------------------------------------------------------

let reconciling = false;

/**
 * If the synced week is stale, archive unpaid entries and roll forward.
 * Transaction on the week node makes concurrent members converge; the
 * archive write is idempotent because it's keyed by the old weekStart.
 */
async function reconcileWeekIfStale(): Promise<void> {
  const { week } = readStore();
  const nowStart = currentWeekStart();
  if (!week.weekStart || week.weekStart === nowStart || reconciling) return;

  reconciling = true;
  try {
    let archived: { weekStart: string; days: unknown; bonusCents: number } | null =
      null;
    await runTransaction(hhRef('week'), (raw) => {
      const w = normalizeWeek(raw);
      if (w.weekStart === nowStart) return raw; // someone else already rolled
      archived =
        Object.keys(w.days).length > 0 || w.bonusCents > 0
          ? { weekStart: w.weekStart, days: w.days, bonusCents: w.bonusCents }
          : null;
      return {
        weekStart: nowStart,
        bonusCents: 0,
        carryoverCents: w.carryoverCents,
        days: null,
      };
    });
    if (archived !== null) {
      const a = archived as { weekStart: string; days: unknown; bonusCents: number };
      await update(hhRef(`archivedWeeks/${a.weekStart}`), {
        days: a.days,
        bonusCents: a.bonusCents,
      });
    }
  } finally {
    reconciling = false;
  }
}

// ---- deposits (new in v2 — v1 styled this form but never built it) --------

export function depositCash(counts: Record<string, number>): Promise<void> {
  const amountCents = cashTotalCents(counts);
  if (amountCents <= 0) return Promise.resolve();
  const txnKey = push(child(ref(db), 'x')).key as string;
  const updates: Record<string, unknown> = {};
  updates[`cashTransactions/${txnKey}`] = {
    type: 'deposit',
    label: 'Cash deposit',
    amountCents,
    breakdown: counts,
    dateLabel: formatFull(new Date()),
    at: serverTimestamp(),
    by: uid() ?? null,
  };
  const existing = readStore().cashCounts;
  for (const [bill, n] of Object.entries(counts)) {
    if (n > 0) updates[`cash/counts/${bill}`] = (existing[bill] ?? 0) + n;
  }
  return writing(update(hhRef(), updates));
}

// ---- household ------------------------------------------------------------

export async function lookupHouseholdId(uidVal: string): Promise<string | null> {
  const snap = await get(ref(db, `userHouseholds/${uidVal}`));
  return typeof snap.val() === 'string' ? snap.val() : null;
}

export async function createHousehold(uidVal: string, email: string): Promise<string> {
  const updates: Record<string, unknown> = {};
  updates[`households/${uidVal}/members/${uidVal}`] = {
    email,
    joinedAt: serverTimestamp(),
  };
  updates[`userHouseholds/${uidVal}`] = uidVal;
  await update(ref(db), updates);
  return uidVal;
}

/** Join by household code (legacy flow; invites replace this in Phase 3). */
export async function joinHousehold(
  uidVal: string,
  email: string,
  hid: string,
): Promise<void> {
  const updates: Record<string, unknown> = {};
  updates[`households/${hid}/members/${uidVal}`] = {
    email,
    joinedAt: serverTimestamp(),
  };
  updates[`userHouseholds/${uidVal}`] = hid;
  try {
    await update(ref(db), updates);
  } catch (err) {
    const msg = String((err as { code?: string; message?: string })?.code ?? err);
    if (/permission.denied/i.test(msg)) {
      throw new Error('Household not found. Check the code and try again.');
    }
    throw err;
  }
}
