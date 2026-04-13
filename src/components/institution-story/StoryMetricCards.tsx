import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatCurrency, formatPercent, formatNumber } from '@/lib/format';
import type { Institution, FinancialHistory } from '@/types/institution';

interface StoryMetricCardsProps {
  institution: Institution;
  history: FinancialHistory[];
}

type TrendDir = 'up' | 'down' | 'flat';

interface MetricCard {
  label: string;
  value: string;
  trend: TrendDir | null;
  trendLabel: string | null;
}

function pctChange(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function trendDir(pct: number | null): TrendDir {
  if (pct == null || Math.abs(pct) < 0.05) return 'flat';
  return pct > 0 ? 'up' : 'down';
}

function trendLabel(pct: number | null): string | null {
  if (pct == null) return null;
  const abs = Math.abs(pct);
  const sign = pct > 0 ? '+' : '';
  return `${sign}${abs.toFixed(1)}%`;
}

function TrendIndicator({ dir, label }: { dir: TrendDir | null; label: string | null }) {
  if (!dir || dir === 'flat') {
    return (
      <div className="flex items-center gap-1 mt-1">
        <Minus className="h-3.5 w-3.5 text-slate-400" />
        <span className="text-xs text-slate-400">{label ?? 'flat'}</span>
      </div>
    );
  }
  if (dir === 'up') {
    return (
      <div className="flex items-center gap-1 mt-1">
        <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
        <span className="text-xs text-emerald-600">{label}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 mt-1">
      <TrendingDown className="h-3.5 w-3.5 text-red-500" />
      <span className="text-xs text-red-500">{label}</span>
    </div>
  );
}

export function StoryMetricCards({ institution, history }: StoryMetricCardsProps) {
  // Sort history ascending and take the two most recent periods
  const sorted = [...history].sort((a, b) => b.period.localeCompare(a.period));
  const latest = sorted[0] ?? null;
  const previous = sorted[1] ?? null;

  function makeTrend(curr: number | null, prev: number | null): { trend: TrendDir; trendLabel: string | null } {
    const pct = pctChange(curr, prev);
    return { trend: trendDir(pct), trendLabel: trendLabel(pct) };
  }

  const cards: MetricCard[] = [
    {
      label: 'Total Assets',
      value: formatCurrency(institution.total_assets),
      ...makeTrend(
        latest?.total_assets ?? institution.total_assets,
        previous?.total_assets ?? null,
      ),
    },
    {
      label: 'Total Deposits',
      value: formatCurrency(institution.total_deposits),
      ...makeTrend(
        latest?.total_deposits ?? institution.total_deposits,
        previous?.total_deposits ?? null,
      ),
    },
    {
      label: 'Net Loans',
      value: formatCurrency(institution.total_loans),
      ...makeTrend(
        latest?.total_loans ?? institution.total_loans,
        previous?.total_loans ?? null,
      ),
    },
    {
      label: 'Net Income',
      value: formatCurrency(institution.net_income),
      ...makeTrend(
        latest?.net_income ?? institution.net_income,
        previous?.net_income ?? null,
      ),
    },
    {
      label: 'ROA',
      value: formatPercent(institution.roa),
      ...makeTrend(
        latest?.roa ?? institution.roa,
        previous?.roa ?? null,
      ),
    },
    {
      label: institution.num_branches != null ? 'Branches' : 'Employees',
      value: institution.num_branches != null
        ? formatNumber(institution.num_branches)
        : formatNumber(institution.num_employees),
      trend: null,
      trendLabel: null,
    },
  ];

  return (
    <div id="section-metrics" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 px-8 pb-8">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-white rounded-xl shadow-sm border border-slate-100 p-4"
        >
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
            {card.label}
          </p>
          <p className="text-2xl font-bold text-slate-900 leading-tight">
            {card.value}
          </p>
          {card.trend !== null && (
            <TrendIndicator dir={card.trend} label={card.trendLabel} />
          )}
        </div>
      ))}
    </div>
  );
}
