// Auth wiring: popup-first with redirect fallback, redirect completion at
// boot, and household attach on sign-in. Lives outside React; components
// read auth state from the store.

import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { patchStore, readStore, useStore } from './useStore';
import {
  attachHousehold,
  createHousehold,
  detachHousehold,
  joinHousehold,
  lookupHouseholdId,
} from './sync';
import { currentWeekStart } from '../lib/dates';
import { DEFAULT_SETTINGS } from '../lib/schema';

const provider = new GoogleAuthProvider();

function errCode(err: unknown): string {
  return (err as { code?: string })?.code ?? '';
}

export function initAuth(): void {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      detachHousehold();
      patchStore({
        user: null,
        householdId: null,
        authReady: true,
        settings: DEFAULT_SETTINGS,
        week: {
          weekStart: currentWeekStart(),
          bonusCents: 0,
          carryoverCents: 0,
          days: {},
        },
        cashCounts: {},
        cashTransactions: {},
        history: {},
        archivedWeeks: {},
        members: {},
        priorPayments: {},
      });
      return;
    }
    void (async () => {
      patchStore({
        user: { uid: user.uid, email: user.email ?? '' },
        authReady: true,
        authError: null,
      });
      try {
        let hid = await lookupHouseholdId(user.uid);
        if (!hid) hid = await createHousehold(user.uid, user.email ?? '');
        await attachHousehold(hid);
      } catch (err) {
        console.error('Household setup failed:', err);
        patchStore({
          authError:
            'Signed in, but your household could not be loaded' +
            (errCode(err) ? ` (${errCode(err)})` : '') +
            '. Check your connection and try again.',
        });
      }
    })();
  });

  // Complete a redirect-based sign-in (the popup fallback path). Success
  // flows through onAuthStateChanged; only failures need surfacing.
  getRedirectResult(auth).catch((err) => {
    console.error('Redirect sign-in failed:', err);
    patchStore({
      authError:
        'Sign-in failed' + (errCode(err) ? ` (${errCode(err)})` : '') + '. Please try again.',
    });
  });
}

export async function signIn(): Promise<void> {
  patchStore({ authError: null });
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    const code = errCode(err);
    // Closing the popup or double-tapping isn't an error.
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return;
    }
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment'
    ) {
      await signInWithRedirect(auth, provider);
      return;
    }
    console.error('Sign-in failed:', err);
    patchStore({
      authError: 'Sign-in failed' + (code ? ` (${code})` : '') + '. Please try again.',
    });
  }
}

export async function signOutUser(): Promise<void> {
  detachHousehold();
  await signOut(auth);
}

export async function joinHouseholdByCode(code: string): Promise<void> {
  const { user } = readStore();
  if (!user) throw new Error('Not signed in.');
  await joinHousehold(user.uid, user.email, code);
  await attachHousehold(code);
}

export { useStore };
