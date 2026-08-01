import { useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';
import { punchToday } from '../../store/sync';
import {
  formatHHMM12,
  minutesBetween,
  nowHHMM,
  toLocalDateKey,
} from '../../lib/dates';
import { Button } from '../../components/ui/Button';
import { toastError } from '../../components/ui/Toast';
import { CheckIcon } from '../../components/icons';

export function PunchBanner() {
  const week = useStore((s) => s.week);
  const presence = useStore((s) => s.presence);
  const [busy, setBusy] = useState(false);
  // Re-render each minute so the clock and elapsed time stay honest.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const todayKey = toLocalDateKey(new Date());
  const day = week.days[todayKey];
  const start = day?.start ?? '';
  const end = day?.end ?? '';
  const today = presence[todayKey];

  const punch = (kind: 'start' | 'end') => {
    setBusy(true);
    punchToday(kind)
      .catch((err) =>
        toastError(
          'Punch not saved',
          err instanceof Error ? err.message : 'Check your connection.',
        ),
      )
      .finally(() => setBusy(false));
  };

  const freshness =
    today && today.updatedAt > 0 ? (
      <span className="text-xs text-muted">
        Sensor last reported {formatHHMM12(nowHHMM(new Date(today.updatedAt)))}
      </span>
    ) : null;

  if (start && end) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-(--radius-card) border border-line bg-surface p-3 text-sm shadow-(--shadow-card)">
        <span className="inline-flex items-center gap-1.5">
          <CheckIcon className="size-4 text-accent" />
          Today: {formatHHMM12(start)} – {formatHHMM12(end)}
        </span>
        {freshness}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-(--radius-card) border border-accent/35 bg-surface p-3 text-sm shadow-(--shadow-card)">
      <span>
        {start ? (
          <>
            <span className="font-semibold">
              Started {formatHHMM12(start)}
            </span>
            <span className="text-muted">
              {' '}
              · {(minutesBetween(start, nowHHMM()) / 60).toFixed(1)} hrs so far
            </span>
          </>
        ) : (
          <span className="font-semibold">
            Today · {formatHHMM12(nowHHMM())}
          </span>
        )}
        {freshness ? <span className="block">{freshness}</span> : null}
      </span>
      <Button
        variant="primary"
        className="!min-h-10"
        disabled={busy}
        onClick={() => punch(start ? 'end' : 'start')}
      >
        {start ? 'End day' : 'Start day'}
      </Button>
    </div>
  );
}
