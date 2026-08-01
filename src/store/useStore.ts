import { create } from 'zustand';
import type {
  ArchivedWeek,
  CashTxn,
  HistoryEntry,
  Member,
  PresenceDay,
  PriorPayment,
  Settings,
  WeekState,
} from '../lib/schema';
import { DEFAULT_SETTINGS } from '../lib/schema';
import type { BillCounts } from '../lib/money';
import { currentWeekStart } from '../lib/dates';

export type SyncStatus = 'connecting' | 'synced' | 'syncing' | 'offline';
export type Tab = 'timesheet' | 'cash' | 'history';

export interface AppUser {
  uid: string;
  email: string;
}

interface Store {
  // session
  user: AppUser | null;
  householdId: string | null;
  syncStatus: SyncStatus;
  authError: string | null;
  /** null while auth state is still resolving on boot */
  authReady: boolean;
  migrating: boolean;

  // household data (mirrors of RTDB nodes, already normalized)
  settings: Settings;
  week: WeekState;
  cashCounts: BillCounts;
  cashTransactions: Record<string, CashTxn>;
  history: Record<string, HistoryEntry>;
  archivedWeeks: Record<string, ArchivedWeek>;
  members: Record<string, Member>;
  priorPayments: Record<string, PriorPayment>;
  presence: Record<string, PresenceDay>;
  sensors: Record<string, boolean>;
  ownerUid: string | null;

  // ui
  tab: Tab;
  setTab: (tab: Tab) => void;
  /** Invite token from a ?invite= link, pending user confirmation. */
  pendingInvite: string | null;
  setPendingInvite: (token: string | null) => void;
  /** True when the browser offered a deferred install prompt. */
  installAvailable: boolean;
}

export const useStore = create<Store>((set) => ({
  user: null,
  householdId: null,
  syncStatus: 'connecting',
  authError: null,
  authReady: false,
  migrating: false,

  settings: DEFAULT_SETTINGS,
  week: { weekStart: currentWeekStart(), bonusCents: 0, carryoverCents: 0, days: {} },
  cashCounts: {},
  cashTransactions: {},
  history: {},
  archivedWeeks: {},
  members: {},
  priorPayments: {},
  presence: {},
  sensors: {},
  ownerUid: null,

  tab: 'timesheet',
  setTab: (tab) => set({ tab }),
  pendingInvite: null,
  setPendingInvite: (token) => set({ pendingInvite: token }),
  installAvailable: false,
}));

/** Imperative setter for non-React modules (sync layer, auth). */
export const patchStore = useStore.setState;
export const readStore = useStore.getState;
