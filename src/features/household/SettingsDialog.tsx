import { useState } from 'react';
import { useStore } from '../../store/useStore';
import { leaveCurrentHousehold, signOutUser } from '../../store/auth';
import { createInvite, removeMember, setRates } from '../../store/sync';
import {
  centsToDollars,
  parseDollarInput,
} from '../../lib/money';
import { applyTheme, getTheme, type ThemeChoice } from '../../lib/theme';
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog';
import { Button, IconButton } from '../../components/ui/Button';
import { Switch } from '../../components/ui/Switch';
import { toast, toastError } from '../../components/ui/Toast';
import { TrashIcon } from '../../components/icons';
import { debounce } from '../../lib/debounce';
import { setPaydayDay } from '../../store/sync';
import { isNotifyEnabled, setNotifyEnabled } from '../../lib/notify';

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
  const members = useStore((s) => s.members);
  const ownerUid = useStore((s) => s.ownerUid);
  const [inviting, setInviting] = useState(false);
  const [removeUid, setRemoveUid] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>(getTheme());
  const [notify, setNotify] = useState(isNotifyEnabled());

  const isOwner = user !== null && ownerUid === user.uid;

  const invite = async () => {
    setInviting(true);
    try {
      const inv = await createInvite();
      const shared = typeof navigator.share === 'function'
        ? await navigator.share({ title: 'Join my PayDay household', url: inv.url })
            .then(() => true)
            .catch(() => false)
        : false;
      if (!shared) {
        await navigator.clipboard.writeText(inv.url);
        toast('Invite link copied', 'Single-use, expires in 72 hours.');
      } else {
        toast('Invite link shared', 'Single-use, expires in 72 hours.');
      }
    } catch (err) {
      console.error(err);
      toastError('Could not create invite', 'Check your connection and try again.');
    } finally {
      setInviting(false);
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
          <label
            htmlFor="payday-day"
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="text-muted">Payday</span>
            <select
              id="payday-day"
              value={settings.paydayDay}
              onChange={(e) =>
                setPaydayDay(Number(e.target.value)).catch(() =>
                  toastError('Not synced'),
                )
              }
              className="min-h-11 rounded-(--radius-control) border border-line bg-surface-2 px-2 text-sm"
            >
              {DAY_LABELS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted">
              Payday reminder
              <span className="block text-xs">
                Notifies on this device when the app opens on payday
              </span>
            </span>
            <Switch
              checked={notify}
              onCheckedChange={(on) => {
                void setNotifyEnabled(on).then((granted) => {
                  setNotify(granted);
                  if (on && !granted)
                    toastError(
                      'Notifications blocked',
                      'Allow notifications for this site in your browser settings.',
                    );
                });
              }}
              label="Payday reminder notifications"
            />
          </div>
        </section>

        <section aria-label="Household" className="space-y-3">
          <h3 className="text-xs font-bold tracking-wide text-muted uppercase">
            Household
          </h3>
          <ul className="space-y-1.5">
            {Object.entries(members).map(([uid, m]) => {
              const isSelf = uid === user?.uid;
              return (
                <li
                  key={uid}
                  className="flex min-h-11 items-center justify-between gap-2 rounded-(--radius-control) bg-surface-2 px-3 py-1.5 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate">
                      {m.email || uid}
                      {isSelf ? <span className="text-muted"> (you)</span> : null}
                    </span>
                    <span className="block text-xs text-muted">
                      {uid === ownerUid ? 'Owner' : 'Member'}
                      {m.joinedAt
                        ? ` · joined ${new Date(m.joinedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                        : ''}
                    </span>
                  </span>
                  {isOwner && !isSelf ? (
                    <IconButton
                      label={`Remove ${m.email || 'member'}`}
                      className="!size-9 shrink-0"
                      onClick={() => setRemoveUid(uid)}
                    >
                      <TrashIcon className="size-4" />
                    </IconButton>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={inviting}
              onClick={() => void invite()}
            >
              {inviting ? 'Creating…' : 'Invite someone'}
            </Button>
            {!isOwner ? (
              <Button variant="danger" onClick={() => setLeaveOpen(true)}>
                Leave
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted">
            Invite links are single-use and expire after 72 hours. Everyone in
            the household shares the same timesheet, cash drawer, and history.
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

      <ConfirmDialog
        open={removeUid !== null}
        onOpenChange={(o) => {
          if (!o) setRemoveUid(null);
        }}
        title="Remove this member?"
        body="They immediately lose access to the household's timesheet, cash, and history. Nothing they entered is deleted."
        confirmLabel="Remove"
        danger
        onConfirm={() => {
          if (removeUid)
            removeMember(removeUid)
              .then(() => toast('Member removed'))
              .catch(() => toastError('Not synced', 'Try again.'));
          setRemoveUid(null);
        }}
      />
      <ConfirmDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title="Leave this household?"
        body="You'll switch to your own empty household. The shared data stays with the other members."
        confirmLabel="Leave household"
        danger
        onConfirm={() => {
          leaveCurrentHousehold()
            .then(() => toast('Left household'))
            .catch(() => toastError('Could not leave', 'Try again.'));
        }}
      />
    </Dialog>
  );
}
