import { DollarSign, Landmark, CreditCard, Shield, TrendingUp, Percent } from 'lucide-react';
import { Card } from '@/components/ui';
import { formatCurrency, formatPercent } from '@/lib/format';
import type { Institution } from '@/types/institution';

interface FinancialSnapshotProps {
  institution: Institution;
}

export function FinancialSnapshot({ institution }: FinancialSnapshotProps) {
  const metrics = [
    {
      label: 'Total Assets',
      value: formatCurrency(institution.total_assets),
      icon: DollarSign,
      subtitle: null,
      color: 'text-surface-900',
    },
    {
      label: 'Total Deposits',
      value: formatCurrency(institution.total_deposits),
      icon: Landmark,
      subtitle: null,
      color: 'text-surface-900',
    },
    {
      label: 'Total Loans',
      value: formatCurrency(institution.total_loans),
      icon: CreditCard,
      subtitle: null,
      color: 'text-surface-900',
    },
    {
      label: 'Equity Capital',
      value: formatCurrency(institution.equity_capital),
      icon: Shield,
      subtitle: institution.total_assets && institution.equity_capital
        ? `${((institution.equity_capital / institution.total_assets) * 100).toFixed(1)}% of assets`
        : null,
      color: 'text-surface-900',
    },
    {
      label: 'ROA',
      value: formatPercent(institution.roa),
      icon: TrendingUp,
      subtitle: 'Return on Assets',
      color:
        institution.roa != null
          ? institution.roa >= 0
            ? 'text-green-700'
            : 'text-red-600'
          : 'text-surface-900',
    },
    {
      label: 'ROE',
      value: formatPercent(institution.roi),
      icon: Percent,
      subtitle: 'Return on Equity',
      color:
        institution.roi != null
          ? institution.roi >= 0
            ? 'text-green-700'
            : 'text-red-600'
          : 'text-surface-900',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <Card key={metric.label}>
            <div className="flex items-center gap-2 mb-2">
              <Icon className="h-4 w-4 text-primary-500" />
              <span className="text-xs font-medium text-surface-500">{metric.label}</span>
            </div>
            <p className={`text-lg font-bold ${metric.color}`}>{metric.value}</p>
            {metric.subtitle && (
              <p className="text-xs text-surface-400 mt-0.5">{metric.subtitle}</p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
