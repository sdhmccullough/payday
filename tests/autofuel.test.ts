import { describe, expect, it } from 'vitest';
import { withAutoFuel, normalizeDay, type DayEntry } from '../src/lib/schema';

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
