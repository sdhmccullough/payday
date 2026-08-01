import { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import {
  DAY_NAMES,
  WEEKDAY_INDICES,
  toLocalDateKey,
  weekDayKey,
  weekLabel,
} from '../../lib/dates';
import { formatCents, parseDollarInput, centsToDollars } from '../../lib/money';
import { dayMinutes } from '../../lib/schema';
import {
  clearCarryover,
  commitArchivedPay,
  computeArchivedPay,
  computeSavePay,
  discardArchivedWeek,
  fillDefaults,
  resetWeekDays,
  setBonus,
  type SavePayComputation,
} from '../../store/sync';
import { DayCard } from './DayCard';
import { PunchBanner } from './PunchBanner';
import { SavePayDialog } from './SavePayDialog';
import { Button, IconButton } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { toastError } from '../../components/ui/Toast';
import { XIcon } from '../../components/icons';
import { debounce } from '../../lib/debounce';

const debouncedSetBonus = debounce((cents: number) => {
  setBonus(cents).catch(() => toastError('Bonus not synced'));
}, 400);

/** Position of a getDay() value inside the Sat-anchored week (Sat=0 … Fri=6). */
function weekPosition(getDayValue: number): number {
  return (getDayValue + 1) % 7;
}

export function TimesheetTab() {
  const week = useStore((s) => s.week);
  const settings = useStore((s) => s.settings);
  const archivedWeeks = useStore((s) => s.archivedWeeks);
  const [resetOpen, setResetOpen] = useState(false);
  const [payCalc, setPayCalc] = useState<SavePayComputation | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [bonusText, setBonusText] = useState<string | null>(null);
  const [dismissedArchived, setDismissedArchived] = useState<string[]>([]);
  const [discardWeek, setDiscardWeek] = useState<string | null>(null);
  const [archivedPay, setArchivedPay] = useState<{
    weekStart: string;
    calc: SavePayComputation;
  } | null>(null);
  const [archivedPayOpen, setArchivedPayOpen] = useState(false);

  const totals = useMemo(() => {
    let minutes = 0;
    let fuelDays = 0;
    for (const d of Object.values(week.days)) {
      minutes += dayMinutes(d);
      if (d.fuel) fuelDays++;
    }
    const wagesCents = Math.round((minutes / 60) * settings.hourlyRateCents);
    const fuelCents = fuelDays * settings.fuelRateCents;
    return {
      minutes,
      wagesCents,
      fuelCents,
      totalCents:
        wagesCents + fuelCents + week.bonusCents + week.carryoverCents,
    };
  }, [week, settings]);

  const openSavePay = () => {
    const calc = computeSavePay();
    if (calc.totalCents <= 0) {
      toastError('Nothing to save', 'Enter some hours first.');
      return;
    }
    setPayCalc(calc);
    setPayOpen(true);
  };

  const bonusValue =
    bonusText ?? (week.bonusCents ? String(centsToDollars(week.bonusCents)) : '');

  const isPayday =
    totals.totalCents > 0 &&
    Object.keys(week.days).length > 0 &&
    weekPosition(new Date().getDay()) >= weekPosition(settings.paydayDay);

  const pendingArchived = Object.keys(archivedWeeks)
    .filter((w) => !dismissedArchived.includes(w))
    .sort()
    .reverse();

  const openArchivedPay = (weekStart: string) => {
    const calc = computeArchivedPay(weekStart);
    if (!calc) return;
    if (calc.totalCents <= 0) {
      // Nothing owed — archive held only empty/zero entries.
      discardArchivedWeek(weekStart).catch(() => toastError('Not synced'));
      return;
    }
    setArchivedPay({ weekStart, calc });
    setArchivedPayOpen(true);
  };

  return (
    <section aria-label="Timesheet" className="space-y-3">
      {pendingArchived.map((w) => {
        const calc = computeArchivedPay(w);
        return (
          <div
            key={w}
            role="status"
            className="flex flex-wrap items-center justify-between gap-2 rounded-(--radius-card) border border-warn/30 bg-surface p-3 text-sm shadow-(--shadow-card)"
          >
            <span>
              <span className="font-semibold text-warn">
                Week of {weekLabel(w)} wasn't paid
              </span>
              {calc && calc.totalCents > 0 ? (
                <span className="text-muted">
                  {' '}
                  — {formatCents(calc.totalCents)} at current rates
                </span>
              ) : null}
            </span>
            <span className="flex gap-2">
              <Button variant="primary" className="!min-h-9" onClick={() => openArchivedPay(w)}>
                Pay now
              </Button>
              <Button
                variant="ghost"
                className="!min-h-9"
                onClick={() => setDismissedArchived((d) => [...d, w])}
              >
                Dismiss
              </Button>
              <Button
                variant="ghost"
                className="!min-h-9 text-danger"
                onClick={() => setDiscardWeek(w)}
              >
                Discard
              </Button>
            </span>
          </div>
        );
      })}

      {isPayday ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-(--radius-card) border border-accent/35 bg-accent-soft p-3 text-sm"
        >
          <span className="font-semibold text-accent">
            It's payday — {formatCents(totals.totalCents)} due
          </span>
          <Button variant="primary" className="!min-h-9" onClick={openSavePay}>
            Save & Pay
          </Button>
        </div>
      ) : null}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-5">
      <div>
      <PunchBanner />

      <h2 className="mt-3 mb-3 text-sm font-semibold text-muted">
        Week of {weekLabel(week.weekStart)}
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        {DAY_NAMES.map((name, i) => {
          const key = weekDayKey(week.weekStart, i);
          return (
            <DayCard
              key={key}
              dayName={name}
              dateKey={key}
              entry={week.days[key]}
              isToday={key === toLocalDateKey(new Date())}
            />
          );
        })}
      </div>
      </div>

      <div className="mt-3 space-y-3 lg:sticky lg:top-4 lg:mt-8">
      <div className="rounded-(--radius-card) border border-line bg-surface p-4 shadow-(--shadow-card)">
        {week.carryoverCents > 0 ? (
          <div className="flex items-center justify-between border-b border-line py-2 text-sm">
            <span className="font-medium text-warn">Carryover from last week</span>
            <span className="flex items-center gap-1">
              <span className="font-semibold text-warn tabular-nums">
                {formatCents(week.carryoverCents)}
              </span>
              <IconButton
                label="Clear carryover"
                className="!size-8"
                onClick={() =>
                  clearCarryover().catch(() => toastError('Not synced'))
                }
              >
                <XIcon className="size-3.5" />
              </IconButton>
            </span>
          </div>
        ) : null}

        <div className="flex items-center justify-between py-2 text-sm">
          <span className="text-muted">Total hours</span>
          <span className="font-semibold tabular-nums">
            {(totals.minutes / 60).toFixed(2)}
          </span>
        </div>
        <div className="flex items-center justify-between py-2 text-sm">
          <span className="text-muted">Wages</span>
          <span className="font-semibold tabular-nums">
            {formatCents(totals.wagesCents)}
          </span>
        </div>
        <div className="flex items-center justify-between py-2 text-sm">
          <span className="text-muted">Fuel</span>
          <span className="font-semibold tabular-nums">
            {formatCents(totals.fuelCents)}
          </span>
        </div>
        <div className="flex items-center justify-between py-2 text-sm">
          <label htmlFor="bonus-input" className="text-muted">
            Bonus
          </label>
          <div className="flex items-center gap-1">
            <span className="text-muted">$</span>
            <input
              id="bonus-input"
              inputMode="decimal"
              value={bonusValue}
              placeholder="0"
              onChange={(e) => {
                setBonusText(e.target.value);
                const cents = parseDollarInput(e.target.value);
                if (cents !== null) debouncedSetBonus(cents);
                else if (e.target.value.trim() === '') debouncedSetBonus(0);
              }}
              onBlur={() => {
                debouncedSetBonus.flush();
                setBonusText(null);
              }}
              className="min-h-10 w-24 rounded-(--radius-control) border border-line bg-surface-2 px-2 text-right text-sm tabular-nums"
            />
          </div>
        </div>
        <div
          className="mt-1 flex items-center justify-between border-t border-line pt-3"
          aria-live="polite"
        >
          <span className="text-sm font-bold">Total pay</span>
          <span className="text-xl font-extrabold text-accent tabular-nums">
            {formatCents(totals.totalCents)}
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="primary" className="flex-1" onClick={openSavePay}>
          Save & Pay
        </Button>
        <Button variant="danger" onClick={() => setResetOpen(true)}>
          Reset week
        </Button>
      </div>
      </div>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset this week?"
        body="All times and fuel toggles for this week will be cleared. Payment history is not affected."
        confirmLabel="Reset week"
        danger
        onConfirm={() => {
          resetWeekDays().catch(() => toastError('Reset not synced'));
        }}
      />

      <SavePayDialog open={payOpen} onOpenChange={setPayOpen} calc={payCalc} />

      <SavePayDialog
        open={archivedPayOpen}
        onOpenChange={setArchivedPayOpen}
        calc={archivedPay?.calc ?? null}
        title={archivedPay ? `Pay week of ${weekLabel(archivedPay.weekStart)}` : 'Pay'}
        onCommit={(calc) =>
          archivedPay
            ? commitArchivedPay(archivedPay.weekStart, calc)
            : Promise.resolve()
        }
      />

      <ConfirmDialog
        open={discardWeek !== null}
        onOpenChange={(o) => {
          if (!o) setDiscardWeek(null);
        }}
        title="Discard this unpaid week?"
        body="Its logged hours are permanently removed without a payment being recorded."
        confirmLabel="Discard"
        danger
        onConfirm={() => {
          if (discardWeek)
            discardArchivedWeek(discardWeek).catch(() => toastError('Not synced'));
          setDiscardWeek(null);
        }}
      />
    </section>
  );
}

export function fillWeekDefaults(weekStart: string): void {
  const keys = WEEKDAY_INDICES.map((i) => weekDayKey(weekStart, i));
  fillDefaults(keys, '08:00', '17:00').catch(() =>
    toastError('Not synced', 'Check your connection.'),
  );
}
