import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { Badge, WatchlistButton } from '@/components/ui';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import type { Institution } from '@/types/institution';
import type { SortField } from '@/types/filters';

interface ResultsTableProps {
  institutions: Institution[];
  sortBy: SortField;
  sortDir: 'asc' | 'desc';
  onSort: (field: SortField) => void;
}

const COLUMNS: { key: SortField; label: string; align?: 'right'; hideMobile?: boolean }[] = [
  { key: 'name', label: 'Name' },
  { key: 'state', label: 'State' },
  { key: 'total_assets', label: 'Total Assets', align: 'right' },
  { key: 'total_deposits', label: 'Total Deposits', align: 'right', hideMobile: true },
  { key: 'num_branches', label: 'Branches', align: 'right', hideMobile: true },
  { key: 'roa', label: 'ROA', align: 'right' },
  { key: 'roi', label: 'ROE', align: 'right', hideMobile: true },
  { key: 'credit_card_loans', label: 'Brim', align: 'right' },
];

function BrimBadge({ score, tier }: { score: number | null; tier: string | null }) {
  if (score == null) return <span className="text-content-tertiary text-xs">—</span>;
  const colors: Record<string, string> = {
    A: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    B: 'bg-blue-100 text-blue-800 border-blue-200',
    C: 'bg-amber-100 text-amber-700 border-amber-200',
    D: 'bg-surface-200 text-content-secondary border-surface-300',
    F: 'bg-surface-100 text-content-tertiary border-surface-200',
  };
  const cls = colors[tier ?? 'F'] ?? colors['F'];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {tier} <span className="font-normal opacity-70">{score}</span>
    </span>
  );
}

// Deterministic color for initials avatar based on name
const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-violet-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-indigo-500',
  'bg-teal-500',
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

function extractDomain(website: string | null): string | null {
  if (!website) return null;
  try {
    const url = website.startsWith('http') ? website : `https://${website}`;
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function InstitutionLogo({ institution }: { institution: Institution }) {
  const [imgFailed, setImgFailed] = useState(false);
  const domain = extractDomain(institution.website);
  const displayName = institution.name || institution.holding_company || '';
  const color = avatarColor(displayName);
  const abbr = initials(displayName || 'XX');

  if (domain && !imgFailed) {
    return (
      <img
        src={`https://logo.clearbit.com/${domain}`}
        alt={`${displayName} logo`}
        width={28}
        height={28}
        className="w-7 h-7 rounded-full object-contain border border-surface-100 bg-white shrink-0"
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <span
      className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-white text-[10px] font-semibold select-none ${color}`}
      aria-label={displayName}
    >
      {abbr}
    </span>
  );
}

function RoaBadge({ roa }: { roa: number | null }) {
  if (roa == null) return <span className="text-surface-400 text-sm font-mono">—</span>;

  if (roa < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-mono text-red-600">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
        {formatPercent(roa)}
      </span>
    );
  }
  if (roa < 1) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-mono text-amber-600">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
        {formatPercent(roa)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm font-mono text-green-700">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
      {formatPercent(roa)}
    </span>
  );
}

function charterColor(type: string | null): 'blue' | 'green' | 'purple' | 'gray' {
  if (!type) return 'gray';
  if (type.includes('commercial')) return 'blue';
  if (type.includes('credit_union')) return 'green';
  if (type.includes('savings')) return 'purple';
  return 'gray';
}

export function ResultsTable({ institutions, sortBy, sortDir, onSort }: ResultsTableProps) {
  function SortIcon({ field }: { field: SortField }) {
    if (sortBy !== field) return <ArrowUpDown className="h-3.5 w-3.5 text-surface-300" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 text-primary-600" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-primary-600" />
    );
  }

  if (institutions.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-surface-500 text-sm">No institutions found. Try adjusting your filters.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-surface-200 rounded-lg">
      <table className="min-w-full divide-y divide-surface-200">
        <thead className="bg-surface-50">
          <tr>
            {/* Logo column — not sortable */}
            <th scope="col" className="px-3 py-3 w-10" aria-hidden="true" />

            {COLUMNS.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider cursor-pointer select-none hover:text-surface-700 ${col.align === 'right' ? 'text-right' : 'text-left'} ${col.hideMobile ? 'hidden sm:table-cell' : ''}`}
                onClick={() => onSort(col.key)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  <SortIcon field={col.key} />
                </span>
              </th>
            ))}

            {/* Watchlist column */}
            <th scope="col" className="px-3 py-3 w-10" aria-label="Watchlist" />
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-surface-100">
          {institutions.map((inst, idx) => {
            const displayName = inst.name || inst.holding_company || `Cert #${inst.cert_number}`;
            return (
              <tr
                key={inst.id}
                className={`hover:bg-primary-50/40 transition-colors ${idx % 2 === 1 ? 'bg-surface-50/50' : ''}`}
              >
                {/* Logo */}
                <td className="px-3 py-3 w-10">
                  <InstitutionLogo institution={inst} />
                </td>

                {/* Name */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Active/inactive dot */}
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${inst.active ? 'bg-green-500' : 'bg-surface-300'}`}
                      title={inst.active ? 'Active' : 'Inactive'}
                    />
                    <Link
                      to={`/institution/${inst.cert_number}`}
                      className="text-sm font-medium text-primary-700 hover:text-primary-800 hover:underline"
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

                {/* State badge */}
                <td className="px-4 py-3 whitespace-nowrap">
                  {inst.state ? (
                    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-surface-100 text-surface-600 ring-1 ring-inset ring-surface-300/50">
                      {inst.state}
                    </span>
                  ) : (
                    <span className="text-surface-400 text-sm">—</span>
                  )}
                </td>

                {/* Total Assets */}
                <td className="px-4 py-3 whitespace-nowrap text-sm text-surface-900 text-right font-mono">
                  {formatCurrency(inst.total_assets)}
                </td>

                {/* Total Deposits — hidden on mobile */}
                <td className="hidden sm:table-cell px-4 py-3 whitespace-nowrap text-sm text-surface-900 text-right font-mono">
                  {formatCurrency(inst.total_deposits)}
                </td>

                {/* Branches — hidden on mobile */}
                <td className="hidden sm:table-cell px-4 py-3 whitespace-nowrap text-sm text-surface-600 text-right">
                  {formatNumber(inst.num_branches)}
                </td>

                {/* ROA with color coding */}
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <RoaBadge roa={inst.roa} />
                </td>

                {/* ROE — hidden on mobile */}
                <td
                  className={`hidden sm:table-cell px-4 py-3 whitespace-nowrap text-sm text-right font-mono ${
                    inst.roi != null && inst.roi < 0 ? 'text-red-600' : 'text-green-700'
                  }`}
                >
                  {formatPercent(inst.roi)}
                </td>

                {/* Brim score */}
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <BrimBadge score={(inst as any).brim_score ?? null} tier={(inst as any).brim_tier ?? null} />
                </td>

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
  );
}
