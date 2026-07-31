import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { XIcon } from '../icons';
import { Button } from './Button';

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-in" />
        <RadixDialog.Content
          className="fixed top-1/2 left-1/2 z-50 max-h-[85dvh] w-[min(92vw,26rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-(--radius-card) border border-line bg-surface p-5 shadow-xl focus:outline-none"
          aria-describedby={description ? undefined : ''}
        >
          <div className="mb-3 flex items-center justify-between gap-4">
            <RadixDialog.Title className="text-base font-bold">
              {title}
            </RadixDialog.Title>
            <RadixDialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="inline-flex size-9 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink"
              >
                <XIcon className="size-4" />
              </button>
            </RadixDialog.Close>
          </div>
          {description ? (
            <RadixDialog.Description className="mb-4 text-sm text-muted">
              {description}
            </RadixDialog.Description>
          ) : null}
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title}>
      <div className="text-sm text-muted">{body}</div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          onClick={() => {
            onOpenChange(false);
            onConfirm();
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
