import { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import {
  BILLS,
  cashTotalCents,
  formatBreakdown,
  formatCents,
} from '../../lib/money';
import {
  adjustBill,
  deleteTransaction,
  depositCash,
} from '../../store/sync';
import { Button, IconButton } from '../../components/ui/Button';
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog';
import { toast, toastError } from '../../components/ui/Toast';
import { MinusIcon, PlusIcon, TrashIcon } from '../../components/icons';

function Stepper({
  label,
  value,
  onDelta,
}: {
  label: string;
  value: number;
  onDelta: (delta: 1 | -1) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <IconButton
        label={`Remove a ${label} bill`}
        className="border border-line bg-surface-2"
        onClick={() => onDelta(-1)}
        disabled={value <= 0}
      >
        <MinusIcon className="size-4" />
      </IconButton>
      <span
        className="w-8 text-center text-base font-bold tabular-nums"
        aria-live="polite"
      >
        {value}
      </span>
      <IconButton
        label={`Add a ${label} bill`}
        className="border border-line bg-surface-2"
        onClick={() => onDelta(1)}
      >
        <PlusIcon className="size-4" />
      </IconButton>
    </div>
  );
}

function DepositDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const totalCents = cashTotalCents(counts);

  const bump = (bill: number, delta: 1 | -1) =>
    setCounts((c) => ({
      ...c,
      [String(bill)]: Math.max(0, (c[String(bill)] ?? 0) + delta),
    }));

  const submit = async () => {
    try {
      await depositCash(counts);
      onOpenChange(false);
      setCounts({});
      toast(`Deposited ${formatCents(totalCents)}`);
    } catch (err) {
      console.error(err);
      toastError('Deposit not saved', 'Check your connection and try again.');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setCounts({});
      }}
      title="Add cash"
      description="Count the bills going into the drawer."
    >
      <div className="space-y-2">
        {BILLS.map((bill) => (
          <div
            key={bill}
            className="flex items-center justify-between rounded-(--radius-control) bg-surface-2 px-3 py-2"
          >
            <span className="text-sm font-bold">${bill}</span>
            <Stepper
              label={`$${bill}`}
              value={counts[String(bill)] ?? 0}
              onDelta={(d) => bump(bill, d)}
            />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm font-semibold">Total</span>
        <span className="font-bold text-accent tabular-nums">
          {formatCents(totalCents)}
        </span>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={totalCents <= 0}
          onClick={() => void submit()}
        >
          Deposit
        </Button>
      </div>
    </Dialog>
  );
}

export function CashTab() {
  const cashCounts = useStore((s) => s.cashCounts);
  const txns = useStore((s) => s.cashTransactions);
  const [depositOpen, setDepositOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const totalCents = cashTotalCents(cashCounts);

  const ordered = useMemo(
    () =>
      Object.entries(txns).sort(
        ([, a], [, b]) => (b.at ?? 0) - (a.at ?? 0),
      ),
    [txns],
  );

  return (
    <section
      aria-label="Cash drawer"
      className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5 lg:space-y-0"
    >
      <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted">Cash on hand</h2>
        <Button variant="outline" onClick={() => setDepositOpen(true)}>
          <PlusIcon className="size-4" /> Add cash
        </Button>
      </div>

      <div className="space-y-2">
        {BILLS.map((bill) => {
          const count = cashCounts[String(bill)] ?? 0;
          return (
            <div
              key={bill}
              className="flex items-center justify-between rounded-(--radius-card) border border-line bg-surface px-4 py-3 shadow-(--shadow-card)"
            >
              <span className="w-12 text-sm font-bold">${bill}</span>
              <Stepper
                label={`$${bill}`}
                value={count}
                onDelta={(d) =>
                  adjustBill(bill, d).catch(() => toastError('Not synced'))
                }
              />
              <span className="w-20 text-right text-sm font-semibold text-muted tabular-nums">
                {formatCents(count * bill * 100)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between rounded-(--radius-card) border border-line bg-surface p-4 shadow-(--shadow-card)">
        <span className="text-sm font-bold">Total cash</span>
        <span className="text-xl font-extrabold text-accent tabular-nums">
          {formatCents(totalCents)}
        </span>
      </div>
      </div>

      <div className="space-y-3">
      <h3 className="pt-2 text-sm font-semibold text-muted lg:pt-0">Transactions</h3>
      {ordered.length === 0 ? (
        <p className="rounded-(--radius-card) border border-dashed border-line p-6 text-center text-sm text-muted">
          No transactions yet
        </p>
      ) : (
        <ul className="space-y-2">
          {ordered.map(([id, txn]) => (
            <li
              key={id}
              className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-line bg-surface px-4 py-3 shadow-(--shadow-card)"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{txn.label}</div>
                <div className="text-xs text-muted">
                  {txn.dateLabel}
                  {txn.breakdown ? ` · ${formatBreakdown(txn.breakdown)}` : ''}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span
                  className={`text-sm font-bold tabular-nums ${
                    txn.type === 'deposit' ? 'text-accent' : 'text-danger'
                  }`}
                >
                  {txn.type === 'deposit' ? '+' : '−'}
                  {formatCents(Math.abs(txn.amountCents))}
                </span>
                <IconButton
                  label="Delete transaction"
                  className="!size-9"
                  onClick={() => setDeleteId(id)}
                >
                  <TrashIcon className="size-4" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}

      </div>

      <DepositDialog open={depositOpen} onOpenChange={setDepositOpen} />
      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteId(null);
        }}
        title="Delete this transaction?"
        body="This removes the record only — bill counts are not changed."
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (deleteId)
            deleteTransaction(deleteId).catch(() => toastError('Not synced'));
          setDeleteId(null);
        }}
      />
    </section>
  );
}
