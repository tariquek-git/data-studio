'use client';

import { useMemo } from 'react';
import { Treemap, ResponsiveContainer } from 'recharts';
import { PieChart } from 'lucide-react';
import { formatCurrency } from '@/lib/format';

interface DollarBreakdownProps {
  data: {
    total_assets: number | null;
    real_estate_loans: number | null;
    commercial_loans: number | null;
    consumer_loans: number | null;
    credit_card_loans: number | null;
    securities: number | null;
    cash_and_due: number | null;
    other_assets: number | null;
    total_loans: number | null;
  };
}

interface TreeItem {
  name: string;
  value: number;
  color: string;
  dollars: string;
  actual: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  'Real Estate Loans': '#2563eb',
  'Commercial Loans': '#3b82f6',
  'Consumer Loans': '#60a5fa',
  'Credit Card Loans': '#93c5fd',
  'Other Loans': '#a5b4fc',
  Securities: '#16a34a',
  'Cash & Due': '#22c55e',
  'Other Assets': '#94a3b8',
};

function CustomTreemapContent(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  dollars?: string;
  actual?: number;
  color?: string;
  index?: number;
}) {
  const { x = 0, y = 0, width = 0, height = 0, name, dollars, actual, color, index: _index = 0 } = props;

  if (width < 4 || height < 4) return null;

  const showLabel = width > 60 && height > 40;
  const showDollars = width > 50 && height > 55;
  const showActual = width > 80 && height > 70;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={color ?? '#94a3b8'}
        rx={4}
        stroke="white"
        strokeWidth={2}
        className="transition-opacity duration-150 hover:opacity-90"
      />
      {showLabel && (
        <text
          x={x + width / 2}
          y={y + height / 2 - (showActual ? 14 : showDollars ? 6 : 0)}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="white"
          className="text-[11px] font-semibold"
          style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
        >
          {name && name.length > width / 7 ? name.slice(0, Math.floor(width / 7)) + '...' : name}
        </text>
      )}
      {showDollars && dollars && (
        <text
          x={x + width / 2}
          y={y + height / 2 + (showActual ? 2 : 10)}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="rgba(255,255,255,0.9)"
          className="text-[13px] font-bold"
          style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
        >
          {dollars}
        </text>
      )}
      {showActual && actual !== undefined && (
        <text
          x={x + width / 2}
          y={y + height / 2 + 18}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="rgba(255,255,255,0.7)"
          className="text-[9px]"
          style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
        >
          {formatCurrency(actual)}
        </text>
      )}
    </g>
  );
}

export function DollarBreakdown({ data }: DollarBreakdownProps) {
  const treeData = useMemo(() => {
    const totalAssets = data.total_assets;
    if (totalAssets === null || totalAssets <= 0) return null;

    const items: TreeItem[] = [];

    const addItem = (name: string, value: number | null) => {
      if (value !== null && value > 0) {
        const proportion = value / totalAssets;
        items.push({
          name,
          value: Math.round(proportion * 10000) / 10000, // keep precision
          color: CATEGORY_COLORS[name] ?? '#94a3b8',
          dollars: `$${proportion.toFixed(2)}`,
          actual: value,
        });
      }
    };

    // Check if we have the loan breakdown
    const hasLoanBreakdown =
      data.real_estate_loans !== null ||
      data.commercial_loans !== null ||
      data.consumer_loans !== null ||
      data.credit_card_loans !== null;

    if (hasLoanBreakdown) {
      addItem('Real Estate Loans', data.real_estate_loans);
      addItem('Commercial Loans', data.commercial_loans);
      addItem('Consumer Loans', data.consumer_loans);
      addItem('Credit Card Loans', data.credit_card_loans);
    } else if (data.total_loans !== null && data.total_loans > 0) {
      // Fallback: use total loans as a single category
      items.push({
        name: 'Total Loans',
        value: Math.round((data.total_loans / totalAssets) * 10000) / 10000,
        color: '#2563eb',
        dollars: `$${(data.total_loans / totalAssets).toFixed(2)}`,
        actual: data.total_loans,
      });
    }

    addItem('Securities', data.securities);
    addItem('Cash & Due', data.cash_and_due);

    // Calculate "Other Assets" as the remainder
    const accounted = items.reduce((sum, item) => sum + item.value * totalAssets, 0);
    const otherValue = data.other_assets ?? totalAssets - accounted;
    if (otherValue > 0) {
      const proportion = otherValue / totalAssets;
      items.push({
        name: 'Other Assets',
        value: Math.round(proportion * 10000) / 10000,
        color: CATEGORY_COLORS['Other Assets'],
        dollars: `$${proportion.toFixed(2)}`,
        actual: otherValue,
      });
    }

    if (items.length === 0) return null;

    return items;
  }, [data]);

  if (!treeData) {
    return (
      <div className="rounded-xl border border-surface-200 bg-white p-6">
        <div className="mb-4 flex items-center gap-2">
          <PieChart className="h-5 w-5 text-primary-600" />
          <h3 className="text-lg font-semibold text-surface-900">For Every $1 of Assets</h3>
        </div>
        <div className="flex h-48 items-center justify-center text-surface-500">
          Data not available
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-surface-200 bg-white p-6">
      <div className="mb-4 flex items-center gap-2">
        <PieChart className="h-5 w-5 text-primary-600" />
        <h3 className="text-lg font-semibold text-surface-900">For Every $1 of Assets</h3>
      </div>

      {/* Legend */}
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
        {treeData.map((item) => (
          <div key={item.name} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-xs text-surface-600">
              {item.name} ({item.dollars})
            </span>
          </div>
        ))}
      </div>

      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={treeData as any}
            dataKey="value"
            aspectRatio={4 / 3}
            stroke="white"
            content={<CustomTreemapContent />}
            isAnimationActive={false}
          />
        </ResponsiveContainer>
      </div>

      {/* Summary row */}
      <div className="mt-3 flex items-center justify-between border-t border-surface-100 pt-3">
        <span className="text-xs text-surface-500">
          Total Assets: {formatCurrency(data.total_assets ?? 0)}
        </span>
        <span className="text-xs text-surface-500">
          {treeData.length} categories shown
        </span>
      </div>
    </div>
  );
}
