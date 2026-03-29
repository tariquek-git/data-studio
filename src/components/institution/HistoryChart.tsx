import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ComposedChart, Line,
} from 'recharts';
import { formatCurrency, formatPercent } from '@/lib/format';
import type { FinancialHistory } from '@/types/institution';

interface RatePoint {
  date: string;
  rate: number;
}

interface FedFundsData {
  fed_funds: RatePoint[];
  overnight_ca: RatePoint[];
}

interface HistoryChartProps {
  history: FinancialHistory[];
  institution?: { source: string };
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

function formatYAxisRate(value: number) {
  return `${value.toFixed(2)}%`;
}

const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  fontSize: 12,
};

async function fetchFedFunds(): Promise<FedFundsData> {
  const res = await fetch('/api/analytics/fed-funds');
  if (!res.ok) throw new Error('Failed to load rate data');
  return res.json();
}

/** Find the closest rate observation to a given date string */
function findClosestRate(
  rates: RatePoint[],
  targetDate: string,
): number | null {
  if (!rates || rates.length === 0) return null;
  const target = new Date(targetDate).getTime();
  let best: RatePoint | null = null;
  let bestDiff = Infinity;
  for (const r of rates) {
    const diff = Math.abs(new Date(r.date).getTime() - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = r;
    }
  }
  return best?.rate ?? null;
}

function isCanadianSource(source: string | undefined): boolean {
  return source === 'osfi' || source === 'rpaa';
}

export function HistoryChart({ history, institution }: HistoryChartProps) {
  const [tab, setTab] = useState<ChartTab>('balance');

  const { data: rateData } = useQuery({
    queryKey: ['fed-funds'],
    queryFn: fetchFedFunds,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
    enabled: tab === 'performance',
  });

  if (history.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-surface-200 shadow-sm p-5 text-center py-12 text-sm text-surface-500">
        No historical data available.
      </div>
    );
  }

  const isCA = isCanadianSource(institution?.source);
  const rateSeries: RatePoint[] = rateData
    ? (isCA ? rateData.overnight_ca : rateData.fed_funds)
    : [];
  const rateLabel = isCA ? 'BoC Rate' : 'Fed Funds Rate';

  const sortedHistory = [...history].sort((a, b) =>
    a.period.localeCompare(b.period),
  );

  const data = sortedHistory.map((h) => ({
    period: formatQuarter(h.period),
    periodRaw: h.period,
    total_assets:   h.total_assets,
    total_deposits: h.total_deposits,
    total_loans:    h.total_loans,
    roa:            h.roa,
    roe:            h.roi,
    net_income:     h.net_income,
  }));

  // Merge rate data into the chart data for the performance tab
  const performanceData = data.map((d) => ({
    ...d,
    ref_rate: findClosestRate(rateSeries, d.periodRaw),
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

      {/* Performance Ratios — dual Y-axis with rate overlay */}
      {tab === 'performance' && (
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={performanceData} margin={{ top: 5, right: 50, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis
              yAxisId="left"
              tickFormatter={formatYAxisPercent}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={formatYAxisRate}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              width={48}
              label={{
                value: 'Rate (%)',
                angle: 90,
                position: 'insideRight',
                offset: 10,
                style: { fontSize: 10, fill: '#94a3b8' },
              }}
            />
            <Tooltip
              formatter={(v: unknown, name: unknown) => {
                if (name === 'ref_rate') return [`${(v as number).toFixed(2)}%`, rateLabel];
                if (name === 'roa') return [formatPercent(v as number, 2), 'ROA'];
                if (name === 'roe') return [formatPercent(v as number, 2), 'ROE'];
                return [`${v}`, String(name)];
              }}
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ fontWeight: 600, color: '#1e293b' }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              formatter={(v) => {
                if (v === 'roa') return 'ROA';
                if (v === 'roe') return 'ROE';
                if (v === 'ref_rate') return rateLabel;
                return v;
              }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="roa"
              stroke="#3b82f6"
              strokeWidth={2.5}
              dot={{ r: 3, fill: '#3b82f6' }}
              activeDot={{ r: 5 }}
              connectNulls
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="roe"
              stroke="#a855f7"
              strokeWidth={2.5}
              dot={{ r: 3, fill: '#a855f7' }}
              activeDot={{ r: 5 }}
              connectNulls
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="ref_rate"
              stroke="#94a3b8"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              dot={false}
              connectNulls
            />
          </ComposedChart>
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
