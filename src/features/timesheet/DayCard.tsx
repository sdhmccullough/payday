import { memo } from 'react';
import type { DayEntry } from '../../lib/schema';
import { formatShort, minutesBetween, parseDateKey } from '../../lib/dates';
import { clearDay, setDayField } from '../../store/sync';
import { Switch } from '../../components/ui/Switch';
import { IconButton } from '../../components/ui/Button';
import { XIcon } from '../../components/icons';
import { toastError } from '../../components/ui/Toast';

function onWriteError(err: unknown) {
  console.error(err);
  toastError('Save failed', 'Change kept locally; check your connection.');
}

export const DayCard = memo(function DayCard({
  dayName,
  dateKey,
  entry,
}: {
  dayName: string;
  dateKey: string;
  entry: DayEntry | undefined;
}) {
  const start = entry?.start ?? '';
  const end = entry?.end ?? '';
  const fuel = entry?.fuel ?? false;
  const minutes = minutesBetween(start, end);
  const hasBoth = Boolean(start && end);
  const invalidRange = hasBoth && minutes === 0;
  const hasEntry = Boolean(start || end || fuel);

  return (
    <div
      className={`rounded-(--radius-card) border bg-surface p-4 shadow-(--shadow-card) transition ${
        minutes > 0 ? 'border-accent/35' : 'border-line'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-bold">{dayName}</span>
          <span className="text-xs text-muted">
            {formatShort(parseDateKey(dateKey))}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span
            className={`text-sm font-semibold tabular-nums ${
              minutes > 0 ? 'text-accent' : 'text-muted'
            }`}
          >
            {minutes > 0 ? (minutes / 60).toFixed(2) + ' hrs' : '—'}
          </span>
          {hasEntry ? (
            <IconButton
              label={`Clear ${dayName}`}
              className="!size-9"
              onClick={() => clearDay(dateKey).catch(onWriteError)}
            >
              <XIcon className="size-4" />
            </IconButton>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex items-end gap-3">
        <label className="flex-1">
          <span className="mb-1 block text-xs font-medium text-muted">Start</span>
          <input
            type="time"
            step={900}
            value={start}
            onChange={(e) =>
              setDayField(dateKey, { start: e.target.value }).catch(onWriteError)
            }
            className="min-h-11 w-full rounded-(--radius-control) border border-line bg-surface-2 px-3 text-sm"
          />
        </label>
        <span aria-hidden="true" className="pb-3 text-muted">
          →
        </span>
        <label className="flex-1">
          <span className="mb-1 block text-xs font-medium text-muted">End</span>
          <input
            type="time"
            step={900}
            value={end}
            onChange={(e) =>
              setDayField(dateKey, { end: e.target.value }).catch(onWriteError)
            }
            className="min-h-11 w-full rounded-(--radius-control) border border-line bg-surface-2 px-3 text-sm"
          />
        </label>
      </div>

      {invalidRange ? (
        <p role="alert" className="mt-2 text-xs font-medium text-warn">
          End time must be after start time.
        </p>
      ) : null}

      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm text-muted">Fuel reimbursement</span>
        <Switch
          checked={fuel}
          onCheckedChange={(v) =>
            setDayField(dateKey, { fuel: v }).catch(onWriteError)
          }
          label={`Fuel reimbursement for ${dayName}`}
        />
      </div>
    </div>
  );
});
