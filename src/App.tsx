import { useEffect, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { useStore, type Tab } from './store/useStore';
import { redeemPendingInvite } from './store/auth';
import { computeSavePay } from './store/sync';
import { formatCents } from './lib/money';
import { toLocalDateKey } from './lib/dates';
import { clearBadge, maybeNotifyPayday } from './lib/notify';
import { toast, toastError } from './components/ui/Toast';
import { ConfirmDialog } from './components/ui/Dialog';
import { SignInScreen } from './features/auth/SignInScreen';
import { TimesheetTab, fillWeekDefaults } from './features/timesheet/TimesheetTab';
import { CashTab } from './features/cash/CashTab';
import { HistoryTab } from './features/history/HistoryTab';
import { SettingsDialog } from './features/household/SettingsDialog';
import { Toaster } from './components/ui/Toast';
import { UpdatePrompt } from './components/UpdatePrompt';
import { IconButton } from './components/ui/Button';
import {
  CalendarCheckIcon,
  ClockIcon,
  GearIcon,
  HistoryIcon,
  WalletIcon,
} from './components/icons';

function SyncBadge() {
  const status = useStore((s) => s.syncStatus);
  const text =
    status === 'synced'
      ? 'Synced'
      : status === 'syncing'
        ? 'Syncing…'
        : status === 'offline'
          ? 'Offline'
          : 'Connecting…';
  const dot =
    status === 'synced'
      ? 'bg-accent'
      : status === 'syncing'
        ? 'bg-warn animate-pulse'
        : status === 'offline'
          ? 'bg-danger'
          : 'bg-muted';
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted"
      role="status"
      aria-live="polite"
    >
      <span aria-hidden="true" className={`size-2 rounded-full ${dot}`} />
      {text}
    </span>
  );
}

const TAB_ITEMS: Array<{ value: Tab; label: string; icon: typeof ClockIcon }> = [
  { value: 'timesheet', label: 'Timesheet', icon: ClockIcon },
  { value: 'cash', label: 'Cash', icon: WalletIcon },
  { value: 'history', label: 'History', icon: HistoryIcon },
];

function AppShell() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const week = useStore((s) => s.week);
  const settings = useStore((s) => s.settings);
  const migrating = useStore((s) => s.migrating);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Device-local payday reminder: at most once per day, only while open.
  useEffect(() => {
    const now = new Date();
    const pos = (d: number) => (d + 1) % 7; // Sat-anchored week position
    if (pos(now.getDay()) < pos(settings.paydayDay)) return;
    const calc = computeSavePay();
    if (calc.totalCents <= 0) {
      clearBadge();
      return;
    }
    maybeNotifyPayday(
      `It's payday — ${formatCents(calc.totalCents)} due.`,
      toLocalDateKey(now),
    );
  }, [week, settings]);

  return (
    <Tabs.Root value={tab} onValueChange={(v) => setTab(v as Tab)}>
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pb-24">
        <header className="flex items-center justify-between py-4">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-extrabold tracking-tight">PayDay</h1>
            <SyncBadge />
          </div>
          <div className="flex items-center gap-1">
            {tab === 'timesheet' ? (
              <IconButton
                label="Fill Mon–Fri 8AM–5PM"
                onClick={() => fillWeekDefaults(week.weekStart)}
              >
                <CalendarCheckIcon className="size-5" />
              </IconButton>
            ) : null}
            <IconButton label="Settings" onClick={() => setSettingsOpen(true)}>
              <GearIcon className="size-5" />
            </IconButton>
          </div>
        </header>

        {migrating ? (
          <p className="mb-3 rounded-(--radius-control) bg-accent-soft p-3 text-sm text-accent">
            Upgrading your household data — one moment…
          </p>
        ) : null}

        <main className="flex-1">
          <Tabs.Content value="timesheet" className="focus:outline-none">
            <TimesheetTab />
          </Tabs.Content>
          <Tabs.Content value="cash" className="focus:outline-none">
            <CashTab />
          </Tabs.Content>
          <Tabs.Content value="history" className="focus:outline-none">
            <HistoryTab />
          </Tabs.Content>
        </main>
      </div>

      <Tabs.List
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="mx-auto flex max-w-lg">
          {TAB_ITEMS.map(({ value, label, icon: TabIcon }) => (
            <Tabs.Trigger
              key={value}
              value={value}
              className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium text-muted transition data-[state=active]:text-accent"
            >
              <TabIcon className="size-5" />
              {label}
            </Tabs.Trigger>
          ))}
        </div>
      </Tabs.List>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </Tabs.Root>
  );
}

function InvitePrompt() {
  const user = useStore((s) => s.user);
  const pendingInvite = useStore((s) => s.pendingInvite);
  const setPendingInvite = useStore((s) => s.setPendingInvite);

  return (
    <ConfirmDialog
      open={user !== null && pendingInvite !== null}
      onOpenChange={(o) => {
        if (!o) setPendingInvite(null);
      }}
      title="Join household?"
      body="You've been invited to a shared PayDay household. Joining switches you to their timesheet, cash drawer, and history."
      confirmLabel="Join household"
      onConfirm={() => {
        redeemPendingInvite()
          .then(() => toast('Joined household', 'Data is now syncing.'))
          .catch((err) =>
            toastError(
              'Could not join',
              err instanceof Error ? err.message : 'Try again.',
            ),
          );
      }}
    />
  );
}

export default function App() {
  const user = useStore((s) => s.user);
  const authReady = useStore((s) => s.authReady);

  return (
    <>
      {!authReady ? (
        <main className="flex min-h-dvh items-center justify-center">
          <span className="text-sm text-muted">Loading…</span>
        </main>
      ) : user ? (
        <AppShell />
      ) : (
        <SignInScreen />
      )}
      <InvitePrompt />
      <Toaster />
      <UpdatePrompt />
    </>
  );
}
