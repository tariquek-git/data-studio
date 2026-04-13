import { ChevronRight } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/format';
import { useExploreStore } from '@/stores/exploreStore';
import type { SearchAggregations } from '@/types/filters';
import type { Institution } from '@/types/institution';
import { BrimAnalyticsPanel } from '@/components/explore/BrimAnalyticsPanel';

interface ExploreAnalyticsPanelProps {
  total: number;
  aggregations: SearchAggregations | null;
  institutions?: Institution[];
}

export function ExploreAnalyticsPanel({ total, aggregations, institutions = [] }: ExploreAnalyticsPanelProps) {
  const { analyticsPanelOpen, setAnalyticsPanelOpen, brimMode } = useExploreStore();

  if (!analyticsPanelOpen) {
    return (
      <div className="w-8 shrink-0 flex flex-col items-center pt-4 border-l border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setAnalyticsPanelOpen(true)}
          className="flex items-center justify-center h-8 w-8 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
          title="Open analytics panel"
        >
          <ChevronRight className="h-4 w-4 rotate-180" />
        </button>
      </div>
    );
  }

  // Top 5 states
  const topStates = aggregations
    ? Object.entries(aggregations.by_state)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    : [];

  // By source from charter type agg (we use what the API gives us)
  const topCharters = aggregations
    ? Object.entries(aggregations.by_charter_type)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
    : [];

  const maxStateCount = topStates[0]?.[1] ?? 1;
  const maxCharterCount = topCharters[0]?.[1] ?? 1;

  // Median ROA: approximate from page data — not available directly, show avg
  const avgAssets = aggregations?.avg_assets ?? null;

  return (
    <div className={`w-64 shrink-0 flex flex-col border-l bg-white overflow-y-auto ${brimMode ? 'border-violet-200' : 'border-slate-200'}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 pt-4 pb-3 border-b ${brimMode ? 'border-violet-100' : 'border-slate-100'}`}>
        <h2 className={`text-xs font-semibold uppercase tracking-wider ${brimMode ? 'text-violet-600' : 'text-slate-500'}`}>
          {brimMode ? 'Brim Pipeline' : 'Analytics'}
        </h2>
        <button
          type="button"
          onClick={() => setAnalyticsPanelOpen(false)}
          className="flex items-center gap-0.5 text-xs text-slate-400 hover:text-slate-600"
        >
          Collapse <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Brim Analytics when in Brim Mode */}
      {brimMode && (
        <BrimAnalyticsPanel institutions={institutions} total={total} />
      )}

      {/* Quick Stats (shown in both modes) */}
      {!brimMode && (
      <>
      <div className="px-4 py-3 border-b border-slate-100 space-y-3">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Quick Stats</h3>

        <Stat label="Total Results" value={formatNumber(total)} />
        <Stat
          label="Combined Assets"
          value={formatCurrency(aggregations?.total_assets_sum ?? null)}
        />
        <Stat
          label="Avg Assets"
          value={formatCurrency(avgAssets)}
        />
        <Stat
          label="Combined Deposits"
          value={formatCurrency(aggregations?.total_deposits_sum ?? null)}
        />
      </div>

      {/* By Charter Type */}
      {topCharters.length > 0 && (
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">By Charter</h3>
          <div className="space-y-2">
            {topCharters.map(([type, count]) => (
              <div key={type}>
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="text-slate-600 capitalize">{type.replace(/_/g, ' ')}</span>
                  <span className="font-medium text-slate-800">{formatNumber(count)}</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-1.5 bg-blue-500 rounded-full"
                    style={{ width: `${(count / maxCharterCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top 5 States */}
      {topStates.length > 0 && (
        <div className="px-4 py-3">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Top States</h3>
          <div className="space-y-2">
            {topStates.map(([state, count]) => (
              <div key={state}>
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="text-slate-600">{state}</span>
                  <span className="font-medium text-slate-800">{formatNumber(count)}</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-1.5 bg-indigo-500 rounded-full"
                    style={{ width: `${(count / maxStateCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-900 leading-tight">{value}</p>
    </div>
  );
}
