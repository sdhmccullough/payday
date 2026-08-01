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
  dayMinutes,
  normalizeArchived,
  normalizeCounts,
  normalizeHistory,
  normalizeKeyed,
  normalizeMember,
  normalizePresence,
  normalizePriorPayment,
  normalizeSettings,
  normalizeTxn,
  normalizeWeek,
  withAutoFuel,
  type DayEntry,
  type HistoryEntry,
} from '../lib/schema';
import { billBreakdown, cashTotalCents, type Cents } from '../lib/money';
import {
  currentWeekStart,
  formatFull,
  minutesBetween,
  nowHHMM,
  roundToNearest15,
  toLocalDateKey,
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
  'presence',
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
      presence: normalizeKeyed(cached.presence, normalizePresence),
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
    [
      'meta/ownerUid',
      (v) => patchStore({ ownerUid: typeof v === 'string' ? v : null }),
    ],
    [
      'presence',
      (v) => patchStore({ presence: normalizeKeyed(v, normalizePresence) }),
    ],
    [
      'sensors',
      (v) =>
        patchStore({
          sensors: Object.fromEntries(
            Object.entries(
              (v as Record<string, unknown>) ?? {},
            ).map(([k, val]) => [k, val === true]),
          ),
        }),
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
  patch: Partial<Pick<DayEntry, 'start' | 'end' | 'fuel' | 'breakMinutes'>>,
): Promise<void> {
  const fullPatch = withAutoFuel(readStore().week.days[dateKey], patch);
  return writing(
    update(hhRef(`week/days/${dateKey}`), { ...fullPatch, by: uid() ?? null }),
  );
}

/** One-tap punch for today, rounded to the nearest 15 minutes (the
 * household pays by quarter-hour marks). */
export function punchToday(kind: 'start' | 'end'): Promise<void> {
  const todayKey = toLocalDateKey(new Date());
  const time = roundToNearest15(nowHHMM());
  if (kind === 'end') {
    const day = readStore().week.days[todayKey];
    if (day?.start && minutesBetween(day.start, time) === 0) {
      return Promise.reject(new Error('End time must be after the start time.'));
    }
  }
  return setDayField(todayKey, { [kind]: time });
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

export function setPaydayDay(paydayDay: number): Promise<void> {
  return writing(update(hhRef('settings'), { paydayDay }));
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
    minutes += dayMinutes(day);
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

// ---- archived (unpaid) weeks ----------------------------------------------

/** Same shape as computeSavePay, but against an archived week. Current
 * carryover is deliberately excluded — it stays attached to the live week. */
export function computeArchivedPay(weekStart: string): SavePayComputation | null {
  const { archivedWeeks, settings, cashCounts } = readStore();
  const archived = archivedWeeks[weekStart];
  if (!archived) return null;
  let minutes = 0;
  let fuelDays = 0;
  for (const day of Object.values(archived.days)) {
    minutes += dayMinutes(day);
    if (day.fuel) fuelDays++;
  }
  const wagesCents = Math.round((minutes / 60) * settings.hourlyRateCents);
  const fuelCents = fuelDays * settings.fuelRateCents;
  const totalCents = wagesCents + fuelCents + archived.bonusCents;
  const { breakdown, paidCents, shortfallCents } = billBreakdown(totalCents, cashCounts);
  return {
    minutes,
    wagesCents,
    fuelCents,
    bonusCents: archived.bonusCents,
    carryoverCents: 0,
    totalCents,
    paidCents,
    shortfallCents,
    breakdown,
  };
}

/** Pay an archived week: history + cash txn + bill counts + archive removal
 * in one update; any shortfall folds into the live week's carryover. */
export function commitArchivedPay(
  weekStart: string,
  calc: SavePayComputation,
): Promise<void> {
  const { cashCounts, week } = readStore();
  const label = weekLabel(weekStart);
  const now = Date.now();
  const historyKey = push(child(ref(db), 'x')).key as string;
  const txnKey = push(child(ref(db), 'x')).key as string;

  const updates: Record<string, unknown> = {};
  updates[`history/${historyKey}`] = {
    weekStart,
    minutes: calc.minutes,
    wagesCents: calc.wagesCents,
    fuelCents: calc.fuelCents,
    bonusCents: calc.bonusCents,
    carryoverCents: 0,
    totalCents: calc.totalCents,
    amountPaidCents: calc.paidCents,
    shortfallCents: calc.shortfallCents,
    breakdown: Object.keys(calc.breakdown).length ? calc.breakdown : null,
    paidDateLabel: formatFull(new Date(now)),
    paidAt: serverTimestamp(),
    by: uid() ?? null,
  };
  if (calc.paidCents > 0) {
    updates[`cashTransactions/${txnKey}`] = {
      type: 'withdrawal',
      label: `Payment: ${label} (late)`,
      amountCents: calc.paidCents,
      breakdown: Object.keys(calc.breakdown).length ? calc.breakdown : null,
      dateLabel: formatFull(new Date(now)),
      at: serverTimestamp(),
      by: uid() ?? null,
    };
  }
  for (const [bill, used] of Object.entries(calc.breakdown)) {
    updates[`cash/counts/${bill}`] = Math.max(0, (cashCounts[bill] ?? 0) - used);
  }
  updates[`archivedWeeks/${weekStart}`] = null;
  if (calc.shortfallCents > 0) {
    updates['week/carryoverCents'] = week.carryoverCents + calc.shortfallCents;
  }
  return writing(update(hhRef(), updates));
}

/** Discard an archived week without paying it. */
export function discardArchivedWeek(weekStart: string): Promise<void> {
  return writing(remove(hhRef(`archivedWeeks/${weekStart}`)));
}

// ---- presence sensors -----------------------------------------------------

/** Clear a bad presence day (member action). */
export function clearPresenceDay(dateKey: string): Promise<void> {
  return writing(remove(hhRef(`presence/${dateKey}`)));
}

/** Grant or revoke a sensor identity's write access to presence data. */
export function setSensorGrant(sensorUid: string, granted: boolean): Promise<void> {
  return writing(
    granted
      ? update(hhRef('sensors'), { [sensorUid]: true })
      : remove(hhRef(`sensors/${sensorUid}`)),
  );
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

// ---- invites --------------------------------------------------------------

const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
// No 0/O/1/I — tokens get read aloud and retyped.
const TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomToken(length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += TOKEN_ALPHABET[b % TOKEN_ALPHABET.length];
  return out;
}

export interface Invite {
  token: string;
  url: string;
  expiresAt: number;
}

/** Create a single-use invite link for the current household (rules enforce
 * expiry and single use server-side). */
export async function createInvite(): Promise<Invite> {
  const hid = currentHid;
  const u = uid();
  if (!hid || !u) throw new Error('Not attached to a household.');
  const token = randomToken();
  const expiresAt = Date.now() + INVITE_TTL_MS;
  await update(ref(db, `invites/${token}`), {
    hid,
    createdBy: u,
    createdAt: serverTimestamp(),
    expiresAt,
  });
  return {
    token,
    url: `${location.origin}/?invite=${token}`,
    expiresAt,
  };
}

/** Redeem an invite: joins its household and returns the household id. */
export async function joinViaInvite(
  uidVal: string,
  email: string,
  token: string,
): Promise<string> {
  const snap = await get(ref(db, `invites/${token}`));
  const invite = snap.val() as {
    hid?: string;
    expiresAt?: number;
    usedBy?: string;
  } | null;
  if (!invite || typeof invite.hid !== 'string') {
    throw new Error('This invite link is invalid or was revoked.');
  }
  if (invite.usedBy) {
    if (invite.usedBy === uidVal) return invite.hid; // already redeemed by us
    throw new Error('This invite link has already been used.');
  }
  if (typeof invite.expiresAt !== 'number' || invite.expiresAt <= Date.now()) {
    throw new Error('This invite link has expired. Ask for a new one.');
  }

  const updates: Record<string, unknown> = {};
  updates[`households/${invite.hid}/members/${uidVal}`] = {
    email,
    joinedAt: serverTimestamp(),
    inviteToken: token,
  };
  updates[`userHouseholds/${uidVal}`] = invite.hid;
  updates[`invites/${token}/usedBy`] = uidVal;
  try {
    await update(ref(db), updates);
  } catch (err) {
    const msg = String((err as { code?: string })?.code ?? err);
    if (/permission.denied/i.test(msg)) {
      // Rules re-check expiry/single-use atomically; a race lands here.
      throw new Error('This invite link is no longer valid. Ask for a new one.');
    }
    throw err;
  }
  return invite.hid;
}

// ---- membership -----------------------------------------------------------

/** Owner removes a member (rules also allow removing yourself). */
export function removeMember(targetUid: string): Promise<void> {
  return writing(remove(hhRef(`members/${targetUid}`)));
}

/** Leave the current household and fall back to (or create) your own. */
export async function leaveHousehold(uidVal: string, email: string): Promise<void> {
  const hid = currentHid;
  if (!hid || hid === uidVal) return;
  const updates: Record<string, unknown> = {};
  updates[`households/${hid}/members/${uidVal}`] = null;
  updates[`households/${uidVal}/members/${uidVal}`] = {
    email,
    joinedAt: serverTimestamp(),
  };
  updates[`userHouseholds/${uidVal}`] = uidVal;
  await update(ref(db), updates);
}

/** True if we can still read our member entry; PERMISSION_DENIED means we
 * were removed from the household. Network failures resolve true (benefit
 * of the doubt — offline must not eject anyone). */
export async function verifyMembership(hid: string, uidVal: string): Promise<boolean> {
  if (hid === uidVal) return true;
  try {
    await get(ref(db, `households/${hid}/members/${uidVal}`));
    return true;
  } catch (err) {
    return !/permission.denied/i.test(String((err as { code?: string })?.code ?? err));
  }
}
