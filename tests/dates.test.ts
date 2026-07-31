import { describe, expect, it } from 'vitest';
import {
  currentWeekSaturday,
  currentWeekStart,
  minutesBetween,
  parseDateKey,
  toLocalDateKey,
  weekDayKey,
  weekLabel,
} from '../src/lib/dates';

// These tests are timezone-sensitive by design: run them under multiple TZ
// values (e.g. TZ=Asia/Tokyo, TZ=America/Denver) to lock in the local-date
// guarantee that fixed the v1 cross-timezone week-wipe bug.

describe('toLocalDateKey', () => {
  it('uses the local calendar date, not UTC', () => {
    // 00:30 local on Jan 1 — in UTC+ zones the UTC date is Dec 31.
    const d = new Date(2026, 0, 1, 0, 30);
    expect(toLocalDateKey(d)).toBe('2026-01-01');
  });

  it('round-trips through parseDateKey', () => {
    const key = '2026-07-25';
    expect(toLocalDateKey(parseDateKey(key))).toBe(key);
  });

  it('pads months and days', () => {
    expect(toLocalDateKey(new Date(2026, 2, 5))).toBe('2026-03-05');
  });
});

describe('currentWeekSaturday', () => {
  it('returns the same day for a Saturday', () => {
    const sat = new Date(2026, 6, 25, 14, 0); // Sat Jul 25 2026
    expect(toLocalDateKey(currentWeekSaturday(sat))).toBe('2026-07-25');
  });

  it('returns the previous Saturday for a Friday', () => {
    const fri = new Date(2026, 6, 31, 9, 0); // Fri Jul 31 2026
    expect(toLocalDateKey(currentWeekSaturday(fri))).toBe('2026-07-25');
  });

  it('returns the previous Saturday for a Sunday', () => {
    const sun = new Date(2026, 6, 26, 1, 0); // Sun Jul 26 2026
    expect(toLocalDateKey(currentWeekSaturday(sun))).toBe('2026-07-25');
  });

  it('anchors at local midnight', () => {
    const sat = currentWeekSaturday(new Date(2026, 6, 29, 23, 59));
    expect(sat.getHours()).toBe(0);
    expect(sat.getMinutes()).toBe(0);
  });

  it('currentWeekStart matches key format', () => {
    expect(currentWeekStart(new Date(2026, 6, 31))).toBe('2026-07-25');
  });
});

describe('weekDayKey / weekLabel', () => {
  it('walks Sat→Fri', () => {
    expect(weekDayKey('2026-07-25', 0)).toBe('2026-07-25');
    expect(weekDayKey('2026-07-25', 6)).toBe('2026-07-31');
  });

  it('crosses month boundaries', () => {
    expect(weekDayKey('2026-07-25', 7)).toBe('2026-08-01');
  });

  it('labels the range', () => {
    expect(weekLabel('2026-07-25')).toBe('Jul 25 – Jul 31');
  });
});

describe('minutesBetween', () => {
  it('computes a normal shift', () => {
    expect(minutesBetween('08:00', '17:00')).toBe(540);
  });

  it('handles partial hours', () => {
    expect(minutesBetween('08:00', '16:20')).toBe(500);
  });

  it('returns 0 for reversed times instead of inventing an overnight shift', () => {
    expect(minutesBetween('17:00', '08:00')).toBe(0);
  });

  it('returns 0 for missing values', () => {
    expect(minutesBetween('', '17:00')).toBe(0);
    expect(minutesBetween('08:00', '')).toBe(0);
  });
});
