import { DollarSign, TrendingUp, TrendingDown, ArrowDown } from 'lucide-react';
import { formatCurrency } from '@/lib/format';

interface IncomeFlowProps {
  data: {
    interest_income?: number | null;
    noninterest_income?: number | null;
    interest_expense?: number | null;
    noninterest_expense?: number | null;
    provision_for_losses?: number | null;
    net_income?: number | null;
    total_revenue?: number | null;
    pretax_income?: number | null;
    taxes?: number | null;
  };
}

export function IncomeFlow({ data }: IncomeFlowProps) {
  const totalRevenue = (data.interest_income ?? 0) + (data.noninterest_income ?? 0);
  const totalExpenses = (data.interest_expense ?? 0) + (data.noninterest_expense ?? 0) + (data.provision_for_losses ?? 0);
  const netIncome = data.net_income ?? totalRevenue - totalExpenses;

  const revenueItems = [
    { label: 'Interest Income', value: data.interest_income, color: 'bg-emerald-500' },
    { label: 'Non-Interest Income', value: data.noninterest_income, color: 'bg-emerald-400' },
  ].filter((item) => item.value != null && item.value > 0);

  const expenseItems = [
    { label: 'Interest Expense', value: data.interest_expense, color: 'bg-red-400' },
    { label: 'Non-Interest Expense', value: data.noninterest_expense, color: 'bg-red-500' },
    { label: 'Provision for Losses', value: data.provision_for_losses, color: 'bg-orange-400' },
  ].filter((item) => item.value != null && item.value > 0);

  if (revenueItems.length === 0 && expenseItems.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-surface-400">
        Income statement data not available.
      </div>
    );
  }

  const maxValue = Math.max(totalRevenue, totalExpenses, 1);

  return (
    <div className="bg-white rounded-xl border border-surface-700 p-6">
      <h3 className="text-base font-semibold text-surface-100 mb-6 flex items-center gap-2">
        <DollarSign className="w-5 h-5 text-primary-600" />
        Income Statement Flow
      </h3>

      <div className="space-y-6">
        {/* Revenue Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-emerald-700 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4" /> Revenue
            </span>
            <span className="text-sm font-bold text-emerald-700">{formatCurrency(totalRevenue)}</span>
          </div>
          <div className="space-y-2">
            {revenueItems.map((item) => (
              <FlowBar
                key={item.label}
                label={item.label}
                value={item.value!}
                maxValue={maxValue}
                color={item.color}
              />
            ))}
          </div>
        </div>

        {/* Flow Arrow */}
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-2 text-surface-400">
            <div className="h-px w-12 bg-surface-300" />
            <ArrowDown className="w-5 h-5" />
            <div className="h-px w-12 bg-surface-300" />
          </div>
        </div>

        {/* Expenses Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-red-700 flex items-center gap-1.5">
              <TrendingDown className="w-4 h-4" /> Expenses
            </span>
            <span className="text-sm font-bold text-red-700">{formatCurrency(totalExpenses)}</span>
          </div>
          <div className="space-y-2">
            {expenseItems.map((item) => (
              <FlowBar
                key={item.label}
                label={item.label}
                value={item.value!}
                maxValue={maxValue}
                color={item.color}
              />
            ))}
          </div>
        </div>

        {/* Flow Arrow */}
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-2 text-surface-400">
            <div className="h-px w-12 bg-surface-300" />
            <ArrowDown className="w-5 h-5" />
            <div className="h-px w-12 bg-surface-300" />
          </div>
        </div>

        {/* Net Income */}
        <div className={`rounded-lg p-4 ${netIncome >= 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
          <div className="flex items-center justify-between">
            <span className={`text-sm font-medium ${netIncome >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
              Net Income
            </span>
            <span className={`text-xl font-bold ${netIncome >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {formatCurrency(netIncome)}
            </span>
          </div>
          {totalRevenue > 0 && (
            <p className="text-xs text-surface-500 mt-1">
              Net margin: {((netIncome / totalRevenue) * 100).toFixed(1)}%
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function FlowBar({ label, value, maxValue, color }: { label: string; value: number; maxValue: number; color: string }) {
  const width = Math.max((value / maxValue) * 100, 2);
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-surface-400 w-36 shrink-0 truncate">{label}</span>
      <div className="flex-1 bg-surface-800 rounded-full h-5 relative overflow-hidden">
        <div
          className={`${color} h-full rounded-full transition-all duration-500`}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="text-xs font-medium text-surface-300 w-20 text-right shrink-0">
        {formatCurrency(value)}
      </span>
    </div>
  );
}
