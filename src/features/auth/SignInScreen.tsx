import { signIn } from '../../store/auth';
import { useStore } from '../../store/useStore';
import { GoogleIcon } from '../../components/icons';

export function SignInScreen() {
  const authError = useStore((s) => s.authError);
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-(--radius-card) border border-line bg-surface p-8 text-center shadow-(--shadow-card)">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-2xl">
          💰
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight">PayDay</h1>
        <p className="mt-1 text-sm text-muted">
          Weekly pay calculator with real-time sync
        </p>
        <button
          type="button"
          onClick={() => void signIn()}
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-(--radius-control) border border-line bg-surface-2 px-4 text-sm font-semibold transition hover:brightness-105 active:scale-[0.98]"
        >
          <GoogleIcon />
          Sign in with Google
        </button>
        {authError ? (
          <p role="alert" className="mt-4 text-sm text-danger">
            {authError}
          </p>
        ) : (
          <p className="mt-4 text-xs text-muted">
            Sign in to sync data across devices
          </p>
        )}
      </div>
    </main>
  );
}
