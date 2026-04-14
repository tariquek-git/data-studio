import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency, formatPercent } from '@/lib/format';

interface Institution {
  cert_number: number;
  name: string;
  state: string | null;
  charter_type: string | null;
  total_assets: number;
  roa: number;
  roi: number;
  size_bucket: string;
  bubble_r: number;
  num_branches: number | null;
}

interface Stats {
  median_roa: number;
  mean_roa: number;
  median_roi: number;
  mean_roi: number;
}

interface BubbleChartProps {
  institutions: Institution[];
  stats: Stats;
  highlightCert?: number;
}

const BUCKET_COLORS: Record<string, string> = {
  mega:      '#1e3a5f',
  large:     '#2563eb',
  regional:  '#0891b2',
  community: '#16a34a',
  small:     '#94a3b8',
};

const BUCKET_LABELS: Record<string, string> = {
  mega:      'Mega ($250B+)',
  large:     'Large ($10B–$250B)',
  regional:  'Regional ($1B–$10B)',
  community: 'Community ($100M–$1B)',
  small:     'Small (<$100M)',
};

function CustomDot(props: any) {
  const { cx, cy, payload, highlightCert } = props;
  const r = Math.max(4, Math.min(28, payload.bubble_r));
  const isHighlighted = payload.cert_number === highlightCert;
  const color = BUCKET_COLORS[payload.size_bucket] || '#64748b';

  return (
    <circle
      cx={cx}
      cy={cy}
      r={isHighlighted ? r + 4 : r}
      fill={color}
      fillOpacity={isHighlighted ? 0.95 : 0.55}
      stroke={isHighlighted ? '#f59e0b' : color}
      strokeWidth={isHighlighted ? 3 : 1}
      style={{ cursor: 'pointer' }}
    />
  );
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload as Institution;
  return (
    <div className="bg-white border border-surface-700 rounded-xl shadow-lg p-4 max-w-xs text-sm">
      <p className="font-semibold text-surface-100 mb-1">{d.name}</p>
      <p className="text-surface-500 text-xs mb-3">{d.state} · {d.charter_type?.replace(/_/g, ' ')}</p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        <span className="text-surface-500">Total Assets</span>
        <span className="text-right font-mono font-medium">{formatCurrency(d.total_assets)}</span>
        <span className="text-surface-500">ROA</span>
        <span className={`text-right font-mono font-medium ${d.roa >= 0 ? 'text-green-700' : 'text-red-600'}`}>
          {formatPercent(d.roa)}
        </span>
        <span className="text-surface-500">ROE</span>
        <span className={`text-right font-mono font-medium ${d.roi >= 0 ? 'text-green-700' : 'text-red-600'}`}>
          {formatPercent(d.roi)}
        </span>
        {d.num_branches != null && (
          <>
            <span className="text-surface-500">Branches</span>
            <span className="text-right font-mono">{d.num_branches}</span>
          </>
        )}
      </div>
      <p className="text-xs text-primary-600 mt-3">Click to view profile →</p>
    </div>
  );
}

export function BubbleChart({ institutions, stats, highlightCert }: BubbleChartProps) {
  const navigate = useNavigate();
  const handleClick = useCallback((data: any) => {
    if (data?.activePayload?.[0]?.payload?.cert_number) {
      navigate(`/institution/${data.activePayload[0].payload.cert_number}`);
    }
  }, [navigate]);

  const buckets = [...new Set(institutions.map(i => i.size_bucket))];

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {['mega', 'large', 'regional', 'community', 'small'].filter(b => buckets.includes(b)).map(bucket => (
          <div key={bucket} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: BUCKET_COLORS[bucket] }} />
            <span className="text-xs text-surface-400">{BUCKET_LABELS[bucket]}</span>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={520}>
        <ScatterChart
          margin={{ top: 20, right: 20, bottom: 40, left: 20 }}
          onClick={handleClick}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            type="number"
            dataKey="roa"
            name="ROA"
            domain={[-1.5, 4]}
            tickFormatter={v => `${v}%`}
            tick={{ fontSize: 11, fill: '#64748b' }}
            label={{ value: 'Return on Assets (ROA)', position: 'insideBottom', offset: -10, fontSize: 12, fill: '#64748b' }}
          />
          <YAxis
            type="number"
            dataKey="roi"
            name="ROE"
            domain={[-15, 35]}
            tickFormatter={v => `${v}%`}
            tick={{ fontSize: 11, fill: '#64748b' }}
            label={{ value: 'Return on Equity (ROE)', angle: -90, position: 'insideLeft', offset: 15, fontSize: 12, fill: '#64748b' }}
          />
          {/* Reference lines at industry median */}
          <ReferenceLine
            x={stats.median_roa}
            stroke="#e2e8f0"
            strokeDasharray="6 3"
            label={{ value: `Median ROA ${stats.median_roa.toFixed(2)}%`, position: 'top', fontSize: 10, fill: '#94a3b8' }}
          />
          <ReferenceLine
            y={stats.median_roi}
            stroke="#e2e8f0"
            strokeDasharray="6 3"
            label={{ value: `Median ROE ${stats.median_roi.toFixed(1)}%`, position: 'right', fontSize: 10, fill: '#94a3b8' }}
          />
          {/* Zero lines */}
          <ReferenceLine x={0} stroke="#fca5a5" strokeWidth={1} />
          <ReferenceLine y={0} stroke="#fca5a5" strokeWidth={1} />

          <Tooltip content={<CustomTooltip />} cursor={false} />
          <Scatter
            data={institutions}
            shape={(props: any) => <CustomDot {...props} highlightCert={highlightCert} />}
          />
        </ScatterChart>
      </ResponsiveContainer>

      <p className="text-xs text-surface-400 text-center">
        {institutions.length.toLocaleString()} institutions · Bubble size = total assets · Click any bubble to view institution
      </p>
    </div>
  );
}
