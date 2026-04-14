'use client';

import { BarChart3 } from 'lucide-react';

interface PercentileRanksProps {
  rankings: Array<{
    metric: string;
    value: number | null;
    formatted_value: string;
    percentile: number;
    peer_group_label: string;
  }>;
}

function getPercentileColor(p: number): string {
  if (p >= 75) return 'bg-green-500';
  if (p >= 50) return 'bg-blue-500';
  if (p >= 25) return 'bg-yellow-500';
  return 'bg-red-500';
}

function getPercentileTextColor(p: number): string {
  if (p >= 75) return 'text-green-700';
  if (p >= 50) return 'text-blue-700';
  if (p >= 25) return 'text-yellow-700';
  return 'text-red-700';
}

function ordinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function PercentileRanks({ rankings }: PercentileRanksProps) {
  const peerGroupLabel = rankings.length > 0 ? rankings[0].peer_group_label : '';

  return (
    <div className="rounded-xl border border-surface-700 bg-white p-6 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-primary-600" />
        <h3 className="text-lg font-semibold text-surface-100">Peer Rankings</h3>
      </div>

      {peerGroupLabel && (
        <p className="mb-5 text-sm text-surface-500">{peerGroupLabel}</p>
      )}

      <div className="space-y-4">
        {rankings.map((item) => {
          const isNull = item.value == null || item.percentile == null;

          return (
            <div key={item.metric}>
              {/* Row header: metric name + value */}
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-surface-300">
                  {item.metric}
                </span>
                <span className="shrink-0 text-sm text-surface-500">
                  {item.formatted_value || '\u2014'}
                </span>
              </div>

              {isNull ? (
                <div className="flex h-6 items-center rounded bg-surface-800 px-3">
                  <span className="text-xs text-surface-400">N/A</span>
                </div>
              ) : (
                <div className="relative h-6 w-full overflow-hidden rounded bg-surface-800">
                  {/* Filled bar */}
                  <div
                    className={`absolute inset-y-0 left-0 rounded ${getPercentileColor(item.percentile)}`}
                    style={{ width: `${Math.max(item.percentile, 2)}%`, opacity: 0.2 }}
                  />
                  {/* Marker line */}
                  <div
                    className={`absolute top-0 h-full w-1 rounded ${getPercentileColor(item.percentile)}`}
                    style={{ left: `${Math.min(item.percentile, 99)}%` }}
                  />
                  {/* Label */}
                  <div
                    className="absolute inset-y-0 flex items-center"
                    style={{
                      left: `${Math.min(item.percentile, 99)}%`,
                      transform: item.percentile > 75 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)',
                    }}
                  >
                    <span
                      className={`whitespace-nowrap text-xs font-semibold ${getPercentileTextColor(item.percentile)}`}
                    >
                      {ordinalSuffix(Math.round(item.percentile))}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {rankings.length === 0 && (
        <p className="py-8 text-center text-sm text-surface-400">
          No ranking data available.
        </p>
      )}
    </div>
  );
}
