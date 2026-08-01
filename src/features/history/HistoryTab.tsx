import { Suspense, lazy, useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { formatCents } from '../../lib/money';
import { weekLabel } from '../../lib/dates';
import { historyToCsv, downloadOrShareCsv } from '../../lib/csv';
import { deleteHistoryEntry } from '../../store/sync';
import { Button, IconButton } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { toastError } from '../../components/ui/Toast';
import { TrashIcon } from '../../components/icons';
import {
  filterByPeriod,
  historyMonths,
  historyYears,
  summarize,
} from './insights';

const ChartsPanel = lazy(() => import('./ChartsPanel'));

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function StatTile({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="rounded-(--radius-card) border border-line bg-surface p-3 shadow-(--shadow-card)">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-lg font-extrabold text-accent tabular-nums">
        {formatCents(cents)}
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-9 rounded-full border px-3 text-xs font-semibold transition ${
        active
          ? 'border-accent-strong bg-accent-soft text-accent'
          : 'border-line bg-surface-2 text-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  );
}

function Chip({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'danger' }) {
  return (
    <span
      className={`rounded-full bg-surface-2 px-2.5 py-1 text-xs ${
        tone === 'warn' ? 'text-warn' : tone === 'danger' ? 'text-danger' : 'text-muted'
      }`}
    >
      {label}: <span className="font-semibold text-current">{value}</span>
    </span>
  );
}

export function HistoryTab() {
  const history = useStore((s) => s.history);
  const priorPayments = useStore((s) => s.priorPayments);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [year, setYear] = useState<number | 'all'>('all');
  const [month, setMonth] = useState<number | 'all'>('all');

  const ordered = useMemo(
    () => Object.entries(history).sort(([, a], [, b]) => (b.paidAt ?? 0) - (a.paidAt ?? 0)),
    [history],
  );
  const allEntries = useMemo(() => ordered.map(([, e]) => e), [ordered]);
  const prior = useMemo(() => Object.values(priorPayments), [priorPayments]);

  const summary = useMemo(() => summarize(allEntries, prior), [allEntries, prior]);
  const years = useMemo(() => historyYears(allEntries), [allEntries]);
  const months = useMemo(
    () => (year === 'all' ? [] : historyMonths(allEntries, year)),
    [allEntries, year],
  );

  const filtered = useMemo(
    () => filterByPeriod(ordered, year, month),
    [ordered, year, month],
  );

  const exportCsv = () => {
    const entries = filtered.map(([, e]) => e);
    const suffix =
      year === 'all'
        ? 'all'
        : month === 'all'
          ? String(year)
          : `${year}-${String(month + 1).padStart(2, '0')}`;
    downloadOrShareCsv(historyToCsv(entries), `payday-history-${suffix}.csv`);
  };

  return (
    <section aria-label="Payment history" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted">Payment history</h2>
        {ordered.length > 0 ? (
          <Button variant="outline" onClick={exportCsv}>
            Export CSV
          </Button>
        ) : null}
      </div>

      {ordered.length === 0 ? (
        <p className="rounded-(--radius-card) border border-dashed border-line p-6 text-center text-sm text-muted">
          No payments recorded yet.
          <br />
          Use “Save & Pay” on the Timesheet tab.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <StatTile label="This month" cents={summary.thisMonthCents} />
            <StatTile label="Year to date" cents={summary.ytdCents} />
            <StatTile label="All-time" cents={summary.allTimeCents} />
          </div>
          {summary.priorCents > 0 ? (
            <p className="text-xs text-muted">
              Includes {formatCents(summary.priorCents)} of cash withdrawals
              imported from bank records, before the app tracked payments.
            </p>
          ) : null}

          <Suspense
            fallback={
              <div
                className="h-96 animate-pulse rounded-(--radius-card) border border-line bg-surface"
                aria-hidden="true"
              />
            }
          >
            <ChartsPanel entries={allEntries} prior={prior} />
          </Suspense>

          {years.length > 1 || months.length > 0 ? (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter history">
              <FilterChip
                label="All"
                active={year === 'all'}
                onClick={() => {
                  setYear('all');
                  setMonth('all');
                }}
              />
              {years.map((y) => (
                <FilterChip
                  key={y}
                  label={String(y)}
                  active={year === y}
                  onClick={() => {
                    setYear(y);
                    setMonth('all');
                  }}
                />
              ))}
              {year !== 'all'
                ? months.map((m) => (
                    <FilterChip
                      key={m}
                      label={MONTH_NAMES[m]}
                      active={month === m}
                      onClick={() => setMonth(month === m ? 'all' : m)}
                    />
                  ))
                : null}
            </div>
          ) : null}

          {filtered.length === 0 ? (
            <p className="rounded-(--radius-card) border border-dashed border-line p-6 text-center text-sm text-muted">
              No payments in this period.
            </p>
          ) : (
            <ul className="space-y-2">
              {filtered.map(([id, e]) => (
                <li
                  key={id}
                  className="rounded-(--radius-card) border border-line bg-surface p-4 shadow-(--shadow-card)"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold">
                      {e.weekStart ? weekLabel(e.weekStart) : '—'}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="text-base font-extrabold text-accent tabular-nums">
                        {formatCents(e.amountPaidCents)}
                      </span>
                      <IconButton
                        label="Delete payment record"
                        className="!size-9"
                        onClick={() => setDeleteId(id)}
                      >
                        <TrashIcon className="size-4" />
                      </IconButton>
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Chip label="Hours" value={(e.minutes / 60).toFixed(2)} />
                    <Chip label="Wages" value={formatCents(e.wagesCents)} />
                    <Chip label="Fuel" value={formatCents(e.fuelCents)} />
                    {e.bonusCents > 0 ? (
                      <Chip label="Bonus" value={formatCents(e.bonusCents)} />
                    ) : null}
                    {e.carryoverCents > 0 ? (
                      <Chip
                        label="Carryover"
                        value={formatCents(e.carryoverCents)}
                        tone="warn"
                      />
                    ) : null}
                    {e.shortfallCents > 0 ? (
                      <Chip
                        label="Short"
                        value={formatCents(e.shortfallCents)}
                        tone="danger"
                      />
                    ) : null}
                    <Chip label="Paid" value={e.paidDateLabel || '—'} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteId(null);
        }}
        title="Delete this payment record?"
        body="This removes the history entry only — cash counts and carryover are not changed."
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (deleteId)
            deleteHistoryEntry(deleteId).catch(() => toastError('Not synced'));
          setDeleteId(null);
        }}
      />
    </section>
  );
}
