import { useState, useCallback, useRef, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { X, Plus, Search, ArrowUpRight } from 'lucide-react';
import { Card, Skeleton, Badge } from '@/components/ui';
import { formatCurrency, formatPercent, formatNumber, formatDate } from '@/lib/format';
import type { Institution } from '@/types/institution';

interface InstitutionDetail {
  institution: Institution;
}

async function fetchInstitution(cert: string): Promise<InstitutionDetail> {
  const res = await fetch(`/api/institutions/${cert}`);
  if (!res.ok) throw new Error('Not found');
  return res.json();
}

async function searchInstitutions(q: string): Promise<{ institutions: Institution[] }> {
  const res = await fetch(`/api/institutions/search?q=${encodeURIComponent(q)}&per_page=8`);
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}

function charterBadgeColor(charter: string | null): 'blue' | 'green' | 'purple' | 'gray' {
  if (!charter) return 'gray';
  if (charter === 'commercial') return 'blue';
  if (charter === 'credit_union') return 'green';
  if (charter.includes('savings')) return 'purple';
  return 'gray';
}

function charterLabel(charter: string | null): string {
  if (!charter) return 'Unknown';
  return charter.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Single cert fetcher hook ─────────────────────────────────────────────────
function useInstitution(cert: string | null) {
  return useQuery({
    queryKey: ['institution', cert],
    queryFn: () => fetchInstitution(cert!),
    enabled: !!cert,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Metric definitions ───────────────────────────────────────────────────────
type MetricDirection = 'higher' | 'lower' | 'none';

interface MetricDef {
  label: string;
  getValue: (inst: Institution) => number | null;
  format: (v: number | null, inst: Institution) => string;
  direction: MetricDirection;
  isText?: boolean;
  getText?: (inst: Institution) => string;
}

const METRICS: MetricDef[] = [
  {
    label: 'Total Assets',
    getValue: i => i.total_assets,
    format: v => formatCurrency(v),
    direction: 'higher',
  },
  {
    label: 'Total Deposits',
    getValue: i => i.total_deposits,
    format: v => formatCurrency(v),
    direction: 'higher',
  },
  {
    label: 'Total Loans',
    getValue: i => i.total_loans,
    format: v => formatCurrency(v),
    direction: 'higher',
  },
  {
    label: 'Net Income',
    getValue: i => i.net_income,
    format: v => formatCurrency(v),
    direction: 'higher',
  },
  {
    label: 'ROA',
    getValue: i => i.roa,
    format: v => formatPercent(v),
    direction: 'higher',
  },
  {
    label: 'ROE',
    getValue: i => i.roi,
    format: v => formatPercent(v),
    direction: 'higher',
  },
  {
    label: 'Equity Ratio',
    getValue: i =>
      i.equity_capital != null && i.total_assets != null && i.total_assets > 0
        ? (i.equity_capital / i.total_assets) * 100
        : null,
    format: v => formatPercent(v),
    direction: 'higher',
  },
  {
    label: 'Loan-to-Deposit',
    getValue: i =>
      i.total_loans != null && i.total_deposits != null && i.total_deposits > 0
        ? (i.total_loans / i.total_deposits) * 100
        : null,
    format: v => formatPercent(v),
    direction: 'lower',
  },
  {
    label: 'Credit Card Loans',
    getValue: i => i.credit_card_loans,
    format: v => (v == null ? '—' : formatCurrency(v)),
    direction: 'higher',
  },
  {
    label: 'Branches',
    getValue: i => i.num_branches,
    format: v => formatNumber(v),
    direction: 'none',
  },
  {
    label: 'Employees',
    getValue: i => i.num_employees,
    format: v => formatNumber(v),
    direction: 'none',
  },
  {
    label: 'Charter Type',
    getValue: () => null,
    format: () => '',
    direction: 'none',
    isText: true,
    getText: i => charterLabel(i.charter_type),
  },
  {
    label: 'Regulator',
    getValue: () => null,
    format: () => '',
    direction: 'none',
    isText: true,
    getText: i => i.regulator ?? '—',
  },
  {
    label: 'State',
    getValue: () => null,
    format: () => '',
    direction: 'none',
    isText: true,
    getText: i => i.state ?? '—',
  },
  {
    label: 'Established',
    getValue: () => null,
    format: () => '',
    direction: 'none',
    isText: true,
    getText: i => formatDate(i.established_date),
  },
];

// ─── Search dropdown ──────────────────────────────────────────────────────────
interface SearchDropdownProps {
  onAdd: (inst: Institution) => void;
  existingCerts: string[];
  disabled: boolean;
}

function SearchDropdown({ onAdd, existingCerts, disabled }: SearchDropdownProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { data, isFetching } = useQuery({
    queryKey: ['compare-search', query],
    queryFn: () => searchInstitutions(query),
    enabled: query.trim().length >= 2,
    staleTime: 30 * 1000,
  });

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const results = data?.institutions ?? [];

  return (
    <div ref={wrapperRef} className="relative w-full max-w-sm">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-500 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search institutions to add…"
          disabled={disabled}
          className="block w-full rounded-lg border border-surface-600 bg-white pl-9 pr-3.5 py-2 text-sm text-surface-100 placeholder:text-surface-500 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 focus:outline-none disabled:opacity-50"
        />
        {isFetching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
        )}
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-surface-700 rounded-xl shadow-lg overflow-hidden">
          {results.length === 0 && !isFetching ? (
            <div className="px-4 py-3 text-sm text-surface-500">No results found.</div>
          ) : (
            <ul className="max-h-64 overflow-auto divide-y divide-surface-800">
              {results.map(inst => {
                const cert = String(inst.cert_number);
                const already = existingCerts.includes(cert);
                return (
                  <li key={cert}>
                    <button
                      onClick={() => {
                        if (!already) {
                          onAdd(inst);
                          setQuery('');
                          setOpen(false);
                        }
                      }}
                      disabled={already}
                      className="w-full text-left px-4 py-2.5 hover:bg-surface-900 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <p className="text-sm font-medium text-surface-100 truncate">{inst.name}</p>
                      <p className="text-xs text-surface-500">
                        {inst.city ? `${inst.city}, ` : ''}{inst.state ?? ''} · {charterLabel(inst.charter_type)}
                        {already ? ' · Already added' : ''}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Column header ────────────────────────────────────────────────────────────
interface ColumnHeaderProps {
  cert: string;
  onRemove: () => void;
}

function ColumnHeader({ cert, onRemove }: ColumnHeaderProps) {
  const { data, isLoading } = useInstitution(cert);

  if (isLoading) {
    return (
      <div className="min-w-[180px] p-3 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-5 w-16" />
      </div>
    );
  }

  if (!data) return null;
  const inst = data.institution;

  return (
    <div className="min-w-[180px] p-3 relative group">
      <button
        onClick={onRemove}
        className="absolute top-2 right-2 p-1 rounded-md text-surface-500 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
        aria-label={`Remove ${inst.name}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <Link
        to={`/institution/${inst.cert_number}`}
        className="group/link flex items-start gap-1 mb-1"
      >
        <span className="text-sm font-semibold text-surface-100 leading-snug hover:text-primary-600 transition-colors pr-5">
          {inst.name}
        </span>
        <ArrowUpRight className="h-3.5 w-3.5 text-surface-500 group-hover/link:text-primary-500 shrink-0 mt-0.5 transition-colors" />
      </Link>
      <p className="text-xs text-surface-500 mb-2">
        {inst.city ? `${inst.city}, ` : ''}{inst.state ?? ''}
      </p>
      <Badge color={charterBadgeColor(inst.charter_type)}>
        {charterLabel(inst.charter_type)}
      </Badge>
    </div>
  );
}

// ─── Single data cell ─────────────────────────────────────────────────────────
interface DataCellProps {
  cert: string;
  metric: MetricDef;
  highlight: 'best' | 'worst' | 'none';
}

function DataCell({ cert, metric, highlight }: DataCellProps) {
  const { data, isLoading } = useInstitution(cert);

  if (isLoading) {
    return (
      <td className="px-3 py-2.5 border-b border-surface-800">
        <Skeleton className="h-4 w-24" />
      </td>
    );
  }

  if (!data) {
    return (
      <td className="px-3 py-2.5 border-b border-surface-800 text-sm text-surface-500">—</td>
    );
  }

  const inst = data.institution;
  let display: string;

  if (metric.isText && metric.getText) {
    display = metric.getText(inst);
  } else {
    const val = metric.getValue(inst);
    display = metric.format(val, inst);
  }

  const hlClass =
    highlight === 'best'
      ? 'bg-green-50 text-green-800 font-medium'
      : highlight === 'worst'
      ? 'bg-red-50 text-red-700'
      : '';

  return (
    <td className={`px-3 py-2.5 border-b border-surface-800 text-sm whitespace-nowrap ${hlClass}`}>
      {display}
    </td>
  );
}

// ─── Highlight calculator ─────────────────────────────────────────────────────
function computeHighlights(
  metric: MetricDef,
  certs: string[],
  institutionMap: Record<string, Institution>
): Record<string, 'best' | 'worst' | 'none'> {
  const result: Record<string, 'best' | 'worst' | 'none'> = {};

  if (metric.direction === 'none' || metric.isText) {
    for (const c of certs) result[c] = 'none';
    return result;
  }

  const vals: { cert: string; v: number }[] = [];
  for (const c of certs) {
    const inst = institutionMap[c];
    if (!inst) continue;
    const v = metric.getValue(inst);
    if (v != null) vals.push({ cert: c, v });
  }

  if (vals.length < 2) {
    for (const c of certs) result[c] = 'none';
    return result;
  }

  const sorted = [...vals].sort((a, b) =>
    metric.direction === 'higher' ? b.v - a.v : a.v - b.v
  );
  const bestVal = sorted[0].v;
  const worstVal = sorted[sorted.length - 1].v;

  for (const { cert, v } of vals) {
    if (v === bestVal && v !== worstVal) result[cert] = 'best';
    else if (v === worstVal && v !== bestVal) result[cert] = 'worst';
    else result[cert] = 'none';
  }

  // Fill in certs without data
  for (const c of certs) {
    if (!(c in result)) result[c] = 'none';
  }

  return result;
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ComparePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const certsParam = searchParams.get('certs') ?? '';
  const certList = certsParam
    ? certsParam.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  // Fetch all institutions to build highlight map
  const queries = certList.map(c => ({
    queryKey: ['institution', c],
    queryFn: () => fetchInstitution(c),
    enabled: true,
    staleTime: 5 * 60 * 1000,
  }));

  // We can't conditionally call hooks, so we use a helper pattern — build the
  // institution map from the individual column queries by lifting data out.
  // Each ColumnHeader / DataCell already fetches its own data from cache, so
  // we just need a parallel fetch here to build the highlight map.
  const inst1 = useInstitution(certList[0] ?? null);
  const inst2 = useInstitution(certList[1] ?? null);
  const inst3 = useInstitution(certList[2] ?? null);
  const inst4 = useInstitution(certList[3] ?? null);
  const inst5 = useInstitution(certList[4] ?? null);

  const instResults = [inst1, inst2, inst3, inst4, inst5];

  const institutionMap: Record<string, Institution> = {};
  certList.forEach((c, i) => {
    const d = instResults[i]?.data;
    if (d) institutionMap[c] = d.institution;
  });

  // Suppress unused variable warning from the queries array
  void queries;

  const setCerts = useCallback(
    (certs: string[]) => {
      if (certs.length === 0) {
        setSearchParams({});
      } else {
        setSearchParams({ certs: certs.join(',') });
      }
    },
    [setSearchParams]
  );

  const handleAdd = useCallback(
    (inst: Institution) => {
      const c = String(inst.cert_number);
      if (!certList.includes(c) && certList.length < 5) {
        setCerts([...certList, c]);
      }
    },
    [certList, setCerts]
  );

  const handleRemove = useCallback(
    (cert: string) => {
      setCerts(certList.filter(c => c !== cert));
    },
    [certList, setCerts]
  );

  const atMax = certList.length >= 5;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-surface-100">Compare Institutions</h1>
        <p className="text-sm text-surface-500 mt-1">
          Compare up to 5 banks or credit unions side by side.
        </p>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <SearchDropdown
          onAdd={handleAdd}
          existingCerts={certList}
          disabled={atMax}
        />
        {atMax && (
          <p className="text-xs text-surface-500">Maximum 5 institutions reached.</p>
        )}
        {certList.length > 0 && (
          <button
            onClick={() => setCerts([])}
            className="text-xs text-surface-500 hover:text-red-500 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Empty state */}
      {certList.length === 0 && (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-primary-50">
              <Plus className="h-7 w-7 text-primary-500" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-surface-200">
                Add institutions to compare
              </p>
              <p className="text-sm text-surface-500 mt-1 max-w-xs">
                Use the search box above to find banks or credit unions and add them here.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Comparison table */}
      {certList.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-surface-700 shadow-sm">
          <table className="w-full border-collapse bg-white">
            <thead>
              <tr className="border-b border-surface-700 bg-surface-900">
                {/* Metric label column */}
                <th className="w-44 px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wide border-r border-surface-700">
                  Metric
                </th>
                {certList.map(cert => (
                  <th key={cert} className="border-r border-surface-800 last:border-r-0">
                    <ColumnHeader cert={cert} onRemove={() => handleRemove(cert)} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICS.map((metric, mi) => {
                const highlights = computeHighlights(metric, certList, institutionMap);
                const isEven = mi % 2 === 0;

                return (
                  <tr
                    key={metric.label}
                    className={isEven ? 'bg-white' : 'bg-surface-900/50'}
                  >
                    <td className="px-4 py-2.5 text-xs font-medium text-surface-400 border-b border-surface-800 border-r border-surface-700 whitespace-nowrap">
                      {metric.label}
                    </td>
                    {certList.map(cert => (
                      <DataCell
                        key={cert}
                        cert={cert}
                        metric={metric}
                        highlight={highlights[cert] ?? 'none'}
                      />
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      {certList.length > 1 && (
        <div className="flex items-center gap-4 text-xs text-surface-500">
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm bg-green-100 border border-green-300" />
            Best value
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm bg-red-100 border border-red-300" />
            Worst value
          </div>
        </div>
      )}
    </div>
  );
}
