import { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { formatCents } from '../../lib/money';
import { weekLabel } from '../../lib/dates';
import { deleteHistoryEntry } from '../../store/sync';
import { IconButton } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { toastError } from '../../components/ui/Toast';
import { TrashIcon } from '../../components/icons';

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
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const ordered = useMemo(
    () => Object.entries(history).sort(([, a], [, b]) => (b.paidAt ?? 0) - (a.paidAt ?? 0)),
    [history],
  );

  // Σ amountPaid, not Σ total: carryover re-enters the following week's
  // total by design, so summing totals would double-count it.
  const allTimePaidCents = useMemo(
    () => ordered.reduce((sum, [, e]) => sum + e.amountPaidCents, 0),
    [ordered],
  );

  return (
    <section aria-label="Payment history" className="space-y-3">
      <h2 className="text-sm font-semibold text-muted">Payment history</h2>

      {ordered.length === 0 ? (
        <p className="rounded-(--radius-card) border border-dashed border-line p-6 text-center text-sm text-muted">
          No payments recorded yet.
          <br />
          Use “Save & Pay” on the Timesheet tab.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-(--radius-card) border border-line bg-surface p-4 shadow-(--shadow-card)">
            <span className="text-sm font-bold">All-time paid</span>
            <span className="text-xl font-extrabold text-accent tabular-nums">
              {formatCents(allTimePaidCents)}
            </span>
          </div>

          <ul className="space-y-2">
            {ordered.map(([id, e]) => (
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
