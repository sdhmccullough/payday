import * as RadixToast from '@radix-ui/react-toast';
import { create } from 'zustand';

interface ToastItem {
  id: number;
  title: string;
  body?: string;
  tone: 'default' | 'danger';
}

interface ToastStore {
  toasts: ToastItem[];
  push: (t: Omit<ToastItem, 'id'>) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) => set((s) => ({ toasts: [...s.toasts, { ...t, id: nextId++ }] })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export function toast(title: string, body?: string): void {
  useToastStore.getState().push({ title, body, tone: 'default' });
}

export function toastError(title: string, body?: string): void {
  useToastStore.getState().push({ title, body, tone: 'danger' });
}

export function Toaster() {
  const { toasts, dismiss } = useToastStore();
  return (
    <RadixToast.Provider swipeDirection="down" duration={4000}>
      {toasts.map((t) => (
        <RadixToast.Root
          key={t.id}
          onOpenChange={(open) => {
            if (!open) dismiss(t.id);
          }}
          className={`rounded-(--radius-control) border p-3 shadow-lg ${
            t.tone === 'danger'
              ? 'border-danger/30 bg-danger-soft text-danger'
              : 'border-line bg-surface text-ink'
          }`}
        >
          <RadixToast.Title className="text-sm font-semibold">
            {t.title}
          </RadixToast.Title>
          {t.body ? (
            <RadixToast.Description className="mt-0.5 text-xs text-muted whitespace-pre-line">
              {t.body}
            </RadixToast.Description>
          ) : null}
        </RadixToast.Root>
      ))}
      <RadixToast.Viewport className="fixed bottom-24 left-1/2 z-[60] flex w-[min(92vw,22rem)] -translate-x-1/2 flex-col gap-2 outline-none" />
    </RadixToast.Provider>
  );
}
