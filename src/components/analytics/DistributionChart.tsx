import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface Bin {
  bin: string;
  min: number;
  max: number;
  count: number;
}

interface DistributionChartProps {
  data: Bin[];
  mean: number;
  p25: number;
  p50: number;
  p75: number;
  label: string;
  unit?: string;
  color?: string;
  highlightValue?: number | null;
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload as Bin;
  return (
    <div className="bg-white border border-surface-700 rounded-lg shadow-md p-3 text-xs">
      <p className="font-semibold text-surface-100">
        {d.min.toFixed(2)}% – {d.max.toFixed(2)}%
      </p>
      <p className="text-surface-400 mt-0.5">{d.count.toLocaleString()} institutions</p>
    </div>
  );
}

export function DistributionChart({
  data,
  mean,
  p25,
  p50,
  p75,
  label,
  unit = '%',
  color = '#2563eb',
  highlightValue,
}: DistributionChartProps) {
  const maxCount = Math.max(...data.map(d => d.count));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 text-xs">
        {[
          { label: '25th pct', value: p25, color: '#94a3b8' },
          { label: 'Median', value: p50, color: '#64748b' },
          { label: 'Mean', value: mean, color: color },
          { label: '75th pct', value: p75, color: '#0891b2' },
          ...(highlightValue != null ? [{ label: 'This bank', value: highlightValue, color: '#f59e0b' }] : []),
        ].map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-surface-500">{s.label}:</span>
            <span className="font-semibold text-surface-300">{s.value.toFixed(2)}{unit}</span>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }} barCategoryGap={1}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="bin"
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            tickFormatter={v => `${parseFloat(v).toFixed(1)}%`}
            interval={4}
          />
          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} width={35} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />

          <ReferenceLine x={p25.toFixed(2)} stroke="#94a3b8" strokeDasharray="4 2" strokeWidth={1.5} />
          <ReferenceLine x={p50.toFixed(2)} stroke="#475569" strokeDasharray="4 2" strokeWidth={2} />
          <ReferenceLine x={mean.toFixed(2)} stroke={color} strokeDasharray="4 2" strokeWidth={2} />
          <ReferenceLine x={p75.toFixed(2)} stroke="#0891b2" strokeDasharray="4 2" strokeWidth={1.5} />
          {highlightValue != null && (
            <ReferenceLine x={highlightValue.toFixed(2)} stroke="#f59e0b" strokeWidth={2.5} />
          )}

          <Bar dataKey="count" radius={[2, 2, 0, 0]}>
            {data.map((entry, idx) => {
              const intensity = entry.count / maxCount;
              // Highlight the bin containing the institution's value
              const isHighlight = highlightValue != null && highlightValue >= entry.min && highlightValue < entry.max;
              return (
                <Cell
                  key={idx}
                  fill={isHighlight ? '#f59e0b' : color}
                  fillOpacity={isHighlight ? 1 : 0.35 + intensity * 0.65}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs text-surface-400 text-center">{label} distribution across all FDIC-insured banks</p>
    </div>
  );
}
