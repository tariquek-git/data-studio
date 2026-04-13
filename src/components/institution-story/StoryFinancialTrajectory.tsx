import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '@/lib/format';
import type { FinancialHistory } from '@/types/institution';

interface StoryFinancialTrajectoryProps {
  history: FinancialHistory[];
}

function formatQuarter(dateStr: string): string {
  const d = new Date(dateStr);
  const q = Math.ceil((d.getMonth() + 1) / 3);
  return `Q${q} ${d.getFullYear()}`;
}

function formatYAxisCurrency(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(0)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value}`;
}

const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  fontSize: 12,
};

export function StoryFinancialTrajectory({ history }: StoryFinancialTrajectoryProps) {
  if (history.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-slate-400">
        No historical data available.
      </div>
    );
  }

  // Take 8 most recent quarters, sorted ascending
  const sorted = [...history]
    .sort((a, b) => a.period.localeCompare(b.period))
    .slice(-8);

  const data = sorted.map((h) => ({
    period: formatQuarter(h.period),
    total_assets: h.total_assets,
    total_deposits: h.total_deposits,
    net_income: h.net_income,
  }));

  return (
    <section id="section-trends" className="py-12 px-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 border-t border-slate-200" />
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap">
          Financial Trajectory
        </h2>
        <div className="flex-1 border-t border-slate-200" />
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <defs>
              <linearGradient id="storyGradAssets" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="storyGradDeposits" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="storyGradIncome" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#a855f7" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={formatYAxisCurrency}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              width={68}
            />
            <Tooltip
              formatter={(value: unknown, name: unknown) => {
                const nameStr = String(name);
                const label =
                  nameStr === 'total_assets'
                    ? 'Total Assets'
                    : nameStr === 'total_deposits'
                    ? 'Total Deposits'
                    : 'Net Income';
                return [formatCurrency(value as number), label];
              }}
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ fontWeight: 600, color: '#1e293b' }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              formatter={(v) =>
                v === 'total_assets'
                  ? 'Total Assets'
                  : v === 'total_deposits'
                  ? 'Total Deposits'
                  : 'Net Income'
              }
            />
            <Area
              type="monotone"
              dataKey="total_assets"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#storyGradAssets)"
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Area
              type="monotone"
              dataKey="total_deposits"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#storyGradDeposits)"
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Area
              type="monotone"
              dataKey="net_income"
              stroke="#a855f7"
              strokeWidth={2}
              fill="url(#storyGradIncome)"
              dot={false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
        <p className="text-xs text-slate-400 mt-3 text-right">
          {data.length} quarters shown · Quarterly reported data
        </p>
      </div>
    </section>
  );
}
