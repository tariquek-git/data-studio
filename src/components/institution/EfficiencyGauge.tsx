import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from 'recharts';

interface EfficiencyGaugeProps {
  // Efficiency ratio = non-interest expense / (net interest income + non-interest income)
  // Lower is better: < 50% = excellent, 50-65% = good, 65-80% = average, > 80% = poor
  efficiencyRatio: number | null;
  label?: string;
}

function getColor(ratio: number): string {
  if (ratio < 50) return '#16a34a';   // excellent
  if (ratio < 65) return '#2563eb';   // good
  if (ratio < 80) return '#f59e0b';   // average
  return '#dc2626';                    // poor
}

function getLabel(ratio: number): string {
  if (ratio < 50) return 'Excellent';
  if (ratio < 65) return 'Good';
  if (ratio < 80) return 'Average';
  return 'Poor';
}

export function EfficiencyGauge({ efficiencyRatio, label = 'Efficiency Ratio' }: EfficiencyGaugeProps) {
  if (efficiencyRatio == null) {
    return (
      <div className="flex items-center justify-center h-40 text-surface-400 text-sm">
        Efficiency ratio not available
      </div>
    );
  }

  // Cap at 120 for display (anything over 100% is very bad)
  const display = Math.min(120, Math.max(0, efficiencyRatio));
  const color = getColor(efficiencyRatio);
  const rating = getLabel(efficiencyRatio);

  // The gauge goes from 0-100% across 270 degrees
  const data = [{ value: display, fill: color }];

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-40 h-28">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="70%"
            outerRadius="100%"
            startAngle={210}
            endAngle={-30}
            data={data}
            barSize={14}
          >
            {/* Background track */}
            <RadialBar
              dataKey="value"
              cornerRadius={7}
              background={{ fill: '#f1f5f9' }}
            />
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          </RadialBarChart>
        </ResponsiveContainer>

        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pb-2">
          <span className="text-2xl font-bold" style={{ color }}>
            {efficiencyRatio.toFixed(1)}%
          </span>
          <span className="text-xs font-medium" style={{ color }}>
            {rating}
          </span>
        </div>
      </div>

      <p className="text-xs font-medium text-surface-600 text-center">{label}</p>
      <div className="flex gap-3 mt-2 text-xs text-surface-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />&lt;50% excellent</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />65–80% avg</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />&gt;80% poor</span>
      </div>
    </div>
  );
}
