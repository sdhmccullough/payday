import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from './ui/Button';

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-20 left-1/2 z-[70] flex w-[min(92vw,22rem)] -translate-x-1/2 items-center justify-between gap-3 rounded-(--radius-card) border border-line bg-surface p-3 shadow-xl"
    >
      <span className="text-sm font-medium">Update available</span>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => setNeedRefresh(false)}>
          Later
        </Button>
        <Button variant="primary" onClick={() => void updateServiceWorker(true)}>
          Refresh
        </Button>
      </div>
    </div>
  );
}
