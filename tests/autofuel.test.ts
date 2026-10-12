import { describe, expect, it } from 'vitest';
import {
  dayForWrite,
  dayMinutes,
  normalizeArchived,
  normalizeDay,
  withAutoFuel,
  type DayEntry,
} from '../src/lib/schema';

const empty: DayEntry | undefined = undefined;
const blank: DayEntry = { start: '', end: '', fuel: false };
const started: DayEntry = { start: '08:00', end: '', fuel: false };

describe('withAutoFuel', () => {
  it('adds fuel when the first start lands on an empty day', () => {
    expect(withAutoFuel(empty, { start: '08:02' })).toEqual({
      start: '08:02',
      fuel: true,
    });
    expect(withAutoFuel(blank, { start: '08:02' })).toEqual({
      start: '08:02',
      fuel: true,
    });
  });

  it('adds fuel when the first end lands on an empty day', () => {
    expect(withAutoFuel(blank, { end: '16:30' })).toEqual({
      end: '16:30',
      fuel: true,
    });
  });

  it('does not re-force fuel once the day already has a time', () => {
    expect(withAutoFuel(started, { end: '16:30' })).toEqual({ end: '16:30' });
    expect(withAutoFuel(started, { start: '07:45' })).toEqual({ start: '07:45' });
  });

  it('never overrides an explicit fuel value in the patch', () => {
    expect(withAutoFuel(blank, { start: '08:00', fuel: false })).toEqual({
      start: '08:00',
      fuel: false,
    });
  });

  it('leaves fuel-only patches untouched', () => {
    expect(withAutoFuel(blank, { fuel: true })).toEqual({ fuel: true });
    expect(withAutoFuel(started, { fuel: false })).toEqual({ fuel: false });
  });

  it('survives a normalizeDay round-trip', () => {
    const patch = withAutoFuel(blank, { start: '08:02' });
    const day = normalizeDay({ ...blank, ...patch });
    expect(day.fuel).toBe(true);
    expect(day.start).toBe('08:02');
  });
});

describe('dayMinutes', () => {
  const day = (start: string, end: string, breakMinutes?: number): DayEntry => ({
    start,
    end,
    fuel: false,
    breakMinutes,
  });

  it('is the span when there is no break', () => {
    expect(dayMinutes(day('08:00', '17:00'))).toBe(540);
    expect(dayMinutes(undefined)).toBe(0);
  });

  it('subtracts an unpaid break', () => {
    expect(dayMinutes(day('08:00', '17:00', 120))).toBe(420);
  });

  it('never goes negative when the break exceeds the span', () => {
    expect(dayMinutes(day('08:00', '09:00', 120))).toBe(0);
  });

  it('ignores breaks on invalid or empty spans', () => {
    expect(dayMinutes(day('17:00', '08:00', 60))).toBe(0);
    expect(dayMinutes(day('', '', 60))).toBe(0);
  });

  it('normalizeDay keeps and cleans breakMinutes', () => {
    expect(normalizeDay({ start: '08:00', end: '17:00', breakMinutes: 120.4 }).breakMinutes).toBe(120);
    expect(normalizeDay({ start: '08:00', end: '17:00', breakMinutes: -5 }).breakMinutes).toBeUndefined();
    expect(normalizeDay({ start: '08:00', end: '17:00' }).breakMinutes).toBeUndefined();
  });
});

describe('dayForWrite', () => {
  // RTDB rejects an entire update if any nested value is undefined; the
  // week rollover writes normalized days back, so this guards that write.
  it('never carries undefined values', () => {
    const d = normalizeDay({ start: '08:00', end: '17:00', fuel: true });
    expect(d.breakMinutes).toBeUndefined();
    const out = dayForWrite(d);
    expect(Object.values(out).some((v) => v === undefined)).toBe(false);
    expect(out).toEqual({ start: '08:00', end: '17:00', fuel: true });
  });

  it('keeps break and editor when present', () => {
    const d = normalizeDay({ start: '08:00', end: '17:00', fuel: false, breakMinutes: 30, by: 'u1' });
    expect(dayForWrite(d)).toEqual({
      start: '08:00', end: '17:00', fuel: false, breakMinutes: 30, by: 'u1',
    });
  });
});

describe('normalizeArchived', () => {
  it('never yields a negative bonus', () => {
    expect(normalizeArchived({ bonusCents: -500 }).bonusCents).toBe(0);
    expect(normalizeArchived({ bonusCents: 'x' }).bonusCents).toBe(0);
  });
});
