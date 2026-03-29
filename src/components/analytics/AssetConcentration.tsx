import { Link } from 'react-router';
import { formatCurrency, formatPercent } from '@/lib/format';

interface TopInstitution {
  rank: number;
  name: string;
  cert_number: number;
  total_assets: number;
  pct_of_total: number;
  cumulative_pct: number;
}

interface ConcentrationData {
  total: number;
  top1_pct: number;
  top5_pct: number;
  top10_pct: number;
  top25_pct: number;
  top_institutions: TopInstitution[];
}

interface AssetConcentrationProps {
  data: ConcentrationData;
}

// Color scale: dark blue for biggest, lighter for smaller
const ROW_COLORS = [
  '#1e3a5f', '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa',
  '#93c5fd', '#bfdbfe', '#dbeafe', '#eff6ff', '#f8fafc',
];

export function AssetConcentration({ data }: AssetConcentrationProps) {
  const rest_pct = 100 - data.top10_pct;

  return (
    <div className="space-y-5">
      {/* Concentration bar */}
      <div>
        <p className="text-xs font-medium text-surface-500 mb-2">Share of total US banking assets</p>
        <div className="h-10 w-full rounded-lg overflow-hidden flex">
          {data.top_institutions.map((inst, i) => (
            <div
              key={inst.cert_number}
              className="relative group h-full transition-all hover:opacity-80"
              style={{ width: `${inst.pct_of_total}%`, backgroundColor: ROW_COLORS[i], minWidth: inst.pct_of_total > 1.5 ? 0 : 2 }}
              title={`${inst.name}: ${formatPercent(inst.pct_of_total, 1)} of total assets`}
            />
          ))}
          <div
            className="h-full bg-surface-200"
            style={{ width: `${rest_pct}%` }}
            title={`All other institutions: ${formatPercent(rest_pct, 1)}`}
          />
        </div>
        <div className="flex justify-between text-xs text-surface-400 mt-1">
          <span>Top 10 banks ({formatPercent(data.top10_pct, 0)} of all assets)</span>
          <span>Remaining ~4,400 banks ({formatPercent(rest_pct, 0)})</span>
        </div>
      </div>

      {/* Concentration callout */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Largest bank controls', value: formatPercent(data.top1_pct, 1), sub: 'of total assets' },
          { label: 'Top 5 banks control', value: formatPercent(data.top5_pct, 1), sub: 'of total assets' },
          { label: 'Top 10 banks control', value: formatPercent(data.top10_pct, 1), sub: 'of total assets' },
          { label: 'Top 25 banks control', value: formatPercent(data.top25_pct, 1), sub: 'of total assets' },
        ].map(s => (
          <div key={s.label} className="bg-surface-50 border border-surface-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-primary-700">{s.value}</p>
            <p className="text-xs text-surface-500 mt-0.5">{s.label}</p>
            <p className="text-xs text-surface-400">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Ranked table */}
      <div className="overflow-hidden rounded-xl border border-surface-200">
        <table className="min-w-full">
          <thead>
            <tr className="bg-surface-50 border-b border-surface-200">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-surface-500 uppercase">#</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-surface-500 uppercase">Institution</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-surface-500 uppercase">Total Assets</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-surface-500 uppercase">% of Total</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-surface-500 uppercase hidden sm:table-cell">Cumulative</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {data.top_institutions.map((inst, i) => (
              <tr key={inst.cert_number} className="hover:bg-surface-50 transition-colors">
                <td className="px-4 py-2.5">
                  <div
                    className="w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold"
                    style={{ backgroundColor: ROW_COLORS[i] }}
                  >
                    {inst.rank}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <Link
                    to={`/institution/${inst.cert_number}`}
                    className="text-sm font-medium text-primary-700 hover:underline"
                  >
                    {inst.name}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-right text-sm font-mono text-surface-900">
                  {formatCurrency(inst.total_assets)}
                </td>
                <td className="px-4 py-2.5 text-right text-sm font-mono">
                  <span className="font-semibold text-primary-700">{formatPercent(inst.pct_of_total, 1)}</span>
                  <div className="mt-0.5 h-1 bg-surface-100 rounded-full w-full">
                    <div
                      className="h-1 rounded-full"
                      style={{ width: `${Math.min(100, inst.pct_of_total * 5)}%`, backgroundColor: ROW_COLORS[i] }}
                    />
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right text-sm text-surface-500 hidden sm:table-cell">
                  {formatPercent(inst.cumulative_pct, 1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-surface-400">
        Total US banking assets: {formatCurrency(data.total)} · FDIC Q4 2025 call report data
      </p>
    </div>
  );
}
