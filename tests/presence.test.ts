import { describe, expect, it } from 'vitest';
import {
  GAP_MS,
  STALE_MS,
  suggestionFor,
} from '../src/lib/presence';
import { normalizePresence } from '../src/lib/schema';

// Fixed clock: 2026-07-31 17:05 local.
const NOW = new Date(2026, 6, 31, 17, 5).getTime();
const at = (h: number, m: number) => new Date(2026, 6, 31, h, m).getTime();

const DATE = '2026-07-31';

function presence(firstH: number, firstM: number, lastH: number, lastM: number, updatedAt = NOW - 60_000) {
  return {
    firstSeenAt: at(firstH, firstM),
    lastSeenAt: at(lastH, lastM),
    updatedAt,
  };
}

describe('normalizePresence', () => {
  it('coerces garbage to zeros', () => {
    expect(normalizePresence({ firstSeenAt: 'x', extra: 1 })).toEqual({
      firstSeenAt: 0,
      lastSeenAt: 0,
      updatedAt: 0,
    });
    expect(normalizePresence(null).firstSeenAt).toBe(0);
  });
});

describe('suggestionFor', () => {
  it('suggests arrival only while still present (within gap)', () => {
    const s = suggestionFor(DATE, presence(7, 58, 16, 58), undefined, NOW);
    expect(s?.patch).toEqual({ start: '08:00' }); // 7:58 rounds to 8:00
    expect(s?.detectedEnd).toBeUndefined();
  });

  it('suggests an end only after the departure gap', () => {
    const s = suggestionFor(DATE, presence(7, 57, 16, 30), undefined, NOW);
    expect(NOW - at(16, 30)).toBeGreaterThan(GAP_MS);
    expect(s?.patch).toEqual({ start: '07:55', end: '16:30' });
  });

  it('a stale sensor never produces a departure', () => {
    const staleAt = NOW - STALE_MS - 60_000;
    const s = suggestionFor(
      DATE,
      presence(7, 57, 16, 30, staleAt),
      undefined,
      NOW,
    );
    expect(s?.patch.end).toBeUndefined();
    expect(s?.sensorStale).toBe(true);
  });

  it('returns null when entered times match detection within 15 min', () => {
    const s = suggestionFor(
      DATE,
      presence(7, 57, 16, 30),
      { start: '08:05', end: '16:20', fuel: true },
      NOW,
    );
    expect(s).toBeNull();
  });

  it('re-suggests when entered times differ by more than 15 min', () => {
    const s = suggestionFor(
      DATE,
      presence(7, 57, 16, 30),
      { start: '09:00', end: '16:25', fuel: true },
      NOW,
    );
    expect(s?.patch).toEqual({ start: '07:55' }); // end within threshold, kept
  });

  it('returns null without a firstSeenAt', () => {
    expect(
      suggestionFor(DATE, { firstSeenAt: 0, lastSeenAt: 0, updatedAt: NOW }, undefined, NOW),
    ).toBeNull();
    expect(suggestionFor(DATE, undefined, undefined, NOW)).toBeNull();
  });

  it('suggestion key is stable for identical suggestions and changes with them', () => {
    const a = suggestionFor(DATE, presence(7, 57, 16, 30), undefined, NOW);
    const b = suggestionFor(DATE, presence(7, 57, 16, 30), undefined, NOW + 1000);
    const c = suggestionFor(DATE, presence(8, 12, 16, 30), undefined, NOW);
    expect(a?.key).toBe(b?.key);
    expect(a?.key).not.toBe(c?.key);
  });
});
