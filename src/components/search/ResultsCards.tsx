import { Link } from 'react-router';
import { MapPin, GitBranch, TrendingUp, DollarSign, CreditCard } from 'lucide-react';
import { Badge } from '@/components/ui';
import { formatCurrency, formatPercent } from '@/lib/format';
import type { Institution } from '@/types/institution';

interface ResultsCardsProps {
  institutions: Institution[];
}

function charterColor(type: string | null): 'blue' | 'green' | 'purple' | 'gray' {
  if (!type) return 'gray';
  if (type.includes('commercial')) return 'blue';
  if (type.includes('credit_union')) return 'green';
  if (type.includes('savings')) return 'purple';
  return 'gray';
}

function RoaBar({ value }: { value: number | null }) {
  if (value == null) return <div className="h-1.5 bg-surface-800 rounded-full" />;
  // Typical range: -1 to 3, center at 0
  const pct = Math.max(0, Math.min(100, ((value + 1) / 4) * 100));
  const color = value >= 1 ? 'bg-green-500' : value >= 0 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="h-1.5 bg-surface-800 rounded-full overflow-hidden">
      <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ResultsCards({ institutions }: ResultsCardsProps) {
  if (institutions.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-surface-500 text-sm">No institutions found. Try adjusting your filters.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {institutions.map(inst => {
        const hasCC = inst.credit_card_loans != null && inst.credit_card_loans > 0;
        return (
          <Link
            key={inst.id}
            to={`/institution/${inst.cert_number}`}
            className="group block bg-white border border-surface-700 rounded-xl p-4 hover:border-primary-400 hover:shadow-md transition-all"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-surface-100 group-hover:text-primary-700 truncate">
                  {inst.name || inst.holding_company || `Cert #${inst.cert_number}`}
                </h3>
                <div className="flex items-center gap-1.5 mt-0.5 text-xs text-surface-500">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span>{inst.city ? `${inst.city}, ` : ''}{inst.state ?? '—'}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                {inst.charter_type && (
                  <Badge color={charterColor(inst.charter_type)} className="text-xs">
                    {inst.charter_type.replace(/_/g, ' ')}
                  </Badge>
                )}
                {hasCC && (
                  <Badge color="green" className="text-xs">CC Program</Badge>
                )}
              </div>
            </div>

            {/* Key metrics */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs mb-3">
              <div>
                <span className="text-surface-400 flex items-center gap-1"><DollarSign className="h-3 w-3" />Assets</span>
                <span className="font-semibold text-surface-200 mt-0.5 block">{formatCurrency(inst.total_assets)}</span>
              </div>
              <div>
                <span className="text-surface-400 flex items-center gap-1"><DollarSign className="h-3 w-3" />Deposits</span>
                <span className="font-semibold text-surface-200 mt-0.5 block">{formatCurrency(inst.total_deposits)}</span>
              </div>
              <div>
                <span className="text-surface-400 flex items-center gap-1"><TrendingUp className="h-3 w-3" />ROA</span>
                <span className={`font-semibold mt-0.5 block ${
                  inst.roa != null ? (inst.roa >= 0 ? 'text-green-700' : 'text-red-600') : 'text-surface-400'
                }`}>{formatPercent(inst.roa)}</span>
              </div>
              <div>
                <span className="text-surface-400 flex items-center gap-1"><TrendingUp className="h-3 w-3" />ROE</span>
                <span className={`font-semibold mt-0.5 block ${
                  inst.roi != null ? (inst.roi >= 0 ? 'text-green-700' : 'text-red-600') : 'text-surface-400'
                }`}>{formatPercent(inst.roi)}</span>
              </div>
            </div>

            {/* ROA bar */}
            <div className="mb-2">
              <div className="flex justify-between text-xs text-surface-400 mb-1">
                <span>ROA</span>
                <span>{inst.roa != null ? formatPercent(inst.roa) : '—'}</span>
              </div>
              <RoaBar value={inst.roa} />
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 pt-2 border-t border-surface-800 text-xs text-surface-400">
              {inst.num_branches != null && (
                <span className="flex items-center gap-1">
                  <GitBranch className="h-3 w-3" />
                  {inst.num_branches} branches
                </span>
              )}
              {hasCC && inst.credit_card_loans != null && (
                <span className="flex items-center gap-1">
                  <CreditCard className="h-3 w-3" />
                  {formatCurrency(inst.credit_card_loans)} CC
                </span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
