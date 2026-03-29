import { useState } from 'react';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { formatCurrency, formatPercent } from '@/lib/format';
import type { FinancialHistory } from '@/types/institution';

interface HistoryChartProps {
  history: FinancialHistory[];
}

type ChartTab = 'balance' | 'performance' | 'income';

const TABS: { id: ChartTab; label: string }[] = [
  { id: 'balance',     label: 'Balance Sheet' },
  { id: 'performance', label: 'Performance Ratios' },
  { id: 'income',      label: 'Income' },
];

function formatQuarter(dateStr: string) {
  const d = new Date(dateStr);
  const q = Math.ceil((d.getMonth() + 1) / 3);
  return `Q${q} '${String(d.getFullYear()).slice(2)}`;
}

function formatYAxisCurrency(value: number) {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9)  return `$${(value / 1e9).toFixed(0)}B`;
  if (value >= 1e6)  return `$${(value / 1e6).toFixed(0)}M`;
  if (value >= 1e3)  return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value}`;
}

function formatYAxisPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  fontSize: 12,
};

export function HistoryChart({ history }: HistoryChartProps) {
  const [tab, setTab] = useState<ChartTab>('balance');

  if (history.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-surface-200 shadow-sm p-5 text-center py-12 text-sm text-surface-500">
        No historical data available.
      </div>
    );
  }

  const data = [...history]
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((h) => ({
      period: formatQuarter(h.period),
      total_assets:   h.total_assets,
      total_deposits: h.total_deposits,
      total_loans:    h.total_loans,
      roa:            h.roa,
      roe:            h.roi,
      net_income:     h.net_income,
    }));

  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-sm p-5">
      {/* Tab bar */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-base font-semibold text-surface-900">Historical Trends</h3>
        <div className="flex gap-1 bg-surface-100 rounded-lg p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                tab === t.id
                  ? 'bg-white text-surface-900 shadow-sm'
                  : 'text-surface-500 hover:text-surface-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Balance Sheet */}
      {tab === 'balance' && (
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <defs>
              <linearGradient id="gAssets" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gDeposits" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#10b981" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gLoans" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={formatYAxisCurrency} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={68} />
            <Tooltip
              formatter={(v: unknown, name: unknown) => [
                formatCurrency(v as number),
                name === 'total_assets' ? 'Total Assets' : name === 'total_deposits' ? 'Total Deposits' : 'Net Loans',
              ]}
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ fontWeight: 600, color: '#1e293b' }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              formatter={(v) => v === 'total_assets' ? 'Total Assets' : v === 'total_deposits' ? 'Total Deposits' : 'Net Loans'}
            />
            <Area type="monotone" dataKey="total_assets"   stroke="#3b82f6" strokeWidth={2} fill="url(#gAssets)"   dot={false} />
            <Area type="monotone" dataKey="total_deposits" stroke="#10b981" strokeWidth={2} fill="url(#gDeposits)" dot={false} />
            <Area type="monotone" dataKey="total_loans"    stroke="#f59e0b" strokeWidth={2} fill="url(#gLoans)"    dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}

      {/* Performance Ratios */}
      {tab === 'performance' && (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={formatYAxisPercent} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={52} />
            <Tooltip
              formatter={(v: unknown, name: unknown) => [
                formatPercent(v as number, 2),
                name === 'roa' ? 'ROA' : 'ROE',
              ]}
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ fontWeight: 600, color: '#1e293b' }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => v === 'roa' ? 'ROA' : 'ROE'} />
            <Line type="monotone" dataKey="roa" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, fill: '#3b82f6' }} activeDot={{ r: 5 }} connectNulls />
            <Line type="monotone" dataKey="roe" stroke="#a855f7" strokeWidth={2.5} dot={{ r: 3, fill: '#a855f7' }} activeDot={{ r: 5 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      )}

      {/* Net Income */}
      {tab === 'income' && (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={formatYAxisCurrency} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={68} />
            <Tooltip
              formatter={(v: unknown) => [formatCurrency(v as number), 'Net Income']}
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ fontWeight: 600, color: '#1e293b' }}
            />
            <Bar
              dataKey="net_income"
              name="Net Income"
              radius={[4, 4, 0, 0]}
              fill="#10b981"
            />
          </BarChart>
        </ResponsiveContainer>
      )}

      <p className="text-xs text-surface-400 mt-3 text-right">
        {data.length} quarters shown · FDIC reported data
      </p>
    </div>
  );
}
