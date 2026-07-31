import { useState } from 'react';
import { useStore } from '../../store/useStore';
import { joinHouseholdByCode, signOutUser } from '../../store/auth';
import { setRates } from '../../store/sync';
import {
  centsToDollars,
  parseDollarInput,
} from '../../lib/money';
import { applyTheme, getTheme, type ThemeChoice } from '../../lib/theme';
import { Dialog } from '../../components/ui/Dialog';
import { Button } from '../../components/ui/Button';
import { toast, toastError } from '../../components/ui/Toast';
import { CheckIcon, CopyIcon } from '../../components/icons';
import { debounce } from '../../lib/debounce';

const debouncedRates = debounce((hourly: number, fuel: number) => {
  setRates(hourly, fuel).catch(() => toastError('Rates not synced'));
}, 400);

function RateField({
  id,
  label,
  cents,
  onCents,
}: {
  id: string;
  label: string;
  cents: number;
  onCents: (cents: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="flex items-center gap-1">
        <span className="text-muted">$</span>
        <input
          id={id}
          inputMode="decimal"
          value={text ?? String(centsToDollars(cents))}
          onChange={(e) => {
            setText(e.target.value);
            const parsed = parseDollarInput(e.target.value);
            if (parsed !== null) onCents(parsed);
          }}
          onBlur={() => setText(null)}
          className="min-h-11 w-24 rounded-(--radius-control) border border-line bg-surface-2 px-2 text-right tabular-nums"
        />
      </span>
    </label>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const settings = useStore((s) => s.settings);
  const user = useStore((s) => s.user);
  const householdId = useStore((s) => s.householdId);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>(getTheme());

  const copyCode = async () => {
    if (!householdId) return;
    try {
      await navigator.clipboard.writeText(householdId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toastError('Copy failed', 'Select and copy the code manually.');
    }
  };

  const join = async () => {
    const code = joinCode.trim();
    if (!code) return;
    setJoining(true);
    try {
      await joinHouseholdByCode(code);
      setJoinCode('');
      toast('Joined household', 'Data will now sync.');
    } catch (err) {
      toastError(
        'Could not join',
        err instanceof Error ? err.message : 'Try again.',
      );
    } finally {
      setJoining(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Settings">
      <div className="space-y-5">
        <section aria-label="Rates" className="space-y-3">
          <h3 className="text-xs font-bold tracking-wide text-muted uppercase">
            Rates
          </h3>
          <RateField
            id="hourly-rate"
            label="Hourly rate"
            cents={settings.hourlyRateCents}
            onCents={(c) => debouncedRates(c, settings.fuelRateCents)}
          />
          <RateField
            id="fuel-rate"
            label="Fuel per day"
            cents={settings.fuelRateCents}
            onCents={(c) => debouncedRates(settings.hourlyRateCents, c)}
          />
        </section>

        <section aria-label="Household" className="space-y-3">
          <h3 className="text-xs font-bold tracking-wide text-muted uppercase">
            Household
          </h3>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted">Your code</span>
            <span className="flex min-w-0 items-center gap-1">
              <code className="truncate rounded bg-surface-2 px-2 py-1 font-mono text-xs">
                {householdId ?? '—'}
              </code>
              <button
                type="button"
                aria-label="Copy household code"
                onClick={() => void copyCode()}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink"
              >
                {copied ? (
                  <CheckIcon className="size-4 text-accent" />
                ) : (
                  <CopyIcon className="size-4" />
                )}
              </button>
            </span>
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void join();
            }}
          >
            <label htmlFor="join-input" className="sr-only">
              Household code to join
            </label>
            <input
              id="join-input"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Paste a code to join"
              className="min-h-11 min-w-0 flex-1 rounded-(--radius-control) border border-line bg-surface-2 px-3 text-sm"
            />
            <Button type="submit" disabled={joining || !joinCode.trim()}>
              {joining ? 'Joining…' : 'Join'}
            </Button>
          </form>
          <p className="text-xs text-muted">
            Share your code with someone to sync one household together. Joining
            another household switches you to their data.
          </p>
        </section>

        <section aria-label="Appearance" className="space-y-3">
          <h3 className="text-xs font-bold tracking-wide text-muted uppercase">
            Appearance
          </h3>
          <div className="flex gap-2" role="radiogroup" aria-label="Theme">
            {(['system', 'light', 'dark'] as const).map((choice) => (
              <button
                key={choice}
                type="button"
                role="radio"
                aria-checked={theme === choice}
                onClick={() => {
                  setTheme(choice);
                  applyTheme(choice);
                }}
                className={`min-h-10 flex-1 rounded-(--radius-control) border px-3 text-sm font-medium capitalize transition ${
                  theme === choice
                    ? 'border-accent-strong bg-accent-soft text-accent'
                    : 'border-line bg-surface-2 text-muted hover:text-ink'
                }`}
              >
                {choice}
              </button>
            ))}
          </div>
        </section>

        <section aria-label="Account" className="space-y-3">
          <h3 className="text-xs font-bold tracking-wide text-muted uppercase">
            Account
          </h3>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-muted">{user?.email}</span>
            <Button variant="danger" onClick={() => void signOutUser()}>
              Sign out
            </Button>
          </div>
        </section>
      </div>
    </Dialog>
  );
}
