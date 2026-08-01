// Dev-only fixture: renders PunchBanner + today's DayCard with fake store
// state (arrival + departure presence) so the punch/suggestion UI can be
// eyeballed without auth. Served at /punch-preview.html by `vite dev`.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import { useStore } from './store/useStore';
import { PunchBanner } from './features/timesheet/PunchBanner';
import { DayCard } from './features/timesheet/DayCard';
import { toLocalDateKey } from './lib/dates';

const todayKey = toLocalDateKey(new Date());
const now = Date.now();
const at = (h: number, m: number) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.getTime();
};

useStore.setState({
  week: {
    weekStart: todayKey,
    bonusCents: 0,
    carryoverCents: 0,
    days: {},
  },
  presence: {
    [todayKey]: {
      firstSeenAt: at(7, 58),
      lastSeenAt: now - 45 * 60 * 1000, // departed 45 min ago → end suggested
      updatedAt: now - 60 * 1000, // heartbeat fresh
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <PunchBanner />
      <DayCard dayName="Friday" dateKey={todayKey} entry={undefined} isToday />
    </div>
  </StrictMode>,
);
