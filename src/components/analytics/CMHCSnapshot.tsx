import { useQuery } from '@tanstack/react-query';
import { Home, DollarSign, AlertTriangle, Info } from 'lucide-react';
import { Card } from '@/components/ui';

interface CMHCData {
  housing_starts_annualized: number;
  avg_home_price: number;
  mortgage_arrears_rate: number;
  reference_period: string;
  source: string;
  note?: string;
  api_error?: string;
}

async function fetchCMHC(): Promise<CMHCData> {
  const res = await fetch('/api/analytics/cmhc');
  if (!res.ok) throw new Error('Failed to load CMHC data');
  return res.json();
}

function formatStarts(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

function formatPrice(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

interface CMHCSnapshotProps {
  /** Only render when Canadian institutions are present in the dataset */
  showForCanadian?: boolean;
}

export function CMHCSnapshot({ showForCanadian = true }: CMHCSnapshotProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['cmhc-snapshot'],
    queryFn: fetchCMHC,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });

  if (!showForCanadian) return null;

  const isSeeded =
    data?.source === 'cmhc_seeded' || data?.source === 'cmhc_live_hmi_seeded_metrics';

  const metrics = data
    ? [
        {
          label: 'Housing Starts (annualized)',
          value: formatStarts(data.housing_starts_annualized),
          icon: Home,
          color: 'text-blue-600',
          bg: 'bg-blue-50',
          description: 'New residential units started nationally',
        },
        {
          label: 'Avg Home Price',
          value: formatPrice(data.avg_home_price),
          icon: DollarSign,
          color: 'text-green-600',
          bg: 'bg-green-50',
          description: 'National average across all property types',
        },
        {
          label: 'Mortgage Arrears',
          value: `${data.mortgage_arrears_rate.toFixed(2)}%`,
          icon: AlertTriangle,
          color: 'text-amber-600',
          bg: 'bg-amber-50',
          description: 'Share of mortgages 90+ days past due',
        },
      ]
    : [];

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-surface-900">Canadian Market Context</h2>
          <p className="text-xs text-surface-500 mt-0.5">
            CMHC housing metrics relevant to Canadian institutions&apos; mortgage books
          </p>
        </div>
        {data && (
          <span className="text-xs text-surface-400 shrink-0">
            CMHC · {data.reference_period}
            {isSeeded && ' · est.'}
          </span>
        )}
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-surface-100 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <div className="bg-surface-50 border border-surface-200 rounded-xl p-4 flex items-center gap-2 text-sm text-surface-500">
          <Info className="w-4 h-4 shrink-0" />
          CMHC data unavailable. Check back later.
        </div>
      )}

      {!isLoading && !isError && data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {metrics.map(m => {
              const Icon = m.icon;
              return (
                <Card key={m.label}>
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex items-center justify-center h-10 w-10 rounded-xl ${m.bg} shrink-0`}
                    >
                      <Icon className={`h-5 w-5 ${m.color}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-surface-500 leading-tight">{m.label}</p>
                      <p className="text-xl font-bold text-surface-900 mt-0.5">{m.value}</p>
                      <p className="text-xs text-surface-400 mt-0.5 leading-tight">
                        {m.description}
                      </p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Seeded data notice */}
          {isSeeded && data.note && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs text-amber-700">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{data.note}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
