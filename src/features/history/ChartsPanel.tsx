// Lazy-loaded (recharts stays out of the main bundle). Single-series by
// design: the Pay/Hours toggle switches the measure instead of stacking a
// second axis on one chart. The weekly chart is "focus + average": older
// weeks recede (--chart-rest), the latest paid week carries the mark, and a
// dashed line shows the average of the paid weeks in view.

import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { HistoryEntry, PriorPayment } from '../../lib/schema';
import { formatCents } from '../../lib/money';
import { lastNWeeks, monthlyRollup } from './insights';

type Metric = 'pay' | 'hours';

const MARK = 'var(--chart-mark)';
const REST = 'var(--chart-rest)';
const AVG = 'var(--chart-avg)';
const GRID = 'var(--border-c)';
const TICK = { fill: 'var(--muted)', fontSize: 11 } as const;

function fmtValue(metric: Metric, v: number): string {
  return metric === 'pay' ? formatCents(Math.round(v * 100)) : `${v.toFixed(2)} hrs`;
}

function ChartTooltip({
  metric,
  active,
  payload,
  label,
}: {
  metric: Metric;
  active?: boolean;
  payload?: Array<{ value: number | string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-(--radius-control) border border-line bg-surface px-2.5 py-1.5 text-xs shadow-md">
      <div className="text-muted">{label}</div>
      <div className="font-semibold tabular-nums">
        {fmtValue(metric, Number(payload[0].value))}
      </div>
    </div>
  );
}

function yTickFormatter(metric: Metric): (v: number) => string {
  return metric === 'pay'
    ? (v) => (v >= 1000 ? `$${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `$${v}`)
    : (v) => `${v}h`;
}

export default function ChartsPanel({
  entries,
  prior = [],
}: {
  entries: HistoryEntry[];
  prior?: PriorPayment[];
}) {
  const [metric, setMetric] = useState<Metric>('pay');

  const weekly = useMemo(
    () =>
      lastNWeeks(entries, 12).map((p) => ({
        label: p.label,
        value: metric === 'pay' ? p.payCents / 100 : p.minutes / 60,
      })),
    [entries, metric],
  );
  const monthly = useMemo(
    () =>
      monthlyRollup(entries, 12, new Date(), metric === 'pay' ? prior : []).map(
        (p) => ({
          label: p.label,
          value: metric === 'pay' ? p.payCents / 100 : p.minutes / 60,
        }),
      ),
    [entries, prior, metric],
  );

  // Focus the most recent week that has a value (the live week is usually
  // still unpaid), and average only weeks that were actually paid.
  const { focusIndex, average } = useMemo(() => {
    let focus = -1;
    let sum = 0;
    let count = 0;
    weekly.forEach((p, i) => {
      if (p.value > 0) {
        focus = i;
        sum += p.value;
        count += 1;
      }
    });
    return { focusIndex: focus, average: count > 0 ? sum / count : null };
  }, [weekly]);

  const metricLabel = metric === 'pay' ? 'pay' : 'hours';

  return (
    <div className="rounded-(--radius-card) border border-line bg-surface p-4 shadow-(--shadow-card)">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold">Insights</h3>
        <div
          role="radiogroup"
          aria-label="Chart measure"
          className="flex rounded-(--radius-control) border border-line bg-surface-2 p-0.5"
        >
          {(['pay', 'hours'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={metric === m}
              onClick={() => setMetric(m)}
              className={`min-h-8 rounded-[calc(var(--radius-control)-2px)] px-3 text-xs font-semibold capitalize transition ${
                metric === m ? 'bg-surface text-ink shadow-sm' : 'text-muted'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h4 className="text-xs font-medium text-muted">
          Weekly {metricLabel} — last 12 weeks
        </h4>
        {average !== null ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums text-(--chart-avg)">
            <span
              aria-hidden="true"
              className="w-3.5 border-t-2 border-dashed border-(--chart-avg)"
            />
            avg {fmtValue(metric, average)}
          </span>
        ) : null}
      </div>
      <div className="h-40" aria-label={`Weekly ${metricLabel}, last 12 weeks`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={weekly} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis
              dataKey="label"
              tick={TICK}
              tickLine={false}
              axisLine={false}
              interval={1}
            />
            <YAxis
              tick={TICK}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={yTickFormatter(metric)}
            />
            <Tooltip
              cursor={{ fill: 'var(--accent-soft)' }}
              content={<ChartTooltip metric={metric} />}
            />
            <Bar
              dataKey="value"
              fill={REST}
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
              isAnimationActive={false}
            >
              {weekly.map((p, i) => (
                <Cell key={p.label} fill={i === focusIndex ? MARK : REST} />
              ))}
            </Bar>
            {average !== null ? (
              <ReferenceLine
                y={average}
                stroke={AVG}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                ifOverflow="extendDomain"
              />
            ) : null}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <h4 className="mt-4 mb-1 text-xs font-medium text-muted">
        Monthly {metricLabel} — last 12 months
      </h4>
      <div className="h-40" aria-label={`Monthly ${metricLabel}, last 12 months`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={monthly} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis
              dataKey="label"
              tick={TICK}
              tickLine={false}
              axisLine={false}
              interval={1}
            />
            <YAxis
              tick={TICK}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={yTickFormatter(metric)}
            />
            <Tooltip content={<ChartTooltip metric={metric} />} />
            <Line
              type="monotone"
              dataKey="value"
              stroke={MARK}
              strokeWidth={2}
              dot={{ r: 3, fill: MARK, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {prior.length > 0 && metric === 'pay' ? (
        <p className="mt-2 text-xs text-muted">
          Monthly totals include imported bank withdrawals from before the app.
        </p>
      ) : null}
    </div>
  );
}
