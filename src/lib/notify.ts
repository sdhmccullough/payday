// Local, device-only payday notifications. Honest scope: with no server
// there is no push — a notification can only fire while the app is open.
// The setting and the daily stamp are device preferences (localStorage),
// not household data.

const ENABLED_KEY = 'payday:notify';
const STAMP_KEY = 'payday:notify:last';

export function isNotifyEnabled(): boolean {
  return (
    localStorage.getItem(ENABLED_KEY) === '1' &&
    typeof Notification !== 'undefined' &&
    Notification.permission === 'granted'
  );
}

export async function setNotifyEnabled(on: boolean): Promise<boolean> {
  if (!on) {
    localStorage.removeItem(ENABLED_KEY);
    return false;
  }
  if (typeof Notification === 'undefined') return false;
  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();
  if (permission !== 'granted') return false;
  localStorage.setItem(ENABLED_KEY, '1');
  return true;
}

/** Fire at most one payday notification per day per device. */
export function maybeNotifyPayday(body: string, todayKey: string): void {
  if (!isNotifyEnabled()) return;
  if (localStorage.getItem(STAMP_KEY) === todayKey) return;
  try {
    new Notification('PayDay', { body, icon: '/icons/icon-192.png' });
    localStorage.setItem(STAMP_KEY, todayKey);
    void navigator.setAppBadge?.(1).catch(() => undefined);
  } catch {
    /* Notification constructor throws on some platforms (Android PWA) */
  }
}

export function clearBadge(): void {
  void navigator.clearAppBadge?.().catch(() => undefined);
}
