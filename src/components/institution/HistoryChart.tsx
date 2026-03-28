import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { formatCurrency } from '@/lib/format';
import type { FinancialHistory } from '@/types/institution';

interface HistoryChartProps {
  history: FinancialHistory[];
}

function formatQuarter(dateStr: string) {
  const d = new Date(dateStr);
  const q = Math.ceil((d.getMonth() + 1) / 3);
  return `Q${q} ${d.getFullYear()}`;
}

function formatYAxis(value: number) {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(0)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value}`;
}

export function HistoryChart({ history }: HistoryChartProps) {
  if (history.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-surface-500">
        No historical data available.
      </div>
    );
  }

  const data = history.map((h) => ({
    period: formatQuarter(h.period),
    total_assets: h.total_assets,
    total_deposits: h.total_deposits,
  }));

  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-sm p-5">
      <h3 className="text-base font-semibold text-surface-900 mb-4">
        Assets &amp; Deposits Over Time
      </h3>
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <defs>
            <linearGradient id="gradAssets" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradDeposits" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#16a34a" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="period"
            tick={{ fontSize: 12, fill: '#64748b' }}
            axisLine={{ stroke: '#e2e8f0' }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatYAxis}
            tick={{ fontSize: 12, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
            width={65}
          />
          <Tooltip
            formatter={(value: unknown, name: unknown) => [
              formatCurrency(value as number),
              name === 'total_assets' ? 'Total Assets' : 'Total Deposits',
            ]}
            labelStyle={{ fontWeight: 600 }}
            contentStyle={{
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
          />
          <Legend
            formatter={(value: string) =>
              value === 'total_assets' ? 'Total Assets' : 'Total Deposits'
            }
          />
          <Area
            type="monotone"
            dataKey="total_assets"
            stroke="#2563eb"
            strokeWidth={2}
            fill="url(#gradAssets)"
          />
          <Area
            type="monotone"
            dataKey="total_deposits"
            stroke="#16a34a"
            strokeWidth={2}
            fill="url(#gradDeposits)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
