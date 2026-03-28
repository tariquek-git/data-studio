'use client';

import { useMemo, useState } from 'react';
import { TrendingDown } from 'lucide-react';
// formatCurrency available from '@/lib/format' if needed

interface WaterfallChartProps {
  data: {
    total_revenue: number | null;
    interest_expense: number | null;
    provision_for_losses: number | null;
    noninterest_expense: number | null;
    taxes: number | null;
    net_income: number | null;
  };
}

interface WaterfallStep {
  label: string;
  value: number;
  perDollar: number;
  pct: string;
  base: number;
  color: string;
  isTotal: boolean;
}

export function WaterfallChart({ data }: WaterfallChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const steps = useMemo((): WaterfallStep[] | null => {
    const rev = data.total_revenue;
    if (rev === null || rev <= 0) return null;

    const ie = data.interest_expense ?? 0;
    const prov = data.provision_for_losses ?? 0;
    const nie = data.noninterest_expense ?? 0;
    const taxes = data.taxes ?? 0;
    const ni = data.net_income ?? 0;

    const perDollar = (v: number) => v / rev;
    const pctStr = (v: number) => `${(Math.abs(v / rev) * 100).toFixed(1)}%`;

    let running = 1.0; // start at $1.00

    const result: WaterfallStep[] = [];

    // Revenue bar — starts at 0, goes up to 1.00
    result.push({
      label: 'Revenue',
      value: 1.0,
      perDollar: 1.0,
      pct: '100%',
      base: 0,
      color: '#16a34a',
      isTotal: true,
    });

    // Interest Expense
    if (ie > 0) {
      const pd = perDollar(ie);
      result.push({
        label: 'Interest Expense',
        value: pd,
        perDollar: pd,
        pct: pctStr(ie),
        base: running - pd,
        color: '#dc2626',
        isTotal: false,
      });
      running -= pd;
    }

    // Provision for Losses
    if (prov > 0) {
      const pd = perDollar(prov);
      result.push({
        label: 'Provision for Losses',
        value: pd,
        perDollar: pd,
        pct: pctStr(prov),
        base: running - pd,
        color: '#dc2626',
        isTotal: false,
      });
      running -= pd;
    }

    // Non-Interest Expense
    if (nie > 0) {
      const pd = perDollar(nie);
      result.push({
        label: 'Non-Interest Expense',
        value: pd,
        perDollar: pd,
        pct: pctStr(nie),
        base: running - pd,
        color: '#dc2626',
        isTotal: false,
      });
      running -= pd;
    }

    // Taxes
    if (taxes > 0) {
      const pd = perDollar(taxes);
      result.push({
        label: 'Taxes',
        value: pd,
        perDollar: pd,
        pct: pctStr(taxes),
        base: running - pd,
        color: '#f59e0b',
        isTotal: false,
      });
      running -= pd;
    }

    // Net Income — starts from 0
    const niPd = perDollar(Math.abs(ni));
    const isProfit = ni >= 0;
    result.push({
      label: isProfit ? 'Net Income' : 'Net Loss',
      value: niPd,
      perDollar: isProfit ? niPd : -niPd,
      pct: pctStr(ni),
      base: 0,
      color: isProfit ? '#16a34a' : '#dc2626',
      isTotal: true,
    });

    return result;
  }, [data]);

  if (!steps) {
    return (
      <div className="rounded-xl border border-surface-200 bg-white p-6">
        <div className="mb-4 flex items-center gap-2">
          <TrendingDown className="h-5 w-5 text-primary-600" />
          <h3 className="text-lg font-semibold text-surface-900">
            Revenue Breakdown &mdash; Per $1 Earned
          </h3>
        </div>
        <div className="flex h-48 items-center justify-center text-surface-500">
          No data available
        </div>
      </div>
    );
  }

  const width = 720;
  const height = 360;
  const paddingTop = 40;
  const paddingBottom = 80;
  const paddingLeft = 40;
  const paddingRight = 40;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const barCount = steps.length;
  const barGap = 16;
  const barWidth = Math.min(80, (chartWidth - barGap * (barCount - 1)) / barCount);
  const totalBarsWidth = barWidth * barCount + barGap * (barCount - 1);
  const startX = paddingLeft + (chartWidth - totalBarsWidth) / 2;

  // Y scale: 0 to 1.0 maps to chartHeight to 0
  const yScale = (v: number) => paddingTop + chartHeight * (1 - v);

  return (
    <div className="rounded-xl border border-surface-200 bg-white p-6">
      <div className="mb-4 flex items-center gap-2">
        <TrendingDown className="h-5 w-5 text-primary-600" />
        <h3 className="text-lg font-semibold text-surface-900">
          Revenue Breakdown &mdash; Per $1 Earned
        </h3>
      </div>
      <div className="w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Y-axis gridlines */}
          {[0, 0.25, 0.5, 0.75, 1.0].map((tick) => (
            <g key={tick}>
              <line
                x1={paddingLeft}
                x2={width - paddingRight}
                y1={yScale(tick)}
                y2={yScale(tick)}
                stroke="#e5e7eb"
                strokeDasharray={tick === 0 ? undefined : '4,4'}
              />
              <text
                x={paddingLeft - 6}
                y={yScale(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                className="text-[10px]"
                fill="#9ca3af"
              >
                ${tick.toFixed(2)}
              </text>
            </g>
          ))}

          {/* Connector lines between bars */}
          {steps.map((step, i) => {
            if (i === 0 || step.isTotal) return null;
            void steps[i - 1]; // previous step available if needed
            const prevX = startX + i * (barWidth + barGap) - barGap;
            const currX = startX + i * (barWidth + barGap);
            const fromY = yScale(step.base + step.value);
            return (
              <line
                key={`conn-${i}`}
                x1={prevX + barWidth / 2}
                x2={currX + barWidth / 2}
                y1={fromY}
                y2={fromY}
                stroke="#d1d5db"
                strokeDasharray="3,3"
                strokeWidth={1}
              />
            );
          })}

          {/* Bars */}
          {steps.map((step, i) => {
            const x = startX + i * (barWidth + barGap);
            const barTop = yScale(step.base + step.value);
            const barBottom = yScale(step.base);
            const barH = Math.max(1, barBottom - barTop);
            const isHovered = hoveredIndex === i;

            return (
              <g
                key={i}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                className="cursor-pointer"
              >
                {/* Invisible hit area */}
                <rect
                  x={x - 4}
                  y={paddingTop}
                  width={barWidth + 8}
                  height={chartHeight}
                  fill="transparent"
                />

                {/* Bar */}
                <rect
                  x={x}
                  y={barTop}
                  width={barWidth}
                  height={barH}
                  fill={step.color}
                  rx={3}
                  opacity={isHovered ? 1 : 0.85}
                  className="transition-opacity duration-150"
                />

                {/* Value label on bar */}
                <text
                  x={x + barWidth / 2}
                  y={barTop - 6}
                  textAnchor="middle"
                  className="text-[11px] font-semibold"
                  fill={step.color}
                >
                  {step.isTotal
                    ? `$${step.perDollar.toFixed(2)}`
                    : `-$${step.value.toFixed(2)}`}
                </text>

                {/* Percentage */}
                <text
                  x={x + barWidth / 2}
                  y={barTop - 20}
                  textAnchor="middle"
                  className="text-[9px]"
                  fill="#9ca3af"
                >
                  {step.pct}
                </text>

                {/* X-axis label */}
                <text
                  x={x + barWidth / 2}
                  y={height - paddingBottom + 16}
                  textAnchor="middle"
                  className="text-[10px] font-medium"
                  fill="#374151"
                >
                  {step.label.length > 14
                    ? step.label.split(' ').map((word, wi) => (
                        <tspan
                          key={wi}
                          x={x + barWidth / 2}
                          dy={wi === 0 ? 0 : 12}
                        >
                          {word}
                        </tspan>
                      ))
                    : step.label}
                </text>

                {/* Hover tooltip */}
                {isHovered && (
                  <g>
                    <rect
                      x={x + barWidth / 2 - 70}
                      y={barTop - 60}
                      width={140}
                      height={30}
                      rx={6}
                      fill="white"
                      stroke="#e5e7eb"
                      filter="drop-shadow(0 2px 4px rgba(0,0,0,0.1))"
                    />
                    <text
                      x={x + barWidth / 2}
                      y={barTop - 41}
                      textAnchor="middle"
                      className="text-[11px] font-medium"
                      fill="#111827"
                    >
                      {step.label}: {step.isTotal ? '' : '-'}$
                      {step.value.toFixed(2)} per $1
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
