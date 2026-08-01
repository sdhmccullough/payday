import { useState } from 'react';
import type { DayEntry } from '../../lib/schema';
import { useStore } from '../../store/useStore';
import { setDayField } from '../../store/sync';
import { formatHHMM12 } from '../../lib/dates';
import {
  dismissSuggestion,
  isDismissed,
  suggestionFor,
} from '../../lib/presence';
import { toastError } from '../../components/ui/Toast';
import { XIcon } from '../../components/icons';

export function SuggestionChip({
  dateKey,
  entry,
}: {
  dateKey: string;
  entry: DayEntry | undefined;
}) {
  const presence = useStore((s) => s.presence[dateKey]);
  const [, force] = useState(0);

  const suggestion = suggestionFor(dateKey, presence, entry);
  if (!suggestion || isDismissed(dateKey, suggestion.key)) return null;

  const label = suggestion.detectedEnd
    ? `Detected ${formatHHMM12(suggestion.detectedStart)} – ${formatHHMM12(suggestion.detectedEnd)}`
    : `Detected arrival ${formatHHMM12(suggestion.detectedStart)}`;

  return (
    <div className="mt-2 flex items-center justify-between gap-2 rounded-(--radius-control) bg-accent-soft px-2.5 py-1.5 text-xs">
      <span className="min-w-0 text-accent">
        <span className="block truncate">
          {label}
          {suggestion.sensorStale ? (
            <span className="text-muted"> · sensor offline</span>
          ) : null}
        </span>
        {suggestion.rounded ? (
          <span className="block truncate text-muted">
            Applies as{' '}
            {[suggestion.patch.start, suggestion.patch.end]
              .filter(Boolean)
              .map((t) => formatHHMM12(t as string))
              .join(' – ')}
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="rounded-full bg-surface px-2.5 py-1 font-semibold text-accent transition hover:brightness-110 active:scale-95"
          onClick={() =>
            setDayField(dateKey, suggestion.patch).catch(() =>
              toastError('Not synced', 'Check your connection.'),
            )
          }
        >
          Apply
        </button>
        <button
          type="button"
          aria-label="Dismiss suggestion"
          className="inline-flex size-6 items-center justify-center rounded-full text-muted transition hover:bg-surface hover:text-ink"
          onClick={() => {
            dismissSuggestion(dateKey, suggestion.key);
            force((n) => n + 1);
          }}
        >
          <XIcon className="size-3" />
        </button>
      </span>
    </div>
  );
}
