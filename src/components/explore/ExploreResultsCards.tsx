import { Link } from 'react-router';
import { MapPin, DollarSign, TrendingUp, Plus, Check } from 'lucide-react';
import { Badge } from '@/components/ui';
import { formatCurrency, formatPercent } from '@/lib/format';
import { useExploreStore } from '@/stores/exploreStore';
import type { Institution } from '@/types/institution';

interface ExploreResultsCardsProps {
  institutions: Institution[];
}

function charterColor(type: string | null): 'blue' | 'green' | 'purple' | 'gray' {
  if (!type) return 'gray';
  if (type.includes('commercial')) return 'blue';
  if (type.includes('credit_union')) return 'green';
  if (type.includes('savings')) return 'purple';
  return 'gray';
}

function sourceColor(source: string): 'blue' | 'green' | 'purple' | 'gray' | 'indigo' {
  if (source === 'fdic') return 'blue';
  if (source === 'ncua') return 'green';
  if (source === 'osfi') return 'indigo';
  return 'gray';
}

export function ExploreResultsCards({ institutions }: ExploreResultsCardsProps) {
  const store = useExploreStore();

  if (institutions.length === 0) {
    return (
      <div className="rounded-xl border border-surface-700/50 bg-surface-800/60 text-center py-16">
        <p className="text-surface-400 text-sm">No institutions found. Try adjusting your filters.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {institutions.map((inst) => {
        const displayName = inst.name || inst.holding_company || `Cert #${inst.cert_number}`;
        const inWorkingSet = store.workingSet.some((w) => w.certNumber === inst.cert_number);

        return (
          <div
            key={inst.id}
            className="group rounded-xl border border-surface-700/50 bg-surface-800/60 backdrop-blur hover:border-surface-600 hover:bg-surface-800/80 transition-all p-4 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="min-w-0">
                <Link
                  to={`/institution/${inst.cert_number}`}
                  className="text-sm font-bold text-surface-100 group-hover:text-primary-400 hover:underline line-clamp-2 transition-colors"
                >
                  {displayName}
                </Link>
                <div className="flex items-center gap-1 mt-1 text-xs text-surface-500">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span>{inst.city ? `${inst.city}, ` : ''}{inst.state ?? '—'}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge color={sourceColor(inst.source)}>
                  {inst.source.toUpperCase()}
                </Badge>
                {inst.charter_type && (
                  <Badge color={charterColor(inst.charter_type)} className="text-xs">
                    {inst.charter_type.replace(/_/g, ' ')}
                  </Badge>
                )}
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs mb-3 flex-1">
              <div>
                <span className="text-surface-500 flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />Assets
                </span>
                <span className="font-semibold font-mono text-surface-200 mt-0.5 block">
                  {formatCurrency(inst.total_assets)}
                </span>
              </div>
              <div>
                <span className="text-surface-500 flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />Deposits
                </span>
                <span className="font-semibold font-mono text-surface-200 mt-0.5 block">
                  {formatCurrency(inst.total_deposits)}
                </span>
              </div>
              <div>
                <span className="text-surface-500 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />ROA
                </span>
                <span
                  className={`font-semibold font-mono mt-0.5 block ${
                    inst.roa != null
                      ? inst.roa >= 0
                        ? 'text-emerald-600'
                        : 'text-red-600'
                      : 'text-surface-600'
                  }`}
                >
                  {formatPercent(inst.roa)}
                </span>
              </div>
              <div>
                <span className="text-surface-500 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />ROE
                </span>
                <span
                  className={`font-semibold font-mono mt-0.5 block ${
                    inst.roi != null
                      ? inst.roi >= 0
                        ? 'text-emerald-600'
                        : 'text-red-600'
                      : 'text-surface-600'
                  }`}
                >
                  {formatPercent(inst.roi)}
                </span>
              </div>
            </div>

            {/* Add to set button */}
            <div className="pt-2 border-t border-surface-700/30">
              <button
                type="button"
                onClick={() => {
                  if (inWorkingSet) {
                    store.removeFromWorkingSet(inst.cert_number);
                  } else {
                    store.addToWorkingSet({ certNumber: inst.cert_number, name: displayName });
                  }
                }}
                className={`w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  inWorkingSet
                    ? 'bg-primary-500/10 text-primary-400 border-primary-500/30 hover:bg-primary-500/20'
                    : 'text-surface-400 border-surface-700 hover:text-surface-200 hover:bg-surface-800'
                }`}
              >
                {inWorkingSet ? (
                  <>
                    <Check className="h-3 w-3" />
                    In Working Set
                  </>
                ) : (
                  <>
                    <Plus className="h-3 w-3" />
                    Add to Set
                  </>
                )}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
