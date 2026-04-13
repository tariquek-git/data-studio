import { useMemo, useState } from 'react';
import { Card } from '@/components/ui';
import { formatCurrency, formatPercent } from '@/lib/format';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { EntityHistoryPoint } from '@/types/entity';

interface EntityHistoryChartProps {
  history: EntityHistoryPoint[];
}

const METRIC_OPTIONS = [
  { key: 'total_assets', label: 'Assets', stroke: '#38bdf8', fill: 'url(#entityAssets)' },
  { key: 'total_deposits', label: 'Deposits', stroke: '#10b981', fill: 'url(#entityDeposits)' },
  { key: 'total_loans', label: 'Loans', stroke: '#f59e0b', fill: 'url(#entityLoans)' },
  { key: 'net_income', label: 'Net income', stroke: '#a78bfa', fill: 'url(#entityIncome)' },
  { key: 'roa', label: 'ROA', stroke: '#fb7185', fill: 'url(#entityRoa)' },
] as const;

type MetricKey = (typeof METRIC_OPTIONS)[number]['key'];

function formatMetricValue(metric: MetricKey, value: number | null | undefined) {
  if (metric === 'roa') return formatPercent(value ?? null);
  return formatCurrency(value ?? null);
}

export function EntityHistoryChart({ history }: EntityHistoryChartProps) {
  const [metric, setMetric] = useState<MetricKey>('total_assets');
  const data = useMemo(() => [...history].reverse(), [history]);
  const latest = history[0] ?? null;
  const previous = history[1] ?? null;
  const metricMeta = METRIC_OPTIONS.find((option) => option.key === metric) ?? METRIC_OPTIONS[0];
  const latestValue = latest?.[metric] ?? null;
  const previousValue = previous?.[metric] ?? null;
  const delta =
    latestValue != null && previousValue != null
      ? latestValue - previousValue
      : null;

  return (
    <Card className="border-slate-200 bg-slate-50/80 text-slate-900 shadow-2xl shadow-slate-200/50/30">
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-800">
            Financial Lens
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Switch across key metrics to read momentum instead of a single balance-sheet line.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {METRIC_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setMetric(option.key)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                option.key === metric
                  ? 'border-cyan-300 bg-cyan-50 text-cyan-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {data.length > 0 ? (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id="entityAssets" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.04} />
                    </linearGradient>
                    <linearGradient id="entityDeposits" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.04} />
                    </linearGradient>
                    <linearGradient id="entityLoans" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.04} />
                    </linearGradient>
                    <linearGradient id="entityIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#a78bfa" stopOpacity={0.04} />
                    </linearGradient>
                    <linearGradient id="entityRoa" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#fb7185" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#fb7185" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                  <XAxis dataKey="period" tick={{ fill: '#94a3b8', fontSize: 11 }} stroke="#334155" />
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    stroke="#334155"
                    tickFormatter={(value) => metric === 'roa' ? `${Number(value).toFixed(1)}%` : `$${Number(value / 1_000_000_000).toFixed(0)}B`}
                  />
                  <Tooltip
                    contentStyle={{ background: '#020617', border: '1px solid #334155', borderRadius: 12 }}
                    labelStyle={{ color: '#e2e8f0' }}
                    formatter={(value: unknown) => formatMetricValue(metric, value as number)}
                  />
                  <Area
                    type="monotone"
                    dataKey={metric}
                    stroke={metricMeta.stroke}
                    fill={metricMeta.fill}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Selected lens</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{metricMeta.label}</p>
                <p className="mt-1 text-xs text-slate-500">Current series view for this profile.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Latest point</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{formatMetricValue(metric, latestValue)}</p>
                <p className="mt-1 text-xs text-slate-500">{latest?.period ?? 'No history loaded'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Quarterly change</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {delta == null ? '—' : formatMetricValue(metric, delta)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {previous?.period ? `Vs ${previous.period}` : 'Need at least two observations'}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Assets', value: formatCurrency(latest?.total_assets ?? null) },
              { label: 'Deposits', value: formatCurrency(latest?.total_deposits ?? null) },
              { label: 'Loans', value: formatCurrency(latest?.total_loans ?? null) },
              { label: 'ROA / ROE', value: `${formatPercent(latest?.roa ?? null)} / ${formatPercent(latest?.roi ?? null)}` },
            ].map((summary) => (
              <div key={summary.label} className="rounded-xl border border-slate-200 bg-white/70 p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{summary.label}</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{summary.value}</p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
          No historical series is available for this profile yet.
        </div>
      )}
    </Card>
  );
}
