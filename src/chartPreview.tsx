// Dev-only fixture page for eyeballing ChartsPanel without auth.
// Served at /chart-preview.html by `vite dev`; never linked from the app.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import ChartsPanel from './features/history/ChartsPanel';
import type { HistoryEntry } from './lib/schema';
import { currentWeekSaturday, toLocalDateKey } from './lib/dates';

function fixture(weeksAgo: number, amountPaidCents: number, minutes: number): HistoryEntry {
  const sat = currentWeekSaturday();
  sat.setDate(sat.getDate() - 7 * weeksAgo);
  return {
    weekStart: toLocalDateKey(sat),
    minutes,
    wagesCents: amountPaidCents,
    fuelCents: 3000,
    bonusCents: 0,
    carryoverCents: 0,
    totalCents: amountPaidCents,
    amountPaidCents,
    shortfallCents: 0,
    paidDateLabel: 'Jul 24, 2026',
    paidAt: null,
  };
}

const entries: HistoryEntry[] = [
  fixture(1, 54000, 1460),
  fixture(2, 48500, 1300),
  fixture(3, 61250, 1620),
  fixture(4, 0, 0),
  fixture(5, 52000, 1400),
  fixture(6, 47000, 1275),
  fixture(8, 58800, 1560),
  fixture(9, 51000, 1380),
  fixture(11, 49500, 1335),
  fixture(14, 53000, 1430),
  fixture(18, 46000, 1240),
  fixture(24, 50500, 1365),
  fixture(30, 44000, 1180),
  fixture(38, 57000, 1520),
];

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <ChartsPanel entries={entries} />
      <button
        type="button"
        className="rounded border border-line px-3 py-2 text-sm"
        onClick={() => {
          const el = document.documentElement;
          el.dataset.theme = el.dataset.theme === 'light' ? 'dark' : 'light';
        }}
      >
        Toggle theme
      </button>
    </div>
  </StrictMode>,
);
