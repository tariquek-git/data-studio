import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Target, TrendingUp, TrendingDown, ShieldAlert, Ban } from 'lucide-react';
import { Skeleton } from '@/components/ui';

interface SignalRow {
  fact_type: string;
  display_name: string;
  category: string;
  contribution: number;
  raw_weight: number;
  freshness: number;
  confidence: number;
  observed_at: string | null;
  source_kind: string;
  source_url: string | null;
  value_text: string | null;
  value_number: number | null;
  disqualifier: boolean;
}

interface SignalsResponse {
  institution: { id: string; name: string; cert_number: number };
  score: number;
  tier: 'A' | 'B' | 'C' | 'D' | 'F';
  signals: SignalRow[];
  disqualifiers: string[];
  disqualified: boolean;
  raw_score?: number;
  max_possible?: number;
  computed_at: string;
}

async function fetchSignals(certNumber: string): Promise<SignalsResponse> {
  const res = await fetch(`/api/institutions/${certNumber}/signals`);
  if (!res.ok) throw new Error('Failed to load Brim signals');
  return res.json() as Promise<SignalsResponse>;
}

const TIER_CONFIG: Record<SignalsResponse['tier'], { bg: string; text: string; label: string }> = {
  A: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Tier A — priority prospect' },
  B: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Tier B — strong prospect' },
  C: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Tier C — qualified' },
  D: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Tier D — watchlist' },
  F: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Tier F — not a fit' },
};

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  program_fit: { label: 'Program fit', icon: Target, color: 'text-blue-600' },
  timing: { label: 'Timing', icon: TrendingUp, color: 'text-purple-600' },
  growth: { label: 'Growth', icon: TrendingUp, color: 'text-emerald-600' },
  risk: { label: 'Risk', icon: ShieldAlert, color: 'text-red-600' },
  peer: { label: 'Peer', icon: TrendingDown, color: 'text-indigo-600' },
};

function formatSignalValue(signal: SignalRow): string | null {
  if (signal.value_text) return signal.value_text;
  if (signal.value_number != null) {
    if (signal.value_number >= 1_000_000_000) return `$${(signal.value_number / 1_000_000_000).toFixed(1)}B`;
    if (signal.value_number >= 1_000_000) return `$${(signal.value_number / 1_000_000).toFixed(1)}M`;
    return signal.value_number.toLocaleString();
  }
  return null;
}

function formatAge(observedAt: string | null): string {
  if (!observedAt) return 'unknown';
  const ageDays = Math.floor((Date.now() - new Date(observedAt).getTime()) / (1000 * 60 * 60 * 24));
  if (ageDays < 30) return `${ageDays}d ago`;
  if (ageDays < 365) return `${Math.floor(ageDays / 30)}mo ago`;
  return `${(ageDays / 365).toFixed(1)}y ago`;
}

interface StoryBrimSignalsProps {
  certNumber: string;
}

export function StoryBrimSignals({ certNumber }: StoryBrimSignalsProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading, isError } = useQuery({
    queryKey: ['brim-signals', certNumber],
    queryFn: () => fetchSignals(certNumber),
    staleTime: 5 * 60 * 1000,
  });

  if (isError) return null;

  if (isLoading || !data) {
    return (
      <section id="section-brim-signals" className="py-12 px-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 border-t border-slate-200" />
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap">
            Brim Fit
          </h2>
          <div className="flex-1 border-t border-slate-200" />
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
      </section>
    );
  }

  const tier = TIER_CONFIG[data.tier];
  const sorted = [...data.signals].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  const maxAbsContribution = sorted.length > 0 ? Math.max(...sorted.map((s) => Math.abs(s.contribution))) : 1;

  const toggleExpanded = (factType: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(factType)) next.delete(factType);
      else next.add(factType);
      return next;
    });
  };

  return (
    <section id="section-brim-signals" className="py-12 px-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 border-t border-slate-200" />
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap">
          Brim Fit — Why This Matters
        </h2>
        <div className="flex-1 border-t border-slate-200" />
      </div>

      <div className="rounded-xl bg-gradient-to-br from-slate-50 to-blue-50/50 border border-slate-200 p-6">
        {/* Header: score + tier */}
        <div className="flex items-center justify-between mb-6 pb-6 border-b border-slate-200">
          <div>
            <div className="text-5xl font-semibold text-slate-900 tabular-nums">
              {data.score}
              <span className="text-xl text-slate-400 font-normal"> / 100</span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Brim prospect score · {data.signals.length} signal{data.signals.length === 1 ? '' : 's'} populated
            </div>
          </div>
          <div className={`px-4 py-2 rounded-full text-sm font-semibold ${tier.bg} ${tier.text}`}>
            {tier.label}
          </div>
        </div>

        {/* Disqualifiers */}
        {data.disqualified && data.disqualifiers.length > 0 && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Ban className="h-4 w-4 text-red-600" />
              <span className="text-sm font-semibold text-red-700">Hard-excluded from prospecting</span>
            </div>
            <ul className="text-xs text-red-700 space-y-1 ml-6 list-disc">
              {data.disqualifiers.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Signal breakdown */}
        {sorted.length === 0 ? (
          <p className="text-sm text-slate-500">
            No Brim signals have been collected for this institution yet. Run the signal collectors to populate the breakdown.
          </p>
        ) : (
          <div className="space-y-2">
            {sorted.map((signal) => {
              const isExpanded = expanded.has(signal.fact_type);
              const isPositive = signal.contribution >= 0;
              const widthPct = (Math.abs(signal.contribution) / maxAbsContribution) * 100;
              const category = CATEGORY_CONFIG[signal.category] ?? {
                label: signal.category,
                icon: Target,
                color: 'text-slate-600',
              };
              const Icon = category.icon;
              const value = formatSignalValue(signal);

              return (
                <div key={signal.fact_type} className="rounded-lg border border-slate-200 bg-white">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(signal.fact_type)}
                    className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50 transition-colors rounded-lg"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                    )}
                    <Icon className={`h-4 w-4 shrink-0 ${category.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-700 truncate">
                          {signal.display_name}
                        </span>
                        <span
                          className={`text-sm font-semibold tabular-nums shrink-0 ${
                            isPositive ? 'text-emerald-600' : 'text-red-600'
                          }`}
                        >
                          {isPositive ? '+' : ''}
                          {signal.contribution.toFixed(1)}
                        </span>
                      </div>
                      {/* Contribution bar */}
                      <div className="mt-1.5 h-1 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            isPositive ? 'bg-emerald-400' : 'bg-red-400'
                          }`}
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-slate-100 px-10 py-3 space-y-2 text-xs text-slate-600">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <div>
                          <span className="text-slate-400">Category:</span>{' '}
                          <span className="font-medium">{category.label}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Raw weight:</span>{' '}
                          <span className="font-medium tabular-nums">{signal.raw_weight}</span>
                        </div>
                        {value && (
                          <div>
                            <span className="text-slate-400">Value:</span>{' '}
                            <span className="font-medium">{value}</span>
                          </div>
                        )}
                        <div>
                          <span className="text-slate-400">Freshness:</span>{' '}
                          <span className="font-medium tabular-nums">{(signal.freshness * 100).toFixed(0)}%</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Confidence:</span>{' '}
                          <span className="font-medium tabular-nums">{(signal.confidence * 100).toFixed(0)}%</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Observed:</span>{' '}
                          <span className="font-medium">{formatAge(signal.observed_at)}</span>
                        </div>
                      </div>
                      {signal.source_url && (
                        <a
                          href={signal.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium pt-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {signal.source_kind} source
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-4 pt-3 border-t border-slate-200/50 text-xs text-slate-400">
          Score = weighted sum of signals × freshness × confidence, normalized to 100. Click any signal to expand its source.
        </p>
      </div>
    </section>
  );
}
