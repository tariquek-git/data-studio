import { useState } from 'react';
import { useParams, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CreditCard, GitBranch, BarChart3, DollarSign, Users, TrendingUp, Activity, Globe, ShieldCheck } from 'lucide-react';
import { ProfileHeader } from '@/components/institution/ProfileHeader';
import { ExportButton } from '@/components/institution/ExportButton';
import { FinancialSnapshot } from '@/components/institution/FinancialSnapshot';
import { HistoryChart } from '@/components/institution/HistoryChart';
import { IncomeFlow } from '@/components/institution/IncomeFlow';
import { BalanceSheetFlow } from '@/components/institution/BalanceSheetFlow';
import { LoanSunburst } from '@/components/institution/LoanSunburst';
import { SankeyFlow } from '@/components/institution/SankeyFlow';
import { WaterfallChart } from '@/components/institution/WaterfallChart';
import { DollarBreakdown } from '@/components/institution/DollarBreakdown';
import { PeerRadar } from '@/components/institution/PeerRadar';
import { PercentileRanks } from '@/components/institution/PercentileRanks';
import { EfficiencyGauge } from '@/components/institution/EfficiencyGauge';
import { KeyMetrics } from '@/components/institution/KeyMetrics';
import { StrengthsFlags } from '@/components/institution/StrengthsFlags';
import { CAMELSScore } from '@/components/institution/CAMELSScore';
import { AISummary } from '@/components/institution/AISummary';
import { AnomalyFlags } from '@/components/institution/AnomalyFlags';
import { EnrichmentPanel } from '@/components/institution/EnrichmentPanel';
import { RegistryProfile } from '@/components/institution/RegistryProfile';
import { SimilarInstitutions } from '@/components/institution/SimilarInstitutions';
import { Card, Skeleton } from '@/components/ui';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
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

type Tab = 'overview' | 'flows' | 'peers' | 'risk' | 'history';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'flows', label: 'Money Flows', icon: <DollarSign className="w-4 h-4" /> },
  { id: 'peers', label: 'Peer Comparison', icon: <Users className="w-4 h-4" /> },
  { id: 'risk', label: 'Risk & Quality', icon: <ShieldCheck className="w-4 h-4" /> },
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

interface Benchmarks {
  institution_count: number;
  roa: { mean: number | null; median: number | null; p25: number | null; p75: number | null };
  roe: { mean: number | null; median: number | null; p25: number | null; p75: number | null };
  equity_ratio: { mean: number | null; median: number | null };
  loan_to_deposit: { mean: number | null; median: number | null };
}

async function fetchBenchmarks(): Promise<Benchmarks> {
  const res = await fetch('/api/analytics/benchmarks');
  if (!res.ok) throw new Error('Failed to load benchmarks');
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

  const { data: benchmarks } = useQuery({
    queryKey: ['industry-benchmarks'],
    queryFn: fetchBenchmarks,
    staleTime: 2 * 60 * 60 * 1000, // 2 hours
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

  // Registry-only institutions (no financial statements)
  const REGISTRY_SOURCES: Institution['source'][] = ['rpaa', 'ciro', 'fintrac', 'fincen'];
  const isRegistryOnly = REGISTRY_SOURCES.includes(institution.source);

  const incomeData = {
    interest_income: getRawField(raw, 'INTINC'),
    noninterest_income: getRawField(raw, 'NONII'),
    interest_expense: getRawField(raw, 'EINTEXP'),
    noninterest_expense: getRawField(raw, 'ELNANTR'),
    provision_for_losses: getRawField(raw, 'ELNATR'),
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
      <ProfileHeader
        institution={institution}
        actions={<ExportButton institution={institution} history={history} />}
      />

      {/* Tabs — only shown for deposit-taking institutions with financial data */}
      {!isRegistryOnly && (
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
      )}

      {/* Registry-only profile (RPAA PSPs, CIRO, FINTRAC, FinCEN) */}
      {isRegistryOnly && (
        <RegistryProfile institution={institution} />
      )}

      {/* Tab Content — deposit-takers only */}
      {!isRegistryOnly && activeTab === 'overview' && (
        <div className="space-y-6">
          <FinancialSnapshot institution={institution} />

          {/* Statistical anomaly flags vs. industry benchmarks */}
          <AnomalyFlags institution={institution} raw={raw} />

          {/* Public records enrichment: CRA, enforcement actions, SEC filings, Wikipedia */}
          <EnrichmentPanel institution={institution} />

          {/* AI-powered analyst summary */}
          <AISummary certNumber={institution.cert_number} />

          {/* Semantically similar institutions */}
          <SimilarInstitutions entityId={institution.id} />

          {/* Operational metrics row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {institution.num_branches != null && (
              <Card className="flex items-center gap-3">
                <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary-50 shrink-0">
                  <GitBranch className="h-5 w-5 text-primary-600" />
                </div>
                <div>
                  <p className="text-xs text-surface-500">Branches</p>
                  <p className="text-lg font-bold text-surface-900">{formatNumber(institution.num_branches)}</p>
                  <p className="text-xs text-surface-400">{institution.state ?? 'Multiple locations'}</p>
                  <p className="text-xs text-surface-400 mt-0.5">
                    Branch locations via FDIC SOD{' '}
                    <a
                      href={`https://banks.data.fdic.gov/api/branches?filters=CERT:${institution.cert_number}&limit=100`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:underline"
                      onClick={e => e.stopPropagation()}
                    >
                      View on FDIC →
                    </a>
                  </p>
                </div>
              </Card>
            )}
            {institution.num_employees != null && (
              <Card className="flex items-center gap-3">
                <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-purple-50 shrink-0">
                  <Users className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-surface-500">Employees</p>
                  <p className="text-lg font-bold text-surface-900">{formatNumber(institution.num_employees)}</p>
                  <p className="text-xs text-surface-400">Full-time equivalent</p>
                </div>
              </Card>
            )}
            {hasCreditCards && (
              <Card className="flex items-center gap-3">
                <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-green-50 shrink-0">
                  <CreditCard className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-surface-500">CC Receivables</p>
                  <p className="text-lg font-bold text-surface-900">{formatCurrency(institution.credit_card_loans)}</p>
                  <p className="text-xs text-surface-400">Active CC program</p>
                </div>
              </Card>
            )}
            {institution.total_assets && institution.total_loans && (
              <Card className="flex items-center gap-3">
                <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-cyan-50 shrink-0">
                  <Activity className="h-5 w-5 text-cyan-600" />
                </div>
                <div>
                  <p className="text-xs text-surface-500">Loan / Deposit</p>
                  <p className={`text-lg font-bold ${
                    institution.total_deposits && (institution.total_loans / institution.total_deposits) > 0.9
                      ? 'text-amber-600' : 'text-surface-900'
                  }`}>
                    {institution.total_deposits
                      ? formatPercent((institution.total_loans / institution.total_deposits) * 100, 0)
                      : '—'}
                  </p>
                  <p className="text-xs text-surface-400">Optimal: 70–85%</p>
                </div>
              </Card>
            )}
            {institution.website && (
              <Card className="flex items-center gap-3">
                <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-surface-50 shrink-0">
                  <Globe className="h-5 w-5 text-surface-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-surface-500">Website</p>
                  <a
                    href={institution.website.startsWith('http') ? institution.website : `https://${institution.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-primary-600 hover:underline truncate block"
                    onClick={e => e.stopPropagation()}
                  >
                    {institution.website.replace(/^https?:\/\//, '')}
                  </a>
                </div>
              </Card>
            )}
          </div>

          {/* Efficiency gauge + quick income side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="flex flex-col items-center justify-center py-4">
              {(() => {
                const totalRevenue = (incomeData.interest_income ?? 0) + (incomeData.noninterest_income ?? 0);
                const effRatio = totalRevenue > 0 && incomeData.noninterest_expense != null
                  ? (incomeData.noninterest_expense / totalRevenue) * 100
                  : null;
                return (
                  <>
                    <h3 className="text-sm font-semibold text-surface-700 mb-4">Efficiency Ratio</h3>
                    <EfficiencyGauge efficiencyRatio={effRatio} />
                    <p className="text-xs text-surface-400 text-center mt-3 max-w-[200px]">
                      Non-interest expense as % of total revenue. Lower = more efficient.
                    </p>
                  </>
                );
              })()}
            </Card>
            <div className="lg:col-span-2">
              <IncomeFlow data={incomeData} />
            </div>
          </div>

          {/* Balance sheet */}
          <BalanceSheetFlow
            data={{
              total_assets: institution.total_assets,
              total_deposits: institution.total_deposits,
              total_loans: institution.total_loans,
              equity_capital: institution.equity_capital,
              credit_card_loans: institution.credit_card_loans,
            }}
          />

          {/* Quick benchmarks vs live national averages */}
          <Card>
            <h3 className="text-sm font-semibold text-surface-700 mb-1">vs. Industry Benchmarks</h3>
            {benchmarks && (
              <p className="text-xs text-surface-400 mb-4">
                Computed live from {formatNumber(benchmarks.institution_count)} active FDIC-insured banks
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                {
                  label: 'Return on Assets',
                  value: institution.roa,
                  benchmark: benchmarks?.roa.median ?? null,
                  p25: benchmarks?.roa.p25 ?? null,
                  p75: benchmarks?.roa.p75 ?? null,
                  format: (v: number) => formatPercent(v),
                  higher_is_better: true,
                },
                {
                  label: 'Return on Equity',
                  value: institution.roi,
                  benchmark: benchmarks?.roe.median ?? null,
                  p25: benchmarks?.roe.p25 ?? null,
                  p75: benchmarks?.roe.p75 ?? null,
                  format: (v: number) => formatPercent(v),
                  higher_is_better: true,
                },
                {
                  label: 'Equity / Assets',
                  value: institution.total_assets && institution.equity_capital
                    ? (institution.equity_capital / institution.total_assets) * 100
                    : null,
                  benchmark: benchmarks?.equity_ratio.median ?? null,
                  p25: null,
                  p75: null,
                  format: (v: number) => formatPercent(v),
                  higher_is_better: true,
                },
              ].map(metric => {
                if (metric.value == null) return null;
                const bm = metric.benchmark;
                if (bm == null) return (
                  <div key={metric.label} className="bg-surface-50 rounded-xl p-4">
                    <p className="text-xs text-surface-500 mb-1">{metric.label}</p>
                    <p className={`text-2xl font-bold ${metric.value >= 0 ? 'text-surface-900' : 'text-red-600'}`}>
                      {metric.format(metric.value)}
                    </p>
                    <p className="text-xs text-surface-400 mt-2">Loading industry avg…</p>
                  </div>
                );
                const diff = metric.value - bm;
                const better = metric.higher_is_better ? diff >= 0 : diff <= 0;
                const inTopQuartile = metric.p75 != null && metric.value >= metric.p75;
                const inBottomQuartile = metric.p25 != null && metric.value <= metric.p25;
                return (
                  <div key={metric.label} className="bg-surface-50 rounded-xl p-4">
                    <p className="text-xs text-surface-500 mb-1">{metric.label}</p>
                    <p className={`text-2xl font-bold ${metric.value >= 0 ? 'text-surface-900' : 'text-red-600'}`}>
                      {metric.format(metric.value)}
                    </p>
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        inTopQuartile ? 'bg-green-100 text-green-700' :
                        inBottomQuartile ? 'bg-red-100 text-red-700' :
                        better ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {better ? '▲' : '▼'} {metric.format(Math.abs(diff))} vs median
                      </span>
                    </div>
                    <p className="text-xs text-surface-400 mt-1">
                      Industry median: {metric.format(bm)}
                      {metric.p25 != null && metric.p75 != null && (
                        <> · IQR {metric.format(metric.p25)}–{metric.format(metric.p75)}</>
                      )}
                    </p>
                  </div>
                );
              }).filter(Boolean)}
            </div>
          </Card>
        </div>
      )}

      {!isRegistryOnly && activeTab === 'flows' && (
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

          {/* Loan portfolio breakdown */}
          <LoanSunburst raw={raw} totalLoans={institution.total_loans} />

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

      {!isRegistryOnly && activeTab === 'peers' && (
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

      {!isRegistryOnly && activeTab === 'risk' && (
        <div className="space-y-6">
          <KeyMetrics raw={raw} institution={institution} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <StrengthsFlags institution={institution} raw={raw} />
            <CAMELSScore institution={institution} raw={raw} />
          </div>
          <p className="text-xs text-surface-400 text-center">
            Data sourced from FDIC Call Reports (BankFind Suite). CAMELS approximation uses public financial ratios only.
          </p>
        </div>
      )}

      {!isRegistryOnly && activeTab === 'history' && (
        <div className="space-y-6">
          <HistoryChart history={history} institution={{ source: institution.source }} />
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
