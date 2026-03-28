import { useParams, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CreditCard, GitBranch } from 'lucide-react';
import { ProfileHeader } from '@/components/institution/ProfileHeader';
import { FinancialSnapshot } from '@/components/institution/FinancialSnapshot';
import { HistoryChart } from '@/components/institution/HistoryChart';
import { IncomeFlow } from '@/components/institution/IncomeFlow';
import { BalanceSheetFlow } from '@/components/institution/BalanceSheetFlow';
import { Card, Skeleton, Badge } from '@/components/ui';
import { formatCurrency, formatNumber } from '@/lib/format';
import type { Institution, FinancialHistory } from '@/types/institution';

interface InstitutionDetail {
  institution: Institution;
  history: FinancialHistory[];
}

async function fetchInstitution(certNumber: string): Promise<InstitutionDetail> {
  const res = await fetch(`/api/institutions/${certNumber}`);
  if (!res.ok) throw new Error('Failed to load institution');
  return res.json();
}

export default function InstitutionPage() {
  const { certNumber } = useParams<{ certNumber: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['institution', certNumber],
    queryFn: () => fetchInstitution(certNumber!),
    enabled: !!certNumber,
  });

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <div className="grid grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <p className="text-red-600 text-sm mb-4">
          {error instanceof Error ? error.message : 'Institution not found.'}
        </p>
        <Link
          to="/search"
          className="text-primary-600 hover:text-primary-700 text-sm font-medium"
        >
          Back to Search
        </Link>
      </div>
    );
  }

  const { institution, history } = data;
  const hasCreditCards =
    institution.credit_card_loans != null && institution.credit_card_loans > 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Back link */}
      <Link
        to="/search"
        className="inline-flex items-center gap-1.5 text-sm text-surface-500 hover:text-primary-600 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Search
      </Link>

      {/* Profile header */}
      <ProfileHeader institution={institution} />

      {/* Financial snapshot */}
      <FinancialSnapshot institution={institution} />

      {/* Branch info */}
      {institution.num_branches != null && (
        <Card className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary-50">
            <GitBranch className="h-5 w-5 text-primary-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-surface-900">
              {formatNumber(institution.num_branches)} Branches
            </p>
            <p className="text-xs text-surface-500">
              Across {institution.state ?? 'multiple locations'}
            </p>
          </div>
        </Card>
      )}

      {/* Credit card section */}
      {hasCreditCards && (
        <Card>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-green-50">
              <CreditCard className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-surface-900">Credit Card Program</h3>
              <p className="text-xs text-surface-500">This institution has an active credit card program</p>
            </div>
            <Badge color="green" className="ml-auto">Active</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div className="rounded-lg bg-surface-50 p-4">
              <p className="text-xs text-surface-500">Credit Card Loans</p>
              <p className="text-lg font-bold text-surface-900">
                {formatCurrency(institution.credit_card_loans)}
              </p>
            </div>
            {institution.credit_card_charge_offs != null && (
              <div className="rounded-lg bg-surface-50 p-4">
                <p className="text-xs text-surface-500">Credit Card Charge-Offs</p>
                <p className="text-lg font-bold text-surface-900">
                  {formatCurrency(institution.credit_card_charge_offs)}
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Financial Flow Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <IncomeFlow
          data={{
            interest_income: (institution.raw_data as any)?.INTINC ? Number((institution.raw_data as any).INTINC) * 1000 : null,
            noninterest_income: (institution.raw_data as any)?.NONII ? Number((institution.raw_data as any).NONII) * 1000 : null,
            interest_expense: (institution.raw_data as any)?.EINTEXP ? Number((institution.raw_data as any).EINTEXP) * 1000 : null,
            noninterest_expense: (institution.raw_data as any)?.ELNATR ? Number((institution.raw_data as any).ELNATR) * 1000 : null,
            provision_for_losses: (institution.raw_data as any)?.ELNANTR ? Number((institution.raw_data as any).ELNANTR) * 1000 : null,
            net_income: institution.net_income,
          }}
        />
        <BalanceSheetFlow
          data={{
            total_assets: institution.total_assets,
            total_deposits: institution.total_deposits,
            total_loans: institution.total_loans,
            equity_capital: institution.equity_capital,
            credit_card_loans: institution.credit_card_loans,
          }}
        />
      </div>

      {/* History chart */}
      <HistoryChart history={history} />

      {/* Data freshness */}
      {institution.data_as_of && (
        <p className="text-xs text-surface-400 text-right">
          Data as of {institution.data_as_of}
        </p>
      )}
    </div>
  );
}
