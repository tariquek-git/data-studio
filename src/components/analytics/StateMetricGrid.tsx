import { formatPercent, formatCurrency } from '@/lib/format';

export interface StateMetricRow {
  state: string;
  avg_roa: number | null;
  avg_roi: number | null;
  avg_loan_to_deposit: number | null;
  avg_equity_ratio: number | null;
  institution_count: number;
  total_assets_sum: number;
}

interface StateMetricGridProps {
  states: StateMetricRow[];
}

type MetricKey = 'avg_roa' | 'avg_roi' | 'avg_loan_to_deposit' | 'avg_equity_ratio';

const METRIC_DEFS: { key: MetricKey; label: string; format: (v: number) => string }[] = [
  { key: 'avg_roa', label: 'ROA', format: v => formatPercent(v, 2) },
  { key: 'avg_roi', label: 'ROE', format: v => formatPercent(v, 1) },
  { key: 'avg_loan_to_deposit', label: 'L/D Ratio', format: v => formatPercent(v * 100, 0) },
  { key: 'avg_equity_ratio', label: 'Equity Ratio', format: v => formatPercent(v * 100, 1) },
];

function buildPercentileMap(states: StateMetricRow[], key: MetricKey): Map<string, number> {
  const valid = states
    .filter(s => s[key] != null)
    .map(s => ({ state: s.state, value: s[key] as number }))
    .sort((a, b) => a.value - b.value);

  const map = new Map<string, number>();
  valid.forEach((item, idx) => {
    map.set(item.state, (idx / Math.max(valid.length - 1, 1)) * 100);
  });
  return map;
}

function getCellClass(pct: number): string {
  if (pct >= 75) return 'bg-green-600 text-white';
  if (pct >= 50) return 'bg-green-200 text-green-900';
  if (pct >= 25) return 'bg-amber-100 text-amber-900';
  return 'bg-red-100 text-red-900';
}

export function StateMetricGrid({ states }: StateMetricGridProps) {
  const percentileMaps = Object.fromEntries(
    METRIC_DEFS.map(m => [m.key, buildPercentileMap(states, m.key)])
  ) as Record<MetricKey, Map<string, number>>;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-surface-200">
              <th className="text-left py-2 px-3 text-xs font-semibold text-surface-600 w-32">State</th>
              <th className="text-center py-2 px-2 text-xs font-semibold text-surface-500"># Banks</th>
              <th className="text-center py-2 px-2 text-xs font-semibold text-surface-500">Total Assets</th>
              {METRIC_DEFS.map(m => (
                <th
                  key={m.key}
                  className="text-center py-2 px-3 text-xs font-semibold text-surface-600 min-w-[96px]"
                >
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {states.map((row, i) => (
              <tr
                key={row.state}
                className={`border-b border-surface-100 ${i % 2 === 0 ? 'bg-white' : 'bg-surface-50'}`}
              >
                <td className="py-2 px-3 font-semibold text-surface-900 text-sm">{row.state}</td>
                <td className="py-2 px-2 text-center text-xs text-surface-500">
                  {row.institution_count.toLocaleString()}
                </td>
                <td className="py-2 px-2 text-center text-xs text-surface-500">
                  {formatCurrency(row.total_assets_sum)}
                </td>
                {METRIC_DEFS.map(m => {
                  const val = row[m.key];
                  const pct = percentileMaps[m.key].get(row.state);
                  const cellClass =
                    val != null && pct != null
                      ? getCellClass(pct)
                      : 'bg-surface-100 text-surface-400';

                  return (
                    <td key={m.key} className="py-1 px-1.5">
                      <div
                        className={`rounded-md text-center py-1 px-2 text-xs font-semibold ${cellClass}`}
                        title={pct != null ? `${pct.toFixed(0)}th percentile` : 'No data'}
                      >
                        {val != null ? m.format(val) : '—'}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-surface-100">
        <span className="text-xs font-semibold text-surface-500">Percentile rank within dataset:</span>
        {[
          { cls: 'bg-green-600 text-white', label: 'Top 25%' },
          { cls: 'bg-green-200 text-green-900', label: '26–50%' },
          { cls: 'bg-amber-100 text-amber-900', label: '51–75%' },
          { cls: 'bg-red-100 text-red-900', label: 'Bottom 25%' },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className={`w-5 h-4 rounded text-xs flex items-center justify-center ${item.cls}`} />
            <span className="text-xs text-surface-500">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
