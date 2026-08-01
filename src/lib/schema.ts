// Schema v2 types + snapshot normalizers.
//
// RTDB has no schema: empty objects vanish, arrays come back as objects,
// and any member can write any shape. Every snapshot passes through a
// normalizer before entering the store, so the rest of the app can trust
// the types.

import type { BillBreakdown, BillCounts, Cents } from './money';
import { BILLS } from './money';
import { currentWeekStart, minutesBetween } from './dates';

export const SCHEMA_VERSION = 2;

export interface DayEntry {
  start: string; // "HH:MM" 24h, '' = unset
  end: string;
  fuel: boolean;
  /** Unpaid break minutes deducted from the day (rare; e.g. a midday outing). */
  breakMinutes?: number;
  by?: string; // uid of last editor
}

export interface WeekState {
  weekStart: string; // YYYY-MM-DD, Saturday
  bonusCents: Cents;
  carryoverCents: Cents;
  days: Record<string, DayEntry>; // keyed by local date
}

export interface Settings {
  hourlyRateCents: Cents;
  fuelRateCents: Cents;
  /** Day pay is due, JS getDay() numbering (0=Sun … 6=Sat). Default Friday. */
  paydayDay: number;
}

export interface CashTxn {
  type: 'deposit' | 'withdrawal';
  label: string;
  amountCents: Cents;
  breakdown?: BillBreakdown;
  dateLabel: string; // display string; v1 rows carry their original text
  at: number | null; // epoch ms when known
  by?: string;
}

export interface HistoryEntry {
  weekStart: string;
  minutes: number;
  wagesCents: Cents;
  fuelCents: Cents;
  bonusCents: Cents;
  carryoverCents: Cents;
  totalCents: Cents;
  amountPaidCents: Cents;
  shortfallCents: Cents;
  breakdown?: BillBreakdown;
  paidDateLabel: string;
  paidAt: number | null;
  by?: string;
}

export interface ArchivedWeek {
  days: Record<string, DayEntry>;
  bonusCents: Cents;
}

export interface Member {
  email: string;
  joinedAt: number | null;
}

/** Imported bank-recorded cash payment from before the app tracked payments. */
export interface PriorPayment {
  dateKey: string; // YYYY-MM-DD
  amountCents: Cents;
  label: string;
}

/** Raw WiFi-presence observations for one local date, written by a sensor
 * (e.g. the UDM poller). Flat epoch-ms timestamps; ALL interpretation
 * (gap tolerance, staleness, formatting) happens app-side. */
export interface PresenceDay {
  firstSeenAt: number;
  lastSeenAt: number;
  updatedAt: number;
}

export const DEFAULT_SETTINGS: Settings = {
  hourlyRateCents: 2200,
  fuelRateCents: 1000,
  paydayDay: 5,
};

// ---- normalizers ----------------------------------------------------------

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

/** Auto-fuel: the household pays flat fuel every day worked, so the first
 * time value landing on an empty day switches fuel on. Explicit fuel in the
 * patch, or a day that already has a time, is never overridden — the per-day
 * switch stays authoritative. */
export function withAutoFuel(
  existing: DayEntry | undefined,
  patch: Partial<Pick<DayEntry, 'start' | 'end' | 'fuel' | 'breakMinutes'>>,
): Partial<Pick<DayEntry, 'start' | 'end' | 'fuel' | 'breakMinutes'>> {
  const setsTime = Boolean(patch.start) || Boolean(patch.end);
  const hadTime = Boolean(existing?.start) || Boolean(existing?.end);
  if (setsTime && !hadTime && patch.fuel === undefined) {
    return { ...patch, fuel: true };
  }
  return patch;
}

export function normalizeDay(v: unknown): DayEntry {
  const o = rec(v);
  const brk = Math.max(0, Math.round(num(o.breakMinutes)));
  return {
    start: str(o.start),
    end: str(o.end),
    fuel: o.fuel === true,
    breakMinutes: brk > 0 ? brk : undefined,
    by: typeof o.by === 'string' ? o.by : undefined,
  };
}

/** Paid minutes for a day: the start–end span minus any unpaid break. */
export function dayMinutes(entry: DayEntry | undefined): number {
  if (!entry) return 0;
  const span = minutesBetween(entry.start, entry.end);
  if (span <= 0) return 0;
  return Math.max(0, span - (entry.breakMinutes ?? 0));
}

export function normalizeWeek(v: unknown): WeekState {
  const o = rec(v);
  const days: Record<string, DayEntry> = {};
  for (const [k, d] of Object.entries(rec(o.days))) days[k] = normalizeDay(d);
  return {
    weekStart: str(o.weekStart) || currentWeekStart(),
    bonusCents: num(o.bonusCents),
    carryoverCents: num(o.carryoverCents),
    days,
  };
}

export function normalizeSettings(v: unknown): Settings {
  const o = rec(v);
  const day = num(o.paydayDay, DEFAULT_SETTINGS.paydayDay);
  return {
    hourlyRateCents: num(o.hourlyRateCents, DEFAULT_SETTINGS.hourlyRateCents),
    fuelRateCents: num(o.fuelRateCents, DEFAULT_SETTINGS.fuelRateCents),
    paydayDay: day >= 0 && day <= 6 ? Math.round(day) : DEFAULT_SETTINGS.paydayDay,
  };
}

export function normalizeCounts(v: unknown): BillCounts {
  const o = rec(v);
  const counts: BillCounts = {};
  for (const b of BILLS) counts[String(b)] = Math.max(0, Math.round(num(o[String(b)])));
  return counts;
}

function normalizeBreakdown(v: unknown): BillBreakdown | undefined {
  const o = rec(v);
  const out: BillBreakdown = {};
  let any = false;
  for (const b of BILLS) {
    const n = num(o[String(b)]);
    if (n > 0) {
      out[String(b)] = Math.round(n);
      any = true;
    }
  }
  return any ? out : undefined;
}

export function normalizeTxn(v: unknown): CashTxn {
  const o = rec(v);
  return {
    type: o.type === 'deposit' ? 'deposit' : 'withdrawal',
    label: str(o.label),
    amountCents: num(o.amountCents),
    breakdown: normalizeBreakdown(o.breakdown),
    dateLabel: str(o.dateLabel),
    at: typeof o.at === 'number' ? o.at : null,
    by: typeof o.by === 'string' ? o.by : undefined,
  };
}

export function normalizeHistory(v: unknown): HistoryEntry {
  const o = rec(v);
  return {
    weekStart: str(o.weekStart),
    minutes: num(o.minutes),
    wagesCents: num(o.wagesCents),
    fuelCents: num(o.fuelCents),
    bonusCents: num(o.bonusCents),
    carryoverCents: num(o.carryoverCents),
    totalCents: num(o.totalCents),
    amountPaidCents: num(o.amountPaidCents),
    shortfallCents: num(o.shortfallCents),
    breakdown: normalizeBreakdown(o.breakdown),
    paidDateLabel: str(o.paidDateLabel),
    paidAt: typeof o.paidAt === 'number' ? o.paidAt : null,
    by: typeof o.by === 'string' ? o.by : undefined,
  };
}

export function normalizeKeyed<T>(
  v: unknown,
  normalizeOne: (item: unknown) => T,
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, item] of Object.entries(rec(v))) out[k] = normalizeOne(item);
  return out;
}

export function normalizeArchived(v: unknown): ArchivedWeek {
  const o = rec(v);
  const days: Record<string, DayEntry> = {};
  for (const [k, d] of Object.entries(rec(o.days))) days[k] = normalizeDay(d);
  return { days, bonusCents: num(o.bonusCents) };
}

export function normalizeMember(v: unknown): Member {
  // v1 stored a bare email string; v2 stores an object.
  if (typeof v === 'string') return { email: v, joinedAt: null };
  const o = rec(v);
  return {
    email: str(o.email),
    joinedAt: typeof o.joinedAt === 'number' ? o.joinedAt : null,
  };
}

export function normalizePriorPayment(v: unknown): PriorPayment {
  const o = rec(v);
  return {
    dateKey: str(o.dateKey),
    amountCents: num(o.amountCents),
    label: str(o.label),
  };
}

export function normalizePresence(v: unknown): PresenceDay {
  const o = rec(v);
  return {
    firstSeenAt: num(o.firstSeenAt),
    lastSeenAt: num(o.lastSeenAt),
    updatedAt: num(o.updatedAt),
  };
}
