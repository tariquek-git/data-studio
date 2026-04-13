import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui';
import { WatchlistButton } from '@/components/ui';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import { useExploreStore } from '@/stores/exploreStore';
import type { Institution } from '@/types/institution';
import type { SortField } from '@/types/filters';
import { BrimOpportunityBadges } from '@/components/explore/BrimOpportunityBadges';

interface ExploreResultsTableProps {
  institutions: Institution[];
  total: number;
  isLoading: boolean;
}

const SORTABLE_COLUMNS: { key: SortField; label: string; align?: 'right'; hideMobile?: boolean }[] = [
  { key: 'name', label: 'Name' },
  { key: 'state', label: 'State' },
  { key: 'total_assets', label: 'Assets', align: 'right' },
  { key: 'total_deposits', label: 'Deposits', align: 'right', hideMobile: true },
  { key: 'roa', label: 'ROA', align: 'right' },
  { key: 'roi', label: 'ROE', align: 'right', hideMobile: true },
  { key: 'credit_card_loans', label: 'Brim', align: 'right', hideMobile: true },
];

const BRIM_SORTABLE_COLUMNS: { key: SortField; label: string; align?: 'right'; hideMobile?: boolean }[] = [
  { key: 'name', label: 'Institution' },
  { key: 'brim_score', label: 'Score', align: 'right' },
  { key: 'total_assets', label: 'Assets', align: 'right' },
  { key: 'roa', label: 'ROA', align: 'right' },
  { key: 'credit_card_loans', label: 'Card Portfolio', align: 'right', hideMobile: true },
];

const MIGRATION_PROGRAMS = ['ELAN', 'TCM', 'ICBA', 'PSCU', 'FIS', 'TOTAL SYSTEM'];

function isMigrationTarget(agentProgram: string | null | undefined): boolean {
  if (!agentProgram) return false;
  const upper = agentProgram.toUpperCase();
  return MIGRATION_PROGRAMS.some((p) => upper.includes(p));
}

function BrimScoreBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-surface-600 text-xs">—</span>;
  let cls = 'bg-surface-700 text-surface-400 border-surface-600';
  if (score >= 80) cls = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  else if (score >= 65) cls = 'bg-blue-50 text-blue-700 border-blue-200';
  else if (score >= 50) cls = 'bg-amber-50 text-amber-700 border-amber-200';
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold border ${cls}`}>
      {score}
    </span>
  );
}


const AVATAR_COLORS = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500',
  'bg-amber-500', 'bg-rose-500', 'bg-cyan-500',
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function InstitutionAvatar({ name }: { name: string }) {
  return (
    <span
      className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-white text-[10px] font-semibold select-none ${avatarColor(name)}`}
    >
      {initials(name)}
    </span>
  );
}

function BrimBadge({ score, tier }: { score: number | null; tier: string | null }) {
  if (score == null) return <span className="text-surface-600 text-xs">—</span>;
  const colors: Record<string, string> = {
    A: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    B: 'bg-blue-50 text-blue-700 border-blue-200',
    C: 'bg-amber-50 text-amber-700 border-amber-200',
    D: 'bg-surface-700 text-surface-400 border-surface-600',
    F: 'bg-surface-800 text-surface-500 border-surface-700',
  };
  const cls = colors[tier ?? 'F'] ?? colors['F'];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {tier} <span className="font-normal opacity-70">{score}</span>
    </span>
  );
}

function RoaBadge({ roa }: { roa: number | null }) {
  if (roa == null) return <span className="text-surface-600 text-sm font-mono">—</span>;
  if (roa < 0)
    return <span className="text-sm font-mono text-red-600">{formatPercent(roa)}</span>;
  if (roa < 1)
    return <span className="text-sm font-mono text-amber-600">{formatPercent(roa)}</span>;
  return <span className="text-sm font-mono text-emerald-600">{formatPercent(roa)}</span>;
}

function charterColor(type: string | null): 'blue' | 'green' | 'purple' | 'gray' {
  if (!type) return 'gray';
  if (type.includes('commercial')) return 'blue';
  if (type.includes('credit_union')) return 'green';
  if (type.includes('savings')) return 'purple';
  return 'gray';
}

export function ExploreResultsTable({ institutions, total, isLoading }: ExploreResultsTableProps) {
  const store = useExploreStore();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const { brimMode } = store;

  const columns = brimMode ? BRIM_SORTABLE_COLUMNS : SORTABLE_COLUMNS;
  const totalPages = Math.ceil(total / store.perPage);

  function toggleSort(field: SortField) {
    if (store.sortBy === field) {
      store.setSort(field, store.sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      store.setSort(field, 'desc');
    }
  }

  function toggleSelect(certNumber: number, name: string) {
    const next = new Set(selected);
    if (next.has(certNumber)) {
      next.delete(certNumber);
      store.removeFromWorkingSet(certNumber);
    } else {
      next.add(certNumber);
      store.addToWorkingSet({ certNumber, name });
    }
    setSelected(next);
  }

  function SortIcon({ field }: { field: SortField }) {
    if (store.sortBy !== field) return <ArrowUpDown className="h-3.5 w-3.5 text-surface-600" />;
    return store.sortDir === 'asc'
      ? <ArrowUp className="h-3.5 w-3.5 text-primary-400" />
      : <ArrowDown className="h-3.5 w-3.5 text-primary-400" />;
  }

  if (!isLoading && institutions.length === 0) {
    return (
      <div className="rounded-xl border border-surface-700/50 bg-surface-800/60 text-center py-16">
        <p className="text-surface-400 text-sm">No institutions found. Try adjusting your filters.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl overflow-hidden border border-surface-700/50 bg-surface-800/40">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-surface-700/30">
            <thead className="bg-surface-800/60">
              <tr>
                <th scope="col" className="px-3 py-3 w-10" aria-hidden="true" />
                <th scope="col" className="px-3 py-3 w-8" aria-label="Select" />
                {columns.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className={`px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider cursor-pointer select-none hover:text-surface-300 transition-colors ${col.align === 'right' ? 'text-right' : 'text-left'} ${col.hideMobile ? 'hidden sm:table-cell' : ''}`}
                    onClick={() => toggleSort(col.key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      <SortIcon field={col.key} />
                    </span>
                  </th>
                ))}
                <th scope="col" className="px-3 py-3 w-10" aria-label="Watchlist" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-700/20">
              {institutions.map((inst, idx) => {
                const displayName = inst.name || inst.holding_company || `Cert #${inst.cert_number}`;
                const isSelected = selected.has(inst.cert_number);
                const isMigration = brimMode && isMigrationTarget(inst.agent_bank_program);
                const rowBg = isSelected
                  ? 'bg-primary-500/10'
                  : isMigration
                  ? 'bg-amber-50/50'
                  : idx % 2 === 1
                  ? 'bg-slate-50/50'
                  : '';
                return (
                  <tr
                    key={inst.id}
                    className={`hover:bg-surface-700/30 transition-colors ${rowBg}`}
                  >
                    {/* Avatar */}
                    <td className="px-3 py-3 w-10">
                      <InstitutionAvatar name={displayName} />
                    </td>
                    {/* Checkbox */}
                    <td className="px-3 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(inst.cert_number, displayName)}
                        className="h-3.5 w-3.5 rounded border-surface-600 bg-surface-800 text-primary-500 focus:ring-primary-500 focus:ring-offset-0"
                      />
                    </td>

                    {brimMode ? (
                      <>
                        {/* Name (Brim mode) */}
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${inst.active ? 'bg-emerald-500' : 'bg-surface-600'}`}
                                title={inst.active ? 'Active' : 'Inactive'}
                              />
                              <Link
                                to={`/institution/${inst.cert_number}`}
                                className="text-sm font-medium text-primary-400 hover:text-primary-300 hover:underline"
                              >
                                {displayName}
                              </Link>
                              {inst.state && (
                                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-surface-700 text-surface-400 ring-1 ring-inset ring-surface-600/50">
                                  {inst.state}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 flex-wrap">
                              <BrimOpportunityBadges institution={inst} />
                              {inst.agent_bank_program && (
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${isMigration ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-surface-700 text-surface-400 border-surface-600'}`}>
                                  {inst.agent_bank_program}
                                </span>
                              )}
                              {inst.core_processor && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border bg-surface-800 text-surface-500 border-surface-700">
                                  {inst.core_processor}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        {/* Brim Score */}
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <BrimScoreBadge score={inst.brim_score ?? null} />
                        </td>
                        {/* Assets */}
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-surface-200 text-right font-mono">
                          {formatCurrency(inst.total_assets)}
                        </td>
                        {/* ROA */}
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <RoaBadge roa={inst.roa} />
                        </td>
                        {/* Card Portfolio */}
                        <td className="hidden sm:table-cell px-4 py-3 whitespace-nowrap text-sm text-surface-300 text-right font-mono">
                          {formatCurrency(inst.card_portfolio_size ?? inst.credit_card_loans)}
                        </td>
                      </>
                    ) : (
                      <>
                        {/* Name */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${inst.active ? 'bg-emerald-500' : 'bg-surface-600'}`}
                              title={inst.active ? 'Active' : 'Inactive'}
                            />
                            <Link
                              to={`/institution/${inst.cert_number}`}
                              className="text-sm font-medium text-primary-400 hover:text-primary-300 hover:underline"
                            >
                              {displayName}
                            </Link>
                            {inst.charter_type && (
                              <Badge color={charterColor(inst.charter_type)} className="ml-0.5 align-middle hidden sm:inline-flex">
                                {inst.charter_type.replace(/_/g, ' ')}
                              </Badge>
                            )}
                          </div>
                        </td>
                        {/* State */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {inst.state ? (
                            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-surface-700 text-surface-400 ring-1 ring-inset ring-surface-600/50">
                              {inst.state}
                            </span>
                          ) : (
                            <span className="text-surface-600 text-sm">—</span>
                          )}
                        </td>
                        {/* Assets */}
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-surface-200 text-right font-mono">
                          {formatCurrency(inst.total_assets)}
                        </td>
                        {/* Deposits */}
                        <td className="hidden sm:table-cell px-4 py-3 whitespace-nowrap text-sm text-surface-200 text-right font-mono">
                          {formatCurrency(inst.total_deposits)}
                        </td>
                        {/* ROA */}
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <RoaBadge roa={inst.roa} />
                        </td>
                        {/* ROE */}
                        <td className={`hidden sm:table-cell px-4 py-3 whitespace-nowrap text-sm text-right font-mono ${inst.roi != null && inst.roi < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {formatPercent(inst.roi)}
                        </td>
                        {/* Brim */}
                        <td className="hidden sm:table-cell px-4 py-3 whitespace-nowrap text-right">
                          <BrimBadge score={inst.brim_score ?? null} tier={inst.brim_tier ?? null} />
                        </td>
                      </>
                    )}

                    {/* Watchlist */}
                    <td className="px-3 py-3 w-10">
                      <WatchlistButton certNumber={inst.cert_number} size="sm" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-surface-500">
            Page <span className="font-mono text-surface-300">{store.page}</span> of <span className="font-mono text-surface-300">{formatNumber(totalPages)}</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={store.page <= 1}
              onClick={() => store.setPage(store.page - 1)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-surface-700 text-sm text-surface-400 hover:text-surface-200 hover:bg-surface-800 disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </button>
            <button
              type="button"
              disabled={store.page >= totalPages}
              onClick={() => store.setPage(store.page + 1)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-surface-700 text-sm text-surface-400 hover:text-surface-200 hover:bg-surface-800 disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
