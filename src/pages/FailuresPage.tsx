import { useState, useMemo } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Building2, DollarSign, Calendar, Search } from 'lucide-react';
import { Card, Skeleton, Badge, Input } from '@/components/ui';
import { formatCurrency, formatNumber, formatDate } from '@/lib/format';

interface BankFailure {
  cert_number: number;
  name: string;
  fail_date: string;
  resolution_type: string;
  estimated_loss: number | null;
  charter_class: string | null;
}

interface FailuresResponse {
  failures: BankFailure[];
  total: number;
}

type YearFilter = 'all' | '2020s' | '2010s' | 'crisis' | '2000s';

const YEAR_FILTERS: { id: YearFilter; label: string; min: number; max: number }[] = [
  { id: 'all',    label: 'All',             min: 2000, max: 9999 },
  { id: '2020s',  label: '2020s',           min: 2020, max: 9999 },
  { id: '2010s',  label: '2010s',           min: 2010, max: 2019 },
  { id: 'crisis', label: '2008–2010 Crisis', min: 2008, max: 2010 },
  { id: '2000s',  label: '2000s',           min: 2000, max: 2007 },
];

function resolutionColor(type: string): 'red' | 'yellow' | 'blue' | 'gray' {
  const t = type.toLowerCase();
  if (t.includes('payoff')) return 'red';
  if (t.includes('purchase') || t.includes('assumption') || t.includes('p&a')) return 'yellow';
  if (t.includes('assisted') || t.includes('merger')) return 'blue';
  return 'gray';
}

function failYear(failDate: string): number {
  return parseInt(failDate.slice(0, 4), 10);
}

async function fetchFailures(): Promise<FailuresResponse> {
  const res = await fetch('/api/analytics/failures?year_min=2000&limit=500');
  if (!res.ok) throw new Error('Failed to load bank failures data');
  return res.json();
}

export default function FailuresPage() {
  const [yearFilter, setYearFilter] = useState<YearFilter>('all');
  const [search, setSearch] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['bank-failures'],
    queryFn: fetchFailures,
    staleTime: 60 * 60 * 1000, // 1 hour
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const filter = YEAR_FILTERS.find((f) => f.id === yearFilter)!;
    return data.failures.filter((f) => {
      const year = failYear(f.fail_date);
      if (year < filter.min || year > filter.max) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!f.name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [data, yearFilter, search]);

  const totalLoss = useMemo(
    () => filtered.reduce((sum, f) => sum + (f.estimated_loss ?? 0), 0),
    [filtered],
  );

  const mostRecent = data?.failures[0] ?? null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-surface-100">FDIC Bank Failures</h1>
        <p className="mt-1 text-sm text-surface-500">
          Warehouse-backed record of FDIC-supervised institution failures since 2000, sourced from the FDIC Failures API.
        </p>
      </div>

      {/* Notable callout */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-900">
          <strong>The 2008–2009 financial crisis</strong> resulted in 465 bank failures with{' '}
          <strong>$90B+ in estimated losses</strong> to the FDIC deposit insurance fund — the largest wave
          of bank failures since the S&amp;L crisis of the 1980s.
        </p>
      </div>

      {/* Stat strip */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-red-50 shrink-0">
                <Building2 className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-surface-500">Total Failures (Filtered)</p>
                <p className="text-xl font-bold text-surface-100">{formatNumber(filtered.length)}</p>
                <p className="text-xs text-surface-500">of {formatNumber(data.total)} total since 2000</p>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-orange-50 shrink-0">
                <DollarSign className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-surface-500">Estimated Losses (Filtered)</p>
                <p className="text-xl font-bold text-surface-100">{formatCurrency(totalLoss)}</p>
                <p className="text-xs text-surface-500">to FDIC deposit insurance fund</p>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-surface-900 shrink-0">
                <Calendar className="h-5 w-5 text-surface-500" />
              </div>
              <div>
                <p className="text-xs text-surface-500">Most Recent Failure</p>
                <p className="text-base font-bold text-surface-100 truncate max-w-[160px]">
                  {mostRecent ? mostRecent.name : '—'}
                </p>
                <p className="text-xs text-surface-500">
                  {mostRecent ? formatDate(mostRecent.fail_date) : ''}
                </p>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        {/* Year filter buttons */}
        <div className="flex flex-wrap gap-1.5">
          {YEAR_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setYearFilter(f.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border ${
                yearFilter === f.id
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-surface-400 border-surface-600 hover:border-surface-500 hover:text-surface-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-surface-500 pointer-events-none" />
          <Input
            type="search"
            placeholder="Filter by bank name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <p className="text-sm text-red-600 text-center py-8">
            Failed to load bank failures data. Please try again later.
          </p>
        </Card>
      ) : (
        <Card padding={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-700 bg-surface-900">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wide">
                    Institution Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wide">
                    Fail Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wide">
                    Resolution Type
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wide">
                    Estimated Loss
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wide">
                    Charter Class
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-sm text-surface-500">
                      No failures found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((f) => (
                    <tr key={`${f.cert_number}-${f.fail_date}`} className="hover:bg-surface-900 transition-colors">
                      <td className="px-4 py-3 font-medium text-surface-100">
                        <Link
                          to={`/institution/${f.cert_number}`}
                          className="text-primary-600 hover:text-primary-700 hover:underline"
                        >
                          {f.name}
                        </Link>
                        <span className="ml-2 text-xs text-surface-500">#{f.cert_number}</span>
                      </td>
                      <td className="px-4 py-3 text-surface-400 whitespace-nowrap">
                        {formatDate(f.fail_date)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge color={resolutionColor(f.resolution_type)}>
                          {f.resolution_type || '—'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-surface-100">
                        {f.estimated_loss != null ? formatCurrency(f.estimated_loss) : '—'}
                      </td>
                      <td className="px-4 py-3 text-surface-400">
                        {f.charter_class ?? '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-surface-800 bg-surface-900 flex items-center justify-between">
            <p className="text-xs text-surface-500">
              Showing {formatNumber(filtered.length)} failures · Source: FDIC BankFind Suite
            </p>
            <a
              href="https://banks.data.fdic.gov/api/failures"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary-600 hover:text-primary-700 hover:underline"
            >
              View raw FDIC API
            </a>
          </div>
        </Card>
      )}
    </div>
  );
}
