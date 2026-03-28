import { useState } from 'react';
import { useParams, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CreditCard, GitBranch, BarChart3, DollarSign, Users, TrendingUp } from 'lucide-react';
import { ProfileHeader } from '@/components/institution/ProfileHeader';
import { FinancialSnapshot } from '@/components/institution/FinancialSnapshot';
import { HistoryChart } from '@/components/institution/HistoryChart';
import { IncomeFlow } from '@/components/institution/IncomeFlow';
import { BalanceSheetFlow } from '@/components/institution/BalanceSheetFlow';
import { SankeyFlow } from '@/components/institution/SankeyFlow';
import { WaterfallChart } from '@/components/institution/WaterfallChart';
import { DollarBreakdown } from '@/components/institution/DollarBreakdown';
import { PeerRadar } from '@/components/institution/PeerRadar';
import { PercentileRanks } from '@/components/institution/PercentileRanks';
import { Card, Skeleton, Badge } from '@/components/ui';
import { formatCurrency, formatNumber } from '@/lib/format';
import type { Institution, FinancialHistory } from '@/types/institution';

interface InstitutionDetail {
  institution: Institution;
  history: FinancialHistory[];
}

interface PeerData {
  peer_group: { charter_type: string; asset_bucket: string; peer_count: number };
  peer_median: {
    roa: number; roi: number; equity_ratio: number;
    loan_to_deposit: number; efficiency: number; asset_size_percentile: number;
  };
  rankings: Array<{
    metric: string; value: number | null; formatted_value: string;
    percentile: number; peer_group_label: string;
  }>;
}

type Tab = 'overview' | 'flows' | 'peers' | 'history';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'flows', label: 'Money Flows', icon: <DollarSign className="w-4 h-4" /> },
  { id: 'peers', label: 'Peer Comparison', icon: <Users className="w-4 h-4" /> },
  { id: 'history', label: 'Trends', icon: <TrendingUp className="w-4 h-4" /> },
];

async function fetchInstitution(certNumber: string): Promise<InstitutionDetail> {
  const res = await fetch(`/api/institutions/${certNumber}`);
  if (!res.ok) throw new Error('Failed to load institution');
  return res.json();
}

async function fetchPeers(certNumber: string): Promise<PeerData> {
  const res = await fetch(`/api/institutions/${certNumber}/peers`);
  if (!res.ok) throw new Error('Failed to load peer data');
  return res.json();
}

function getRawField(raw: Record<string, unknown> | null, field: string): number | null {
  if (!raw || raw[field] == null) return null;
  return Number(raw[field]) * 1000; // FDIC values in thousands
}

export default function InstitutionPage() {
  const { certNumber } = useParams<{ certNumber: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const { data, isLoading, error } = useQuery({
    queryKey: ['institution', certNumber],
    queryFn: () => fetchInstitution(certNumber!),
    enabled: !!certNumber,
  });

  const { data: peerData } = useQuery({
    queryKey: ['institution-peers', certNumber],
    queryFn: () => fetchPeers(certNumber!),
    enabled: !!certNumber && activeTab === 'peers',
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
        <Link to="/search" className="text-primary-600 hover:text-primary-700 text-sm font-medium">
          Back to Search
        </Link>
      </div>
    );
  }

  const { institution, history } = data;
  const raw = institution.raw_data;
  const hasCreditCards = institution.credit_card_loans != null && institution.credit_card_loans > 0;

  const incomeData = {
    interest_income: getRawField(raw, 'INTINC'),
    noninterest_income: getRawField(raw, 'NONII'),
    interest_expense: getRawField(raw, 'EINTEXP'),
    noninterest_expense: getRawField(raw, 'ELNATR'),
    provision_for_losses: getRawField(raw, 'ELNANTR'),
    net_income: institution.net_income,
  };

  const totalRevenue = (incomeData.interest_income ?? 0) + (incomeData.noninterest_income ?? 0);

  const assetBreakdownData = {
    total_assets: institution.total_assets,
    total_loans: institution.total_loans,
    real_estate_loans: getRawField(raw, 'LNRE'),
    commercial_loans: getRawField(raw, 'LNCI'),
    consumer_loans: getRawField(raw, 'LNCON'),
    credit_card_loans: institution.credit_card_loans,
    securities: getRawField(raw, 'SC'),
    cash_and_due: getRawField(raw, 'CASHDUE'),
    other_assets: null,
  };

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

      {/* Tabs */}
      <div className="border-b border-surface-200">
        <nav className="flex gap-1 -mb-px">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-surface-500 hover:text-surface-700 hover:border-surface-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <FinancialSnapshot institution={institution} />

          {/* Branch + Credit Card info row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {institution.num_branches != null && (
              <Card className="flex items-center gap-3">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary-50 shrink-0">
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
            {hasCreditCards && (
              <Card className="flex items-center gap-3">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-green-50 shrink-0">
                  <CreditCard className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-surface-900">
                    {formatCurrency(institution.credit_card_loans)} CC Receivables
                  </p>
                  <p className="text-xs text-surface-500">Active credit card program</p>
                </div>
                <Badge color="green" className="ml-auto">Active</Badge>
              </Card>
            )}
          </div>

          {/* Quick income + balance side-by-side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <IncomeFlow data={incomeData} />
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
        </div>
      )}

      {activeTab === 'flows' && (
        <div className="space-y-6">
          {/* Sankey Diagram — full-width */}
          <SankeyFlow data={incomeData} />

          {/* Waterfall + Dollar Breakdown side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <WaterfallChart
              data={{
                total_revenue: totalRevenue || null,
                interest_expense: incomeData.interest_expense,
                provision_for_losses: incomeData.provision_for_losses,
                noninterest_expense: incomeData.noninterest_expense,
                taxes: null, // FDIC doesn't break out taxes separately
                net_income: institution.net_income,
              }}
            />
            <DollarBreakdown data={assetBreakdownData} />
          </div>

          {/* Detailed income + balance below */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <IncomeFlow data={incomeData} />
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
        </div>
      )}

      {activeTab === 'peers' && (
        <div className="space-y-6">
          {peerData ? (
            <>
              <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
                <p className="text-sm text-primary-800">
                  <span className="font-semibold">Peer Group:</span>{' '}
                  {peerData.peer_group.charter_type.replace(/_/g, ' ')} institutions,{' '}
                  {peerData.peer_group.asset_bucket} assets ({peerData.peer_group.peer_count} peers)
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <PeerRadar
                  institution={{
                    name: institution.name,
                    roa: institution.roa,
                    roi: institution.roi,
                    equity_capital: institution.equity_capital,
                    total_assets: institution.total_assets,
                    total_loans: institution.total_loans,
                    total_deposits: institution.total_deposits,
                    net_income: institution.net_income,
                  }}
                  peerMedian={peerData.peer_median}
                />
                <PercentileRanks rankings={peerData.rankings} />
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <Skeleton className="h-12 w-full" />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Skeleton className="h-96" />
                <Skeleton className="h-96" />
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-6">
          <HistoryChart history={history} />
        </div>
      )}

      {/* Data freshness */}
      {institution.data_as_of && (
        <p className="text-xs text-surface-400 text-right">
          Data as of {institution.data_as_of} | FDIC Cert #{institution.cert_number}
        </p>
      )}
    </div>
  );
}
