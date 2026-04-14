import { Building2, DollarSign, TrendingUp, MapPin } from 'lucide-react';
import { Card } from '@/components/ui';
import { formatCurrency, formatNumber } from '@/lib/format';
import type { SearchAggregations } from '@/types/filters';

interface QuickStatsProps {
  aggregations: SearchAggregations | null;
  total: number;
}

export function QuickStats({ aggregations, total }: QuickStatsProps) {
  const stateCount = aggregations ? Object.keys(aggregations.by_state).length : 0;

  const stats = [
    {
      label: 'Total Results',
      value: formatNumber(total),
      icon: Building2,
    },
    {
      label: 'Total Assets',
      value: formatCurrency(aggregations?.total_assets_sum ?? null),
      icon: DollarSign,
    },
    {
      label: 'Average Assets',
      value: formatCurrency(aggregations?.avg_assets ?? null),
      icon: TrendingUp,
    },
    {
      label: 'States Represented',
      value: formatNumber(stateCount),
      icon: MapPin,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.label} className="!p-3">
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-primary-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-surface-500 truncate">{stat.label}</p>
                <p className="text-sm font-semibold text-surface-100 truncate">{stat.value}</p>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
