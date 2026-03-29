import { useState } from 'react';

interface CorrelationHeatmapProps {
  matrix: number[][];
  metrics: string[];
  count: number;
}

function getCellStyle(r: number, isDiagonal: boolean): { background: string; color: string } {
  if (isDiagonal) return { background: '#f1f5f9', color: '#475569' };
  if (r > 0.7) return { background: '#1d4ed8', color: '#ffffff' };
  if (r > 0.4) return { background: '#60a5fa', color: '#1e3a5f' };
  if (r > 0.1) return { background: '#dbeafe', color: '#1e3a5f' };
  if (r >= -0.1) return { background: '#ffffff', color: '#374151' };
  if (r >= -0.4) return { background: '#fee2e2', color: '#7f1d1d' };
  if (r >= -0.7) return { background: '#f87171', color: '#7f1d1d' };
  return { background: '#dc2626', color: '#ffffff' };
}

function interpretCorrelation(r: number): string {
  if (r >= 0.99) return 'Perfect positive — same metric';
  if (r > 0.7) return 'Strong positive — metrics rise together';
  if (r > 0.4) return 'Moderate positive — partial co-movement';
  if (r > 0.1) return 'Weak positive — slight tendency to co-move';
  if (r >= -0.1) return 'No linear relationship';
  if (r >= -0.4) return 'Weak negative — slight inverse tendency';
  if (r >= -0.7) return 'Moderate negative — partial inverse movement';
  return 'Strong negative — metrics move in opposite directions';
}

export function CorrelationHeatmap({ matrix, metrics, count }: CorrelationHeatmapProps) {
  const [tooltip, setTooltip] = useState<{ row: number; col: number } | null>(null);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="border-collapse text-sm mx-auto">
          <thead>
            <tr>
              {/* empty top-left corner cell */}
              <th className="p-2 min-w-[80px]" />
              {metrics.map(m => (
                <th
                  key={m}
                  className="p-2 text-xs font-semibold text-surface-600 text-center whitespace-nowrap min-w-[90px]"
                >
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, ri) => (
              <tr key={metrics[ri]}>
                <td className="p-2 text-xs font-semibold text-surface-600 text-right whitespace-nowrap pr-3">
                  {metrics[ri]}
                </td>
                {row.map((r, ci) => {
                  const isDiagonal = ri === ci;
                  const style = getCellStyle(r, isDiagonal);
                  const isActive = tooltip?.row === ri && tooltip?.col === ci;

                  return (
                    <td
                      key={ci}
                      className="relative border border-white cursor-default select-none transition-opacity"
                      style={{
                        background: style.background,
                        color: style.color,
                        minWidth: 90,
                        height: 48,
                        textAlign: 'center',
                        fontWeight: 600,
                        fontSize: 13,
                        opacity: isActive ? 0.85 : 1,
                      }}
                      onMouseEnter={() => setTooltip({ row: ri, col: ci })}
                      onMouseLeave={() => setTooltip(null)}
                    >
                      {r.toFixed(2)}

                      {isActive && (
                        <div
                          className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-2 bg-surface-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl whitespace-nowrap pointer-events-none"
                          style={{ minWidth: 200 }}
                        >
                          <div className="font-semibold mb-0.5">
                            {metrics[ri]} vs {metrics[ci]}
                          </div>
                          <div>r = {r.toFixed(4)}</div>
                          <div className="mt-0.5 text-surface-300">{interpretCorrelation(r)}</div>
                          {/* Arrow */}
                          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-surface-900" />
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Color legend */}
      <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
        {[
          { bg: '#1d4ed8', text: '#ffffff', label: 'Strong +' },
          { bg: '#60a5fa', text: '#1e3a5f', label: 'Moderate +' },
          { bg: '#dbeafe', text: '#1e3a5f', label: 'Weak +' },
          { bg: '#ffffff', text: '#374151', label: 'None', border: true },
          { bg: '#fee2e2', text: '#7f1d1d', label: 'Weak −' },
          { bg: '#f87171', text: '#7f1d1d', label: 'Moderate −' },
          { bg: '#dc2626', text: '#ffffff', label: 'Strong −' },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div
              className="w-7 h-5 rounded text-xs flex items-center justify-center font-medium"
              style={{
                background: item.bg,
                color: item.text,
                border: item.border ? '1px solid #e2e8f0' : undefined,
              }}
            >
              {item.label.includes('+') ? '+' : item.label.includes('−') ? '−' : '0'}
            </div>
            <span className="text-xs text-surface-500">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Interpretation guide */}
      <div className="bg-surface-50 border border-surface-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-surface-700 mb-1">How to read this matrix</p>
        <p className="text-xs text-surface-500 leading-relaxed">
          <strong>Strong positive (&gt;0.7):</strong> metrics consistently move together across institutions. &nbsp;
          <strong>Near zero (±0.1):</strong> no meaningful linear relationship — one metric tells you nothing about the other. &nbsp;
          <strong>Strong negative (&lt;−0.7):</strong> inverse relationship — when one rises the other tends to fall. &nbsp;
          Based on {count.toLocaleString()} FDIC-insured banks.
        </p>
      </div>
    </div>
  );
}
