import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface RatesData {
  overnight_rate: number | null;
  prime_rate: number | null;
  mortgage_5yr: number | null;
  cad_usd: number | null;
  as_of: string;
  prev: {
    overnight_rate: number | null;
    prime_rate: number | null;
    mortgage_5yr: number | null;
    cad_usd: number | null;
    as_of: string;
  } | null;
}

async function fetchRates(): Promise<RatesData> {
  const res = await fetch('/api/analytics/rates');
  if (!res.ok) throw new Error('Failed to load rates');
  return res.json();
}

type Direction = 'up' | 'down' | 'flat';

function direction(current: number | null, prev: number | null): Direction {
  if (current === null || prev === null) return 'flat';
  if (current > prev) return 'up';
  if (current < prev) return 'down';
  return 'flat';
}

function DirectionIcon({ dir }: { dir: Direction }) {
  if (dir === 'up')
    return <TrendingUp className="w-3.5 h-3.5 text-red-500 shrink-0" aria-label="increased" />;
  if (dir === 'down')
    return <TrendingDown className="w-3.5 h-3.5 text-green-500 shrink-0" aria-label="decreased" />;
  return <Minus className="w-3.5 h-3.5 text-surface-400 shrink-0" aria-label="unchanged" />;
}

interface RateItemProps {
  label: string;
  value: number | null;
  prevValue: number | null;
  decimals?: number;
  suffix?: string;
}

function RateItem({ label, value, prevValue, decimals = 2, suffix = '%' }: RateItemProps) {
  const dir = direction(value, prevValue);
  const formatted =
    value !== null ? `${value.toFixed(decimals)}${suffix}` : '—';

  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-xs text-surface-500 font-medium">{label}:</span>
      <span className="text-xs font-semibold text-surface-900">{formatted}</span>
      <DirectionIcon dir={dir} />
    </div>
  );
}

export function RatesStrip() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['boc-rates'],
    queryFn: fetchRates,
    staleTime: 60 * 60 * 1000, // 1 hour
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="w-full bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 animate-pulse">
        <div className="h-4 bg-blue-100 rounded w-2/3" />
      </div>
    );
  }

  if (isError || !data) {
    return null;
  }

  return (
    <div className="w-full bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
        {/* Bank icon + label */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-base" role="img" aria-label="bank">🏦</span>
          <span className="text-xs font-semibold text-blue-800 uppercase tracking-wide">
            Bank of Canada
          </span>
        </div>

        {/* Divider */}
        <div className="hidden sm:block h-4 w-px bg-blue-200" />

        {/* Rate items */}
        <RateItem
          label="Overnight"
          value={data.overnight_rate}
          prevValue={data.prev?.overnight_rate ?? null}
        />
        <RateItem
          label="Prime"
          value={data.prime_rate}
          prevValue={data.prev?.prime_rate ?? null}
        />
        <RateItem
          label="5yr Mortgage"
          value={data.mortgage_5yr}
          prevValue={data.prev?.mortgage_5yr ?? null}
        />
        <RateItem
          label="CAD/USD"
          value={data.cad_usd}
          prevValue={data.prev?.cad_usd ?? null}
          decimals={4}
          suffix=""
        />

        {/* Spacer + attribution */}
        <div className="ml-auto flex items-center gap-1 text-xs text-blue-500">
          <span>Updated hourly</span>
          {data.as_of && (
            <span className="hidden sm:inline text-blue-400">· {data.as_of}</span>
          )}
        </div>
      </div>
    </div>
  );
}
