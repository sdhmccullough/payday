// Interprets raw sensor presence (firstSeenAt/lastSeenAt/updatedAt) into
// timesheet suggestions. The device stays dumb; every judgment call —
// departure debounce, sensor staleness, rounding, diff thresholds — lives
// here, in one tested, tunable place.

import type { DayEntry, PresenceDay } from './schema';
import { nowHHMM, roundToNearest5, roundToNearest15 } from './dates';

/** A WiFi dropout shorter than this is "still here", not a departure. */
export const GAP_MS = 30 * 60 * 1000;
/** No heartbeat for this long → the sensor is considered dead. */
export const STALE_MS = 20 * 60 * 1000;
/** Entered times within this many minutes of detection are "matching". */
export const DIFF_MIN = 15;

export interface Suggestion {
  patch: { start?: string; end?: string };
  /** Fine-grained detection for display (5-min precision). */
  detectedStart: string;
  detectedEnd?: string;
  /** True when the quarter-hour applied values differ from the display. */
  rounded: boolean;
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

  // Display shows fine-grained detection; APPLIED values round to the
  // nearest quarter hour (the household pays by 15-minute marks).
  const rawStart = hhmmFromEpoch(presence.firstSeenAt);
  const detectedStart = roundToNearest5(rawStart);
  const applyStart = roundToNearest15(rawStart);

  // A frozen lastSeenAt on a dead sensor looks exactly like a departure —
  // so departure detection requires a live heartbeat.
  const departed =
    !sensorStale && presence.lastSeenAt > 0 && now - presence.lastSeenAt > GAP_MS;
  const rawEnd = departed ? hhmmFromEpoch(presence.lastSeenAt) : undefined;
  const detectedEnd = rawEnd ? roundToNearest5(rawEnd) : undefined;
  const applyEnd = rawEnd ? roundToNearest15(rawEnd) : undefined;

  const start = entry?.start ?? '';
  const end = entry?.end ?? '';

  const patch: { start?: string; end?: string } = {};
  if (!start || absDiffMinutes(start, applyStart) > DIFF_MIN) {
    patch.start = applyStart;
  }
  if (applyEnd && (!end || absDiffMinutes(end, applyEnd) > DIFF_MIN)) {
    patch.end = applyEnd;
  }
  if (!patch.start && !patch.end) return null;

  return {
    patch,
    detectedStart,
    detectedEnd,
    rounded:
      (patch.start !== undefined && patch.start !== detectedStart) ||
      (patch.end !== undefined && patch.end !== detectedEnd),
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
