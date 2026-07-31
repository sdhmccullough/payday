import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'outline' | 'danger' | 'ghost';

const styles: Record<Variant, string> = {
  primary:
    'bg-accent-strong text-white hover:brightness-110 active:scale-[0.98] shadow-sm',
  outline:
    'border border-line bg-surface text-ink hover:bg-surface-2 active:scale-[0.98]',
  danger:
    'bg-danger-soft text-danger border border-danger/25 hover:bg-danger/20 active:scale-[0.98]',
  ghost: 'text-muted hover:bg-surface-2 hover:text-ink active:scale-[0.98]',
};

export function Button({
  variant = 'outline',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-(--radius-control) px-4 text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    />
  );
}

export function IconButton({
  label,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex size-11 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink active:scale-95 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
