import { useState } from 'react';
import { Dialog } from '../../components/ui/Dialog';
import { Button } from '../../components/ui/Button';
import { toast, toastError } from '../../components/ui/Toast';
import {
  commitSavePay,
  type SavePayComputation,
} from '../../store/sync';
import { formatBreakdown, formatCents } from '../../lib/money';

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className={`font-semibold tabular-nums ${accent ? 'text-accent' : ''}`}>
        {value}
      </span>
    </div>
  );
}

export function SavePayDialog({
  open,
  onOpenChange,
  calc,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calc: SavePayComputation | null;
}) {
  const [busy, setBusy] = useState(false);
  if (!calc) return null;

  const confirm = async () => {
    setBusy(true);
    try {
      await commitSavePay(calc);
      onOpenChange(false);
      toast(
        `Paid ${formatCents(calc.paidCents)} from cash`,
        calc.shortfallCents > 0
          ? `Short ${formatCents(calc.shortfallCents)} — carried over to next week.`
          : undefined,
      );
    } catch (err) {
      console.error(err);
      toastError('Payment not saved', 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Save & Pay">
      <div className="divide-y divide-line">
        <Row label="Hours" value={(calc.minutes / 60).toFixed(2)} />
        <Row label="Wages" value={formatCents(calc.wagesCents)} />
        <Row label="Fuel" value={formatCents(calc.fuelCents)} />
        {calc.bonusCents > 0 ? (
          <Row label="Bonus" value={formatCents(calc.bonusCents)} />
        ) : null}
        {calc.carryoverCents > 0 ? (
          <Row label="Carryover" value={formatCents(calc.carryoverCents)} />
        ) : null}
        <Row label="Total due" value={formatCents(calc.totalCents)} accent />
      </div>

      <div className="mt-4 rounded-(--radius-control) bg-surface-2 p-3 text-sm">
        {calc.paidCents > 0 ? (
          <>
            <div className="font-semibold">
              Pay {formatCents(calc.paidCents)} in bills
            </div>
            <div className="mt-1 text-xs text-muted">
              {formatBreakdown(calc.breakdown) || '—'}
            </div>
          </>
        ) : (
          <div className="font-semibold">No matching bills in the drawer</div>
        )}
        {calc.shortfallCents > 0 ? (
          <p className="mt-2 text-xs font-medium text-warn">
            Short {formatCents(calc.shortfallCents)} — this will carry over to
            next week.
          </p>
        ) : null}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button variant="primary" disabled={busy} onClick={() => void confirm()}>
          {busy ? 'Saving…' : `Pay ${formatCents(calc.paidCents)}`}
        </Button>
      </div>
    </Dialog>
  );
}
