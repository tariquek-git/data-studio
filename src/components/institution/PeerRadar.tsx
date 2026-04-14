'use client';

import { Target } from 'lucide-react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { formatPercent } from '@/lib/format';

interface PeerRadarProps {
  institution: {
    name: string;
    roa: number | null;
    roi: number | null;
    equity_capital: number | null;
    total_assets: number | null;
    total_loans: number | null;
    total_deposits: number | null;
    net_income: number | null;
  };
  peerMedian: {
    roa: number;
    roi: number;
    equity_ratio: number;
    loan_to_deposit: number;
    asset_size_percentile: number;
    efficiency: number;
  } | null;
}

function normalizeSignedMetric(value: number | null): number {
  if (value == null) return 50;
  // Center at 50; +-5 maps to 0-100
  const normalized = 50 + (value / 5) * 50;
  return Math.max(0, Math.min(100, normalized));
}

function normalizePositiveMetric(value: number | null, max: number): number {
  if (value == null || max === 0) return 0;
  const normalized = (value / max) * 100;
  return Math.max(0, Math.min(100, normalized));
}

function safeDivide(a: number | null, b: number | null): number | null {
  if (a == null || b == null || b === 0) return null;
  return (a / b) * 100;
}

type MetricRow = {
  label: string;
  key: string;
  institutionRaw: number | null;
  peerRaw: number | null;
  format: (v: number | null) => string;
};

export function PeerRadar({ institution, peerMedian }: PeerRadarProps) {
  const instEquityRatio = safeDivide(institution.equity_capital, institution.total_assets);
  const instLoanDeposit = safeDivide(institution.total_loans, institution.total_deposits);
  const instEfficiency = safeDivide(institution.net_income, institution.total_assets);

  const metrics: MetricRow[] = [
    {
      label: 'ROA',
      key: 'roa',
      institutionRaw: institution.roa,
      peerRaw: peerMedian?.roa ?? null,
      format: (v) => formatPercent(v),
    },
    {
      label: 'ROE',
      key: 'roe',
      institutionRaw: institution.roi,
      peerRaw: peerMedian?.roi ?? null,
      format: (v) => formatPercent(v),
    },
    {
      label: 'Equity Ratio',
      key: 'equity_ratio',
      institutionRaw: instEquityRatio,
      peerRaw: peerMedian?.equity_ratio ?? null,
      format: (v) => formatPercent(v),
    },
    {
      label: 'Loan/Deposit',
      key: 'loan_deposit',
      institutionRaw: instLoanDeposit,
      peerRaw: peerMedian?.loan_to_deposit ?? null,
      format: (v) => formatPercent(v),
    },
    {
      label: 'Asset Size',
      key: 'asset_size',
      institutionRaw: peerMedian ? 50 : null, // placeholder; replaced below
      peerRaw: peerMedian?.asset_size_percentile ?? null,
      format: (v) => (v != null ? `${v.toFixed(0)}th pctl` : '\u2014'),
    },
    {
      label: 'Efficiency',
      key: 'efficiency',
      institutionRaw: instEfficiency,
      peerRaw: peerMedian?.efficiency ?? null,
      format: (v) => formatPercent(v),
    },
  ];

  // Determine max values for positive-only metrics to normalize
  const equityMax = Math.max(
    Math.abs(instEquityRatio ?? 0),
    Math.abs(peerMedian?.equity_ratio ?? 0),
    1
  ) * 1.3;
  const loanDepositMax = Math.max(
    Math.abs(instLoanDeposit ?? 0),
    Math.abs(peerMedian?.loan_to_deposit ?? 0),
    1
  ) * 1.3;
  const efficiencyMax = Math.max(
    Math.abs(instEfficiency ?? 0),
    Math.abs(peerMedian?.efficiency ?? 0),
    1
  ) * 1.3;

  function normalizeMetric(key: string, value: number | null): number {
    if (value == null) return 0;
    switch (key) {
      case 'roa':
      case 'roe':
        return normalizeSignedMetric(value);
      case 'equity_ratio':
        return normalizePositiveMetric(value, equityMax);
      case 'loan_deposit':
        return normalizePositiveMetric(value, loanDepositMax);
      case 'asset_size':
        return Math.max(0, Math.min(100, value));
      case 'efficiency':
        return normalizePositiveMetric(value, efficiencyMax);
      default:
        return 50;
    }
  }

  const chartData = metrics.map((m) => ({
    metric: m.label,
    institution: normalizeMetric(m.key, m.key === 'asset_size' ? (peerMedian?.asset_size_percentile ?? 50) : m.institutionRaw),
    peer: peerMedian ? normalizeMetric(m.key, m.peerRaw) : undefined,
  }));

  // For the table, correct the asset_size raw value
  const tableMetrics = metrics.map((m) => ({
    ...m,
    institutionRaw: m.key === 'asset_size' ? (peerMedian?.asset_size_percentile ?? null) : m.institutionRaw,
  }));

  function diffColor(inst: number | null, peer: number | null): string {
    if (inst == null || peer == null) return '';
    if (inst > peer) return 'text-green-600';
    if (inst < peer) return 'text-red-600';
    return '';
  }

  return (
    <div className="rounded-xl border border-surface-700 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Target className="h-5 w-5 text-primary-600" />
        <h3 className="text-lg font-semibold text-surface-100">Peer Comparison</h3>
      </div>

      {!peerMedian && (
        <p className="mb-4 text-sm text-surface-500">
          Peer comparison data not available. Showing institution data only.
        </p>
      )}

      <div className="mx-auto w-full max-w-md">
        <ResponsiveContainer width="100%" height={320}>
          <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="75%">
            <PolarGrid stroke="#e2e8f0" />
            <PolarAngleAxis
              dataKey="metric"
              tick={{ fontSize: 12, fill: '#64748b' }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={false}
              axisLine={false}
            />
            <Radar
              name={institution.name || 'This Bank'}
              dataKey="institution"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.3}
              strokeWidth={2}
            />
            {peerMedian && (
              <Radar
                name="Peer Median"
                dataKey="peer"
                stroke="#f97316"
                fill="transparent"
                fillOpacity={0}
                strokeWidth={2}
                strokeDasharray="6 3"
              />
            )}
            <Legend
              wrapperStyle={{ fontSize: 12 }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-700 text-left text-surface-500">
              <th className="pb-2 pr-4 font-medium">Metric</th>
              <th className="pb-2 pr-4 font-medium">This Bank</th>
              {peerMedian && <th className="pb-2 font-medium">Peer Median</th>}
            </tr>
          </thead>
          <tbody>
            {tableMetrics.map((m) => (
              <tr key={m.key} className="border-b border-surface-800">
                <td className="py-2 pr-4 text-surface-300">{m.label}</td>
                <td
                  className={`py-2 pr-4 font-medium ${
                    peerMedian ? diffColor(m.institutionRaw, m.peerRaw) : 'text-surface-100'
                  }`}
                >
                  {m.format(m.institutionRaw)}
                </td>
                {peerMedian && (
                  <td className="py-2 text-surface-400">
                    {m.format(m.peerRaw)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
