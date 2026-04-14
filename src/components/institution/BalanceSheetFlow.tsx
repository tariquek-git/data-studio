import { Scale, Landmark, Wallet, ShieldCheck } from 'lucide-react';
import { formatCurrency } from '@/lib/format';

interface BalanceSheetFlowProps {
  data: {
    total_assets?: number | null;
    total_deposits?: number | null;
    total_loans?: number | null;
    equity_capital?: number | null;
    // Asset breakdown
    cash_and_due?: number | null;
    securities?: number | null;
    credit_card_loans?: number | null;
    real_estate_loans?: number | null;
    commercial_loans?: number | null;
    consumer_loans?: number | null;
    other_assets?: number | null;
    // Liability breakdown
    transaction_deposits?: number | null;
    time_deposits?: number | null;
    other_borrowings?: number | null;
    other_liabilities?: number | null;
  };
}

export function BalanceSheetFlow({ data }: BalanceSheetFlowProps) {
  const totalAssets = data.total_assets ?? 0;
  const totalDeposits = data.total_deposits ?? 0;
  const equity = data.equity_capital ?? 0;

  if (totalAssets === 0) {
    return (
      <div className="text-center py-8 text-sm text-surface-400">
        Balance sheet data not available.
      </div>
    );
  }

  const assetItems = [
    { label: 'Cash & Due from Banks', value: data.cash_and_due },
    { label: 'Securities', value: data.securities },
    { label: 'Real Estate Loans', value: data.real_estate_loans },
    { label: 'Commercial Loans', value: data.commercial_loans },
    { label: 'Consumer Loans', value: data.consumer_loans },
    { label: 'Credit Card Loans', value: data.credit_card_loans },
    { label: 'Other Assets', value: data.other_assets },
  ].filter((item) => item.value != null && item.value > 0) as Array<{ label: string; value: number }>;

  const liabilityItems = [
    { label: 'Transaction Deposits', value: data.transaction_deposits },
    { label: 'Time Deposits', value: data.time_deposits },
    { label: 'Other Borrowings', value: data.other_borrowings },
    { label: 'Other Liabilities', value: data.other_liabilities },
  ].filter((item) => item.value != null && item.value > 0) as Array<{ label: string; value: number }>;

  const leverageRatio = totalAssets > 0 ? ((equity / totalAssets) * 100).toFixed(1) : '—';
  const loanToDeposit = totalDeposits > 0 ? (((data.total_loans ?? 0) / totalDeposits) * 100).toFixed(1) : '—';

  return (
    <div className="bg-white rounded-xl border border-surface-700 p-6">
      <h3 className="text-base font-semibold text-surface-100 mb-6 flex items-center gap-2">
        <Scale className="w-5 h-5 text-primary-600" />
        Balance Sheet
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Assets Side */}
        <div>
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-surface-700">
            <span className="text-sm font-semibold text-primary-700 flex items-center gap-1.5">
              <Landmark className="w-4 h-4" /> Assets
            </span>
            <span className="text-sm font-bold text-primary-700">{formatCurrency(totalAssets)}</span>
          </div>
          {assetItems.length > 0 ? (
            <div className="space-y-2">
              {assetItems.map((item) => (
                <StackedItem
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  total={totalAssets}
                  color="bg-primary-500"
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <StackedItem label="Total Loans" value={data.total_loans ?? 0} total={totalAssets} color="bg-primary-500" />
              <StackedItem label="Other Assets" value={totalAssets - (data.total_loans ?? 0)} total={totalAssets} color="bg-primary-300" />
            </div>
          )}
        </div>

        {/* Liabilities + Equity Side */}
        <div>
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-surface-700">
            <span className="text-sm font-semibold text-amber-700 flex items-center gap-1.5">
              <Wallet className="w-4 h-4" /> Liabilities & Equity
            </span>
            <span className="text-sm font-bold text-amber-700">{formatCurrency(totalAssets)}</span>
          </div>
          <div className="space-y-2">
            {liabilityItems.length > 0 ? (
              liabilityItems.map((item) => (
                <StackedItem
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  total={totalAssets}
                  color="bg-amber-400"
                />
              ))
            ) : (
              <StackedItem label="Total Deposits" value={totalDeposits} total={totalAssets} color="bg-amber-400" />
            )}
            {/* Equity always shown */}
            <StackedItem label="Equity Capital" value={equity} total={totalAssets} color="bg-emerald-500" />
          </div>
        </div>
      </div>

      {/* Key Ratios */}
      <div className="mt-6 pt-4 border-t border-surface-700 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <RatioCard icon={<ShieldCheck className="w-4 h-4" />} label="Equity/Assets" value={`${leverageRatio}%`} />
        <RatioCard icon={<Landmark className="w-4 h-4" />} label="Loan/Deposit" value={`${loanToDeposit}%`} />
        <RatioCard icon={<Wallet className="w-4 h-4" />} label="Deposits" value={formatCurrency(totalDeposits)} />
        <RatioCard icon={<Scale className="w-4 h-4" />} label="Equity" value={formatCurrency(equity)} />
      </div>
    </div>
  );
}

function StackedItem({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-surface-400 w-32 shrink-0 truncate">{label}</span>
      <div className="flex-1 bg-surface-800 rounded-full h-4 overflow-hidden">
        <div
          className={`${color} h-full rounded-full opacity-80`}
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
      <span className="text-xs text-surface-500 w-12 text-right shrink-0">{pct.toFixed(0)}%</span>
      <span className="text-xs font-medium text-surface-300 w-16 text-right shrink-0">
        {formatCurrency(value)}
      </span>
    </div>
  );
}

function RatioCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-surface-900 rounded-lg p-3 text-center">
      <div className="flex items-center justify-center gap-1 text-surface-500 mb-1">{icon}<span className="text-xs">{label}</span></div>
      <p className="text-sm font-bold text-surface-200">{value}</p>
    </div>
  );
}
