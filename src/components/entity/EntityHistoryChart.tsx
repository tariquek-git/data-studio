import { Card } from '@/components/ui';
import { formatCurrency, formatPercent } from '@/lib/format';
import {
  AreaChart,
  Area,
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

export function EntityHistoryChart({ history }: EntityHistoryChartProps) {
  const data = [...history].reverse();
  const latest = history[0] ?? null;

  return (
    <Card className="bg-slate-900/80 border-slate-700 text-slate-100 shadow-2xl shadow-slate-950/30">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-200">
            Financial History
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            Quarterly history from legacy and warehouse-backed sources.
          </p>
        </div>
        {latest && (
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Latest period</p>
            <p className="text-sm font-semibold text-white">{latest.period}</p>
          </div>
        )}
      </div>

      {data.length > 0 ? (
        <>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="entityAssets" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                <XAxis
                  dataKey="period"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  stroke="#334155"
                />
                <YAxis
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  stroke="#334155"
                  tickFormatter={(value) => `$${Number(value / 1_000_000_000).toFixed(0)}B`}
                />
                <Tooltip
                  contentStyle={{ background: '#020617', border: '1px solid #334155', borderRadius: 12 }}
                  labelStyle={{ color: '#e2e8f0' }}
                  formatter={(value: unknown, name) => {
                    if (name === 'total_assets' || name === 'total_deposits' || name === 'total_loans' || name === 'net_income' || name === 'equity_capital') {
                      return formatCurrency(value as number);
                    }
                    if (name === 'roa' || name === 'roi') {
                      return formatPercent(value as number);
                    }
                    return value as string;
                  }}
                />
                <Area type="monotone" dataKey="total_assets" stroke="#38bdf8" fill="url(#entityAssets)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Assets', value: formatCurrency(latest?.total_assets ?? null) },
              { label: 'Deposits', value: formatCurrency(latest?.total_deposits ?? null) },
              { label: 'Loans', value: formatCurrency(latest?.total_loans ?? null) },
              { label: 'ROA / ROE', value: `${formatPercent(latest?.roa ?? null)} / ${formatPercent(latest?.roi ?? null)}` },
            ].map((metric) => (
              <div key={metric.label} className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{metric.label}</p>
                <p className="mt-1 text-sm font-semibold text-white">{metric.value}</p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-700 p-6 text-sm text-slate-400">
          No historical series is available for this profile yet.
        </div>
      )}
    </Card>
  );
}
