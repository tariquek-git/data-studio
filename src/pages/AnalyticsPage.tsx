import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { Building2, DollarSign, MapPin, Database } from 'lucide-react';
import { Card, Skeleton } from '@/components/ui';
import { formatNumber, formatCurrency } from '@/lib/format';

interface AnalyticsOverview {
  total_institutions: number;
  total_assets: number;
  by_source: Record<string, number>;
  top_states: { state: string; count: number }[];
  by_charter_type: { type: string; count: number }[];
}

async function fetchAnalytics(): Promise<AnalyticsOverview> {
  const res = await fetch('/api/analytics/overview');
  if (!res.ok) throw new Error('Failed to load analytics');
  return res.json();
}

const PIE_COLORS = ['#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#64748b'];

export default function AnalyticsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics-overview'],
    queryFn: fetchAnalytics,
  });

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-6">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <p className="text-red-600 text-sm">Failed to load analytics data.</p>
      </div>
    );
  }

  const sourceEntries = Object.entries(data.by_source);

  const summaryStats = [
    {
      label: 'Total Institutions',
      value: formatNumber(data.total_institutions),
      icon: Building2,
    },
    {
      label: 'Total Assets',
      value: formatCurrency(data.total_assets),
      icon: DollarSign,
    },
    {
      label: 'Data Sources',
      value: formatNumber(sourceEntries.length),
      icon: Database,
    },
    {
      label: 'States / Provinces',
      value: formatNumber(data.top_states.length),
      icon: MapPin,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Market Analytics</h1>
        <p className="mt-1 text-sm text-surface-500">
          Overview of financial institutions across all data sources.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary-50 shrink-0">
                  <Icon className="h-5 w-5 text-primary-600" />
                </div>
                <div>
                  <p className="text-xs text-surface-500">{stat.label}</p>
                  <p className="text-xl font-bold text-surface-900">{stat.value}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Source breakdown */}
      <Card>
        <h3 className="text-base font-semibold text-surface-900 mb-3">
          Institutions by Source
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {sourceEntries.map(([source, count]) => (
            <div key={source} className="rounded-lg bg-surface-50 p-3">
              <p className="text-xs text-surface-500 uppercase font-medium">{source}</p>
              <p className="text-lg font-bold text-surface-900">{formatNumber(count)}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top states bar chart */}
        <Card>
          <h3 className="text-base font-semibold text-surface-900 mb-4">
            Top 10 States by Institutions
          </h3>
          <ResponsiveContainer width="100%" height={360}>
            <BarChart
              data={data.top_states.slice(0, 10)}
              layout="vertical"
              margin={{ top: 0, right: 20, left: 10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis
                type="category"
                dataKey="state"
                tick={{ fontSize: 12, fill: '#64748b' }}
                width={40}
              />
              <Tooltip
                formatter={(value: unknown) => [formatNumber(value as number), 'Institutions']}
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                }}
              />
              <Bar dataKey="count" fill="#2563eb" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Charter type pie chart */}
        <Card>
          <h3 className="text-base font-semibold text-surface-900 mb-4">
            Charter Type Distribution
          </h3>
          <ResponsiveContainer width="100%" height={360}>
            <PieChart>
              <Pie
                data={data.by_charter_type}
                dataKey="count"
                nameKey="type"
                cx="50%"
                cy="50%"
                outerRadius={120}
                innerRadius={60}
                paddingAngle={2}
                label={((props: any) =>   // eslint-disable-line @typescript-eslint/no-explicit-any
                  `${(props.name ?? '').replace(/_/g, ' ')} (${((props.percent ?? 0) * 100).toFixed(0)}%)`
                ) as any}
                labelLine={{ stroke: '#94a3b8' }}
              >
                {data.by_charter_type.map((_, idx) => (
                  <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: unknown, name: unknown) => [
                  formatNumber(value as number),
                  String(name ?? '').replace(/_/g, ' '),
                ]}
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                }}
              />
              <Legend
                formatter={(value: string) => value.replace(/_/g, ' ')}
                wrapperStyle={{ fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}
