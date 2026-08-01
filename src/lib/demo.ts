// Demo mode for Firebase Hosting preview channels. Preview URLs look like
// payday-daf05--pr4-branch-hash.web.app — the '--' marks a channel. There,
// sign-in is skipped entirely and the store boots with sample data so a PR
// can be reviewed end-to-end without auth (and without touching real data).

import { patchStore } from '../store/useStore';
import { currentWeekStart, toLocalDateKey, weekDayKey } from './dates';

export function isPreviewHost(host = location.hostname): boolean {
  return host.endsWith('.web.app') && host.includes('--');
}

/** Demo boots on preview channels, or anywhere via ?demo=1 (handy locally). */
export function isDemoRequested(): boolean {
  return (
    isPreviewHost() || new URLSearchParams(location.search).get('demo') === '1'
  );
}

export function seedDemoStore(): void {
  const weekStart = currentWeekStart();
  const todayKey = toLocalDateKey(new Date());
  const now = Date.now();
  const daysAgo = (n: number) => now - n * 24 * 60 * 60 * 1000;
  const weeksAgoKey = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - 7 * n);
    return currentWeekStart(d);
  };

  const history = Object.fromEntries(
    [1, 2, 3, 4, 6, 8].map((n, i) => [
      `demo-h${i}`,
      {
        weekStart: weeksAgoKey(n),
        minutes: 1380 + i * 45,
        wagesCents: 50600 + i * 1650,
        fuelCents: 5000,
        bonusCents: i === 2 ? 5000 : 0,
        carryoverCents: 0,
        totalCents: 55600 + i * 1650,
        amountPaidCents: 55600 + i * 1650,
        shortfallCents: 0,
        paidDateLabel: new Date(daysAgo(n * 7)).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        paidAt: daysAgo(n * 7),
      },
    ]),
  );

  patchStore({
    demoMode: true,
    authReady: true,
    user: { uid: 'demo-user', email: 'preview@payday.demo' },
    householdId: 'demo',
    ownerUid: 'demo-user',
    syncStatus: 'synced',
    settings: { hourlyRateCents: 2200, fuelRateCents: 1000, paydayDay: 5 },
    week: {
      weekStart,
      bonusCents: 0,
      carryoverCents: 2500,
      days: {
        [weekDayKey(weekStart, 2)]: { start: '08:00', end: '17:00', fuel: true },
        [weekDayKey(weekStart, 3)]: {
          start: '07:45',
          end: '16:30',
          fuel: true,
          breakMinutes: 120,
        },
        [weekDayKey(weekStart, 4)]: { start: '08:15', end: '17:00', fuel: false },
      },
    },
    presence: {
      [todayKey]: {
        firstSeenAt: now - 5 * 60 * 60 * 1000,
        lastSeenAt: now - 45 * 60 * 1000,
        updatedAt: now - 2 * 60 * 1000,
      },
    },
    cashCounts: { '100': 6, '50': 1, '20': 4, '10': 2, '5': 3 },
    cashTransactions: {
      'demo-t1': {
        type: 'withdrawal',
        label: 'Payment: last week',
        amountCents: 55600,
        breakdown: { '100': 5, '50': 1, '5': 1 },
        dateLabel: 'Last Friday',
        at: daysAgo(7),
      },
      'demo-t2': {
        type: 'deposit',
        label: 'Cash deposit',
        amountCents: 100000,
        breakdown: { '100': 10 },
        dateLabel: 'Two weeks ago',
        at: daysAgo(14),
      },
    },
    history,
    priorPayments: {
      'demo-p1': { dateKey: weeksAgoKey(30), amountCents: 200000, label: 'ATM Withdrawal' },
      'demo-p2': { dateKey: weeksAgoKey(40), amountCents: 340000, label: 'Customer Withdrawal' },
    },
    members: {
      'demo-user': { email: 'preview@payday.demo', joinedAt: daysAgo(300) },
      'demo-member': { email: 'partner@payday.demo', joinedAt: daysAgo(250) },
    },
    sensors: { 'demo-sensor-uid': true },
  });
}
