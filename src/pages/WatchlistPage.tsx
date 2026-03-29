import { useState } from 'react';
import { Link } from 'react-router';
import { Star, Trash2, ExternalLink } from 'lucide-react';
import { useWatchlist } from '@/hooks/useWatchlist';
import { getSupabaseBrowser } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import type { Institution } from '@/types/institution';

async function fetchWatchlistInstitutions(certs: number[]): Promise<Institution[]> {
  if (certs.length === 0) return [];
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from('institutions')
    .select('*')
    .in('cert_number', certs);
  if (error) throw new Error(error.message);
  return (data as Institution[]) ?? [];
}

function charterColor(type: string | null): 'blue' | 'green' | 'purple' | 'gray' {
  if (!type) return 'gray';
  if (type.includes('commercial')) return 'blue';
  if (type.includes('credit_union')) return 'green';
  if (type.includes('savings')) return 'purple';
  return 'gray';
}

export default function WatchlistPage() {
  const { watchlist, remove, clear } = useWatchlist();
  const [selected, setSelected] = useState<number[]>([]);

  const { data: institutions, isLoading } = useQuery({
    queryKey: ['watchlist-institutions', watchlist],
    queryFn: () => fetchWatchlistInstitutions(watchlist),
    enabled: watchlist.length > 0,
  });

  function toggleSelect(cert: number) {
    setSelected((prev) =>
      prev.includes(cert) ? prev.filter((c) => c !== cert) : [...prev, cert],
    );
  }

  const compareUrl = `/compare?certs=${selected.join(',')}`;
  const canCompare = selected.length >= 2 && selected.length <= 5;

  if (watchlist.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <Star className="h-12 w-12 text-surface-300 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-surface-900 mb-2">Your Watchlist is Empty</h1>
        <p className="text-surface-500 max-w-md mx-auto mb-8">
          No institutions in your watchlist yet. Star any institution to add it here.
        </p>
        <Link to="/search">
          <Button size="lg">Browse Institutions</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-surface-900">
          Watchlist{' '}
          <span className="inline-flex items-center justify-center rounded-full bg-primary-100 text-primary-700 text-sm font-medium px-2.5 py-0.5 ml-1">
            {watchlist.length}
          </span>
        </h1>
        <div className="flex items-center gap-3">
          {canCompare && (
            <Link to={compareUrl}>
              <Button variant="secondary" size="sm">
                Compare Selected ({selected.length})
              </Button>
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              if (confirm('Clear all institutions from your watchlist?')) {
                clear();
                setSelected([]);
              }
            }}
            className="text-sm text-red-500 hover:text-red-700 transition-colors"
          >
            Clear All
          </button>
        </div>
      </div>

      {selected.length > 0 && !canCompare && selected.length < 2 && (
        <p className="text-sm text-surface-500">Select 2–5 institutions to compare.</p>
      )}
      {selected.length > 5 && (
        <p className="text-sm text-amber-600">Select up to 5 institutions to compare.</p>
      )}

      <div className="overflow-x-auto border border-surface-200 rounded-lg">
        <table className="min-w-full divide-y divide-surface-200">
          <thead className="bg-surface-50">
            <tr>
              <th scope="col" className="px-4 py-3 w-10">
                <span className="sr-only">Select</span>
              </th>
              <th scope="col" className="px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider text-left">
                Institution
              </th>
              <th scope="col" className="px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider text-left">
                State
              </th>
              <th scope="col" className="px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider text-right">
                Total Assets
              </th>
              <th scope="col" className="hidden sm:table-cell px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider text-right">
                Total Deposits
              </th>
              <th scope="col" className="px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider text-right">
                ROA
              </th>
              <th scope="col" className="px-4 py-3 w-20 text-xs font-medium text-surface-500 uppercase tracking-wider text-center">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-surface-100">
            {isLoading
              ? watchlist.map((cert) => (
                  <tr key={cert}>
                    <td colSpan={7} className="px-4 py-3">
                      <div className="h-4 bg-surface-200 animate-pulse rounded w-full" />
                    </td>
                  </tr>
                ))
              : (institutions ?? []).map((inst, idx) => {
                  const displayName = inst.name || inst.holding_company || `Cert #${inst.cert_number}`;
                  const isSelected = selected.includes(inst.cert_number);
                  return (
                    <tr
                      key={inst.id}
                      className={`hover:bg-primary-50/40 transition-colors ${idx % 2 === 1 ? 'bg-surface-50/50' : ''} ${isSelected ? 'ring-1 ring-inset ring-primary-300' : ''}`}
                    >
                      <td className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(inst.cert_number)}
                          className="h-4 w-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                          aria-label={`Select ${displayName}`}
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2 flex-wrap">
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
                            <Badge color={charterColor(inst.charter_type)} className="hidden sm:inline-flex">
                              {inst.charter_type.replace(/_/g, ' ')}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {inst.state ? (
                          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-surface-100 text-surface-600 ring-1 ring-inset ring-surface-300/50">
                            {inst.state}
                          </span>
                        ) : (
                          <span className="text-surface-400 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-surface-900 text-right font-mono">
                        {formatCurrency(inst.total_assets)}
                      </td>
                      <td className="hidden sm:table-cell px-4 py-3 whitespace-nowrap text-sm text-surface-900 text-right font-mono">
                        {formatCurrency(inst.total_deposits)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        {inst.roa != null ? (
                          <span className={`text-sm font-mono ${inst.roa >= 1 ? 'text-green-700' : inst.roa >= 0 ? 'text-amber-600' : 'text-red-600'}`}>
                            {inst.roa.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-surface-400 text-sm font-mono">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Link
                            to={`/institution/${inst.cert_number}`}
                            title="View profile"
                            className="p-1 rounded text-surface-400 hover:text-primary-600 transition-colors"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => remove(inst.cert_number)}
                            title="Remove from watchlist"
                            className="p-1 rounded text-surface-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-surface-400">
        Watchlist is stored locally in your browser — no account needed.
      </p>
    </div>
  );
}
