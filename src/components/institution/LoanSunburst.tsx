import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import { Card } from '@/components/ui';
import { formatCurrency } from '@/lib/format';

interface LoanSunburstProps {
  raw: Record<string, unknown> | null;
  totalLoans: number | null;
}

interface LoanCategory {
  name: string;
  value: number;
  color: string;
}

function getRawField(raw: Record<string, unknown> | null, field: string): number | null {
  if (!raw || raw[field] == null) return null;
  const n = Number(raw[field]);
  return isNaN(n) ? null : n * 1000;
}

interface CustomContentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  value?: number;
  pct?: number;
  color?: string;
}

function CustomContent(props: CustomContentProps) {
  const { x = 0, y = 0, width = 0, height = 0, name, value, pct, color } = props;

  if (width < 40 || height < 30) {
    return <rect x={x} y={y} width={width} height={height} fill={color} rx={4} />;
  }

  const showAmount = height > 55 && width > 70;
  const showPct = height > 75 && width > 60;

  return (
    <g>
      <rect x={x + 1} y={y + 1} width={width - 2} height={height - 2} fill={color} rx={4} />
      <text
        x={x + width / 2}
        y={y + (showAmount ? height / 2 - 10 : height / 2)}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#fff"
        fontSize={width > 100 ? 12 : 10}
        fontWeight={600}
        style={{ pointerEvents: 'none' }}
      >
        {name}
      </text>
      {showAmount && value != null && (
        <text
          x={x + width / 2}
          y={y + height / 2 + 6}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="rgba(255,255,255,0.85)"
          fontSize={10}
          style={{ pointerEvents: 'none' }}
        >
          {formatCurrency(value)}
        </text>
      )}
      {showPct && pct != null && (
        <text
          x={x + width / 2}
          y={y + height / 2 + 20}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="rgba(255,255,255,0.7)"
          fontSize={9}
          style={{ pointerEvents: 'none' }}
        >
          {pct.toFixed(1)}%
        </text>
      )}
    </g>
  );
}

interface TooltipPayloadItem {
  payload?: {
    name?: string;
    value?: number;
    pct?: number;
  };
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;
  return (
    <div className="bg-white border border-surface-700 rounded-lg shadow-md px-3 py-2 text-sm">
      <p className="font-semibold text-surface-100">{item.name}</p>
      <p className="text-surface-400">{formatCurrency(item.value ?? null)}</p>
      {item.pct != null && (
        <p className="text-surface-500">{item.pct.toFixed(1)}% of total loans</p>
      )}
    </div>
  );
}

const CATEGORIES = [
  { label: 'Real Estate Loans', field: 'LNRE', color: '#2563eb' },
  { label: 'Commercial & Industrial', field: 'LNCI', color: '#7c3aed' },
  { label: 'Consumer Loans', field: 'LNCON', color: '#0891b2' },
  { label: 'Credit Card Loans', field: 'LNCRCD', color: '#16a34a' },
  { label: 'Agricultural', field: 'LNAG', color: '#f59e0b' },
];

export function LoanSunburst({ raw, totalLoans }: LoanSunburstProps) {
  if (totalLoans == null || raw == null) {
    return (
      <Card>
        <h3 className="text-sm font-semibold text-surface-300 mb-4">Loan Portfolio Composition</h3>
        <p className="text-sm text-surface-400 text-center py-8">
          Loan composition data not available.
        </p>
      </Card>
    );
  }

  const named: LoanCategory[] = [];
  let namedSum = 0;

  for (const cat of CATEGORIES) {
    const val = getRawField(raw, cat.field);
    if (val != null && val > 0) {
      named.push({ name: cat.label, value: val, color: cat.color });
      namedSum += val;
    }
  }

  const other = totalLoans - namedSum;
  if (other > 0) {
    named.push({ name: 'Other Loans', value: other, color: '#94a3b8' });
  }

  if (named.length === 0) {
    return (
      <Card>
        <h3 className="text-sm font-semibold text-surface-300 mb-4">Loan Portfolio Composition</h3>
        <p className="text-sm text-surface-400 text-center py-8">
          Loan composition data not available.
        </p>
      </Card>
    );
  }

  const chartData = named.map(item => ({
    name: item.name,
    value: item.value,
    pct: (item.value / totalLoans) * 100,
    color: item.color,
  }));

  return (
    <Card padding={false}>
      <div className="p-5 pb-0">
        <h3 className="text-sm font-semibold text-surface-300">Loan Portfolio Composition</h3>
        <p className="text-xs text-surface-400 mt-0.5">
          Total Loans: {formatCurrency(totalLoans)}
        </p>
      </div>
      <div className="p-4">
        <ResponsiveContainer width="100%" height={320}>
          <Treemap
            data={chartData}
            dataKey="value"
            nameKey="name"
            content={<CustomContent />}
            isAnimationActive={false}
          >
            <Tooltip content={<CustomTooltip />} />
          </Treemap>
        </ResponsiveContainer>
      </div>
      {/* Legend */}
      <div className="px-5 pb-4 flex flex-wrap gap-x-4 gap-y-1.5">
        {chartData.map(item => (
          <div key={item.name} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-xs text-surface-400">{item.name}</span>
            <span className="text-xs text-surface-400">({item.pct.toFixed(1)}%)</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
