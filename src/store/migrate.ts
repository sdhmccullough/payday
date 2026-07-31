// One-time in-app v1 → v2 converter.
//
// v1 stored one JSON blob at households/$hid/state (dollars as floats,
// arrays for ledgers). v2 splits it into scoped nodes with integer cents.
// Runs under the signed-in member's own auth on first load; the old blob is
// moved to stateV1Backup, never deleted. Gated on meta/schemaVersion so it
// runs exactly once per household. (If two members race, both compute the
// same output from the same input — last write wins harmlessly.)

import { get, ref, serverTimestamp, update } from 'firebase/database';
import { db } from '../lib/firebase';
import { patchStore } from './useStore';
import { SCHEMA_VERSION } from '../lib/schema';
import { centsFromDollars } from '../lib/money';

interface V1Day {
  start?: string;
  end?: string;
  fuel?: boolean;
}

interface V1Txn {
  id?: string;
  type?: string;
  label?: string;
  amount?: number;
  breakdown?: Record<string, number>;
  date?: string;
}

interface V1History {
  id?: string;
  weekStart?: string;
  weekLabel?: string;
  hours?: number;
  wages?: number;
  fuel?: number;
  bonus?: number;
  carryover?: number;
  total?: number;
  amountPaid?: number;
  shortfall?: number;
  paidDate?: string;
}

function asList<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v.filter(Boolean) as T[];
  if (v && typeof v === 'object') return Object.values(v).filter(Boolean) as T[];
  return [];
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

let keyCounter = 0;
function fallbackKey(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${(keyCounter++).toString(36)}`;
}

/** Pure v1→v2 conversion; exported for unit tests. */
export function buildV2Updates(
  v1: Record<string, unknown> | null,
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};

  if (v1) {
      updates['settings'] = {
        hourlyRateCents: centsFromDollars(num(v1.hourlyRate) || 22),
        fuelRateCents: centsFromDollars(num(v1.fuelRate) || 10),
      };

      const days: Record<string, unknown> = {};
      for (const [key, d] of Object.entries(
        (v1.days as Record<string, V1Day>) ?? {},
      )) {
        if (!d) continue;
        days[key] = {
          start: d.start ?? '',
          end: d.end ?? '',
          fuel: d.fuel === true,
        };
      }
      updates['week'] = {
        weekStart: typeof v1.weekStart === 'string' ? v1.weekStart : null,
        bonusCents: centsFromDollars(num(v1.bonus)),
        carryoverCents: centsFromDollars(num(v1.carryover)),
        days: Object.keys(days).length ? days : null,
      };

      const counts: Record<string, number> = {};
      for (const [bill, n] of Object.entries(
        (v1.cash as Record<string, number>) ?? {},
      )) {
        counts[bill] = Math.max(0, Math.round(num(n)));
      }
      updates['cash/counts'] = counts;

      for (const t of asList<V1Txn>(v1.cashTransactions)) {
        const key = t.id || fallbackKey('txn');
        updates[`cashTransactions/${key}`] = {
          type: t.type === 'deposit' ? 'deposit' : 'withdrawal',
          label: t.label ?? '',
          amountCents: centsFromDollars(Math.abs(num(t.amount))),
          breakdown: t.breakdown ?? null,
          dateLabel: t.date ?? '',
          at: null,
        };
      }

      for (const h of asList<V1History>(v1.history)) {
        const key = h.id || fallbackKey('hist');
        updates[`history/${key}`] = {
          weekStart: h.weekStart ?? '',
          minutes: Math.round(num(h.hours) * 60),
          wagesCents: centsFromDollars(num(h.wages)),
          fuelCents: centsFromDollars(num(h.fuel)),
          bonusCents: centsFromDollars(num(h.bonus)),
          carryoverCents: centsFromDollars(num(h.carryover)),
          totalCents: centsFromDollars(num(h.total)),
          amountPaidCents: centsFromDollars(
            h.amountPaid === undefined ? num(h.total) : num(h.amountPaid),
          ),
          shortfallCents: centsFromDollars(num(h.shortfall)),
          paidDateLabel: h.paidDate ?? '',
          paidAt: null,
        };
      }

      for (const [weekStart, a] of Object.entries(
        (v1.archivedWeeks as Record<string, { days?: unknown; bonus?: number }>) ??
          {},
      )) {
        if (!a) continue;
        updates[`archivedWeeks/${weekStart}`] = {
          days: a.days ?? null,
          bonusCents: centsFromDollars(num(a.bonus)),
        };
      }

      updates['stateV1Backup'] = v1;
      updates['state'] = null;
    }

  updates['meta/schemaVersion'] = SCHEMA_VERSION;
  return updates;
}

export async function runMigrationIfNeeded(hid: string): Promise<void> {
  let version: unknown;
  try {
    version = (await get(ref(db, `households/${hid}/meta/schemaVersion`))).val();
  } catch {
    // Offline or rules not yet extended — skip; we'll retry next attach.
    return;
  }
  if (version === SCHEMA_VERSION) return;

  patchStore({ migrating: true });
  try {
    const v1 = (await get(ref(db, `households/${hid}/state`))).val() as Record<
      string,
      unknown
    > | null;

    const updates = buildV2Updates(v1);
    updates['meta/ownerUid'] = hid; // v1 invariant: household id IS creator uid
    updates['meta/migratedAt'] = serverTimestamp();

    await update(ref(db, `households/${hid}`), updates);
  } finally {
    patchStore({ migrating: false });
  }
}
