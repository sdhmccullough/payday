// Interprets raw sensor presence (firstSeenAt/lastSeenAt/updatedAt) into
// timesheet suggestions. The device stays dumb; every judgment call —
// departure debounce, sensor staleness, rounding, diff thresholds — lives
// here, in one tested, tunable place.

import type { DayEntry, PresenceDay } from './schema';
import { nowHHMM, roundToNearest5 } from './dates';

/** A WiFi dropout shorter than this is "still here", not a departure. */
export const GAP_MS = 30 * 60 * 1000;
/** No heartbeat for this long → the sensor is considered dead. */
export const STALE_MS = 20 * 60 * 1000;
/** Entered times within this many minutes of detection are "matching". */
export const DIFF_MIN = 15;

export interface Suggestion {
  patch: { start?: string; end?: string };
  detectedStart: string;
  detectedEnd?: string;
  sensorStale: boolean;
  /** Stable identity for dismissal — changes iff the suggestion changes. */
  key: string;
}

function hhmmFromEpoch(ms: number): string {
  return nowHHMM(new Date(ms));
}

function absDiffMinutes(a: string, b: string): number {
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  return Math.abs(ah * 60 + am - (bh * 60 + bm));
}

export function suggestionFor(
  dateKey: string,
  presence: PresenceDay | undefined,
  entry: DayEntry | undefined,
  now = Date.now(),
): Suggestion | null {
  if (!presence || presence.firstSeenAt <= 0) return null;

  const sensorStale = presence.updatedAt > 0 && now - presence.updatedAt > STALE_MS;
  const detectedStart = roundToNearest5(hhmmFromEpoch(presence.firstSeenAt));

  // A frozen lastSeenAt on a dead sensor looks exactly like a departure —
  // so departure detection requires a live heartbeat.
  const departed =
    !sensorStale && presence.lastSeenAt > 0 && now - presence.lastSeenAt > GAP_MS;
  const detectedEnd = departed
    ? roundToNearest5(hhmmFromEpoch(presence.lastSeenAt))
    : undefined;

  const start = entry?.start ?? '';
  const end = entry?.end ?? '';

  const patch: { start?: string; end?: string } = {};
  if (!start || absDiffMinutes(start, detectedStart) > DIFF_MIN) {
    patch.start = detectedStart;
  }
  if (detectedEnd && (!end || absDiffMinutes(end, detectedEnd) > DIFF_MIN)) {
    patch.end = detectedEnd;
  }
  if (!patch.start && !patch.end) return null;

  return {
    patch,
    detectedStart,
    detectedEnd,
    sensorStale,
    key: `${dateKey}|${patch.start ?? ''}|${patch.end ?? ''}`,
  };
}

const DISMISS_PREFIX = 'payday:sugg-dismiss:';

export function isDismissed(dateKey: string, key: string): boolean {
  try {
    return localStorage.getItem(DISMISS_PREFIX + dateKey) === key;
  } catch {
    return false;
  }
}

export function dismissSuggestion(dateKey: string, key: string): void {
  try {
    localStorage.setItem(DISMISS_PREFIX + dateKey, key);
  } catch {
    /* private mode */
  }
}
