// PWA install affordance. Chrome-family browsers fire beforeinstallprompt,
// which we stash for an in-app "Install" button; iOS never fires it, so we
// detect that case and show Add-to-Home-Screen instructions instead.

import { patchStore } from '../store/useStore';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;

export function initInstallCapture(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    patchStore({ installAvailable: true });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    patchStore({ installAvailable: false });
  });
}

export async function promptInstall(): Promise<void> {
  if (!deferred) return;
  const evt = deferred;
  deferred = null;
  patchStore({ installAvailable: false });
  await evt.prompt();
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** iOS browsers never fire beforeinstallprompt; install is manual there. */
export function needsIosInstallHint(): boolean {
  const ua = navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Mac') && navigator.maxTouchPoints > 1);
  return isIos && !isStandalone();
}
