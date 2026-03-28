'use client';

import { useState, useMemo } from 'react';
import { sankey, sankeyLinkHorizontal } from 'd3-sankey';
import type { SankeyNode, SankeyLink } from 'd3-sankey';
import { DollarSign } from 'lucide-react';
import { formatCurrency } from '@/lib/format';

interface SankeyFlowProps {
  data: {
    interest_income: number | null;
    noninterest_income: number | null;
    interest_expense: number | null;
    noninterest_expense: number | null;
    provision_for_losses: number | null;
    net_income: number | null;
  };
}

interface NodeExtra {
  name: string;
  color: string;
}

interface LinkExtra {
  color: string;
}

type SNode = SankeyNode<NodeExtra, LinkExtra>;
type SLink = SankeyLink<NodeExtra, LinkExtra>;

const NODE_COLORS: Record<string, string> = {
  'Interest Income': '#16a34a',
  'Non-Interest Income': '#22c55e',
  'Total Revenue': '#15803d',
  'Interest Expense': '#dc2626',
  'Non-Interest Expense': '#f97316',
  'Provisions': '#ea580c',
  'Net Income': '#2563eb',
  'Net Loss': '#dc2626',
};

const LINK_COLORS: Record<string, string> = {
  revenue: 'rgba(34, 197, 94, 0.35)',
  revenueHover: 'rgba(34, 197, 94, 0.6)',
  expense: 'rgba(239, 68, 68, 0.3)',
  expenseHover: 'rgba(239, 68, 68, 0.55)',
  net: 'rgba(37, 99, 235, 0.35)',
  netHover: 'rgba(37, 99, 235, 0.6)',
  netLoss: 'rgba(220, 38, 38, 0.35)',
  netLossHover: 'rgba(220, 38, 38, 0.6)',
};

export function SankeyFlow({ data }: SankeyFlowProps) {
  const [hoveredLink, setHoveredLink] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    source: string;
    target: string;
    value: number;
  } | null>(null);

  const hasData = useMemo(() => {
    return Object.values(data).some((v) => v !== null && v > 0);
  }, [data]);

  const sankeyData = useMemo(() => {
    if (!hasData) return null;

    const ii = data.interest_income ?? 0;
    const nii = data.noninterest_income ?? 0;
    const ie = data.interest_expense ?? 0;
    const nie = data.noninterest_expense ?? 0;
    const prov = data.provision_for_losses ?? 0;
    const ni = data.net_income ?? 0;

    const totalRevenue = ii + nii;
    if (totalRevenue <= 0) return null;

    const isProfit = ni >= 0;
    const netLabel = isProfit ? 'Net Income' : 'Net Loss';
    const netValue = Math.abs(ni);

    // Node indices: 0=II, 1=NII, 2=TotalRev, 3=IE, 4=NIE, 5=Prov, 6=Net
    const nodes: NodeExtra[] = [
      { name: 'Interest Income', color: NODE_COLORS['Interest Income'] },
      { name: 'Non-Interest Income', color: NODE_COLORS['Non-Interest Income'] },
      { name: 'Total Revenue', color: NODE_COLORS['Total Revenue'] },
      { name: 'Interest Expense', color: NODE_COLORS['Interest Expense'] },
      { name: 'Non-Interest Expense', color: NODE_COLORS['Non-Interest Expense'] },
      { name: 'Provisions', color: NODE_COLORS['Provisions'] },
      { name: netLabel, color: NODE_COLORS[netLabel] },
    ];

    const links: Array<{ source: number; target: number; value: number; color: string }> = [];

    // Revenue flows into Total Revenue
    if (ii > 0) {
      links.push({ source: 0, target: 2, value: ii, color: 'revenue' });
    }
    if (nii > 0) {
      links.push({ source: 1, target: 2, value: nii, color: 'revenue' });
    }

    // Total Revenue flows out to expenses and net income
    if (ie > 0) {
      links.push({ source: 2, target: 3, value: ie, color: 'expense' });
    }
    if (nie > 0) {
      links.push({ source: 2, target: 4, value: nie, color: 'expense' });
    }
    if (prov > 0) {
      links.push({ source: 2, target: 5, value: prov, color: 'expense' });
    }
    if (netValue > 0) {
      links.push({
        source: 2,
        target: 6,
        value: netValue,
        color: isProfit ? 'net' : 'netLoss',
      });
    }

    // Filter out nodes that have no connections
    const connectedNodeIndices = new Set<number>();
    links.forEach((l) => {
      connectedNodeIndices.add(l.source);
      connectedNodeIndices.add(l.target);
    });

    // Remap indices
    const oldToNew = new Map<number, number>();
    const filteredNodes: NodeExtra[] = [];
    let idx = 0;
    for (let i = 0; i < nodes.length; i++) {
      if (connectedNodeIndices.has(i)) {
        oldToNew.set(i, idx);
        filteredNodes.push(nodes[i]);
        idx++;
      }
    }

    const remappedLinks = links.map((l) => ({
      source: oldToNew.get(l.source) ?? 0,
      target: oldToNew.get(l.target) ?? 0,
      value: l.value,
      color: l.color,
    }));

    return { nodes: filteredNodes, links: remappedLinks };
  }, [data, hasData]);

  const layout = useMemo(() => {
    if (!sankeyData) return null;

    const width = 800;
    const height = 400;

    const generator = sankey<NodeExtra, LinkExtra>()
      .nodeId(((_d: unknown, i: unknown) => i as unknown as string) as any)
      .nodeWidth(20)
      .nodePadding(24)
      .nodeSort(null)
      .extent([
        [1, 24],
        [width - 1, height - 24],
      ]);

    const graph = generator({
      nodes: sankeyData.nodes.map((d) => ({ ...d })),
      links: sankeyData.links.map((d) => ({ ...d })),
    });

    return { nodes: graph.nodes as SNode[], links: graph.links as SLink[], width, height };
  }, [sankeyData]);

  if (!hasData || !layout) {
    return (
      <div className="rounded-xl border border-surface-200 bg-white p-6">
        <div className="mb-4 flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary-600" />
          <h3 className="text-lg font-semibold text-surface-900">Income Flow</h3>
        </div>
        <div className="flex h-48 items-center justify-center text-surface-500">
          No data available
        </div>
      </div>
    );
  }

  const linkPath = sankeyLinkHorizontal();

  return (
    <div className="rounded-xl border border-surface-200 bg-white p-6">
      <div className="mb-4 flex items-center gap-2">
        <DollarSign className="h-5 w-5 text-primary-600" />
        <h3 className="text-lg font-semibold text-surface-900">Income Flow</h3>
      </div>
      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Links */}
          {layout.links.map((link, i) => {
            const colorKey = (sankeyData?.links[i]?.color ?? 'revenue') as string;
            const isHovered = hoveredLink === i;
            const hoverKey = `${colorKey}Hover` as keyof typeof LINK_COLORS;
            const fill = isHovered
              ? LINK_COLORS[hoverKey] ?? LINK_COLORS[colorKey]
              : LINK_COLORS[colorKey];

            const sourceNode = link.source as SNode;
            const targetNode = link.target as SNode;

            return (
              <path
                key={i}
                d={linkPath(link as never) ?? ''}
                fill="none"
                stroke={fill}
                strokeWidth={Math.max(1, link.width ?? 1)}
                strokeOpacity={1}
                className="cursor-pointer transition-all duration-150"
                onMouseEnter={(e) => {
                  setHoveredLink(i);
                  const svgRect = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                  if (svgRect) {
                    const scaleX = layout.width / svgRect.width;
                    const scaleY = layout.height / svgRect.height;
                    const mx = (e.clientX - svgRect.left) * scaleX;
                    const my = (e.clientY - svgRect.top) * scaleY;
                    setTooltip({
                      x: mx,
                      y: my,
                      source: sourceNode.name ?? '',
                      target: targetNode.name ?? '',
                      value: link.value ?? 0,
                    });
                  }
                }}
                onMouseMove={(e) => {
                  const svgRect = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                  if (svgRect) {
                    const scaleX = layout.width / svgRect.width;
                    const scaleY = layout.height / svgRect.height;
                    const mx = (e.clientX - svgRect.left) * scaleX;
                    const my = (e.clientY - svgRect.top) * scaleY;
                    setTooltip((prev) =>
                      prev ? { ...prev, x: mx, y: my } : null
                    );
                  }
                }}
                onMouseLeave={() => {
                  setHoveredLink(null);
                  setTooltip(null);
                }}
              />
            );
          })}

          {/* Nodes */}
          {layout.nodes.map((node, i) => {
            const x0 = node.x0 ?? 0;
            const x1 = node.x1 ?? 0;
            const y0 = node.y0 ?? 0;
            const y1 = node.y1 ?? 0;
            const nodeData = sankeyData?.nodes[i];

            return (
              <g key={i}>
                <rect
                  x={x0}
                  y={y0}
                  width={x1 - x0}
                  height={Math.max(1, y1 - y0)}
                  fill={nodeData?.color ?? '#64748b'}
                  rx={3}
                />
                {/* Label */}
                <text
                  x={x0 < layout.width / 2 ? x0 - 6 : x1 + 6}
                  y={(y0 + y1) / 2}
                  textAnchor={x0 < layout.width / 2 ? 'end' : 'start'}
                  dominantBaseline="middle"
                  className="text-[11px] font-medium"
                  fill="#374151"
                >
                  {nodeData?.name}
                </text>
                {/* Value */}
                <text
                  x={x0 < layout.width / 2 ? x0 - 6 : x1 + 6}
                  y={(y0 + y1) / 2 + 14}
                  textAnchor={x0 < layout.width / 2 ? 'end' : 'start'}
                  dominantBaseline="middle"
                  className="text-[10px]"
                  fill="#6b7280"
                >
                  {formatCurrency(node.value ?? 0)}
                </text>
              </g>
            );
          })}

          {/* Tooltip */}
          {tooltip && (
            <g
              transform={`translate(${tooltip.x + 12}, ${tooltip.y - 28})`}
              pointerEvents="none"
            >
              <rect
                x={0}
                y={0}
                width={200}
                height={52}
                rx={6}
                fill="white"
                stroke="#e5e7eb"
                strokeWidth={1}
                filter="drop-shadow(0 2px 4px rgba(0,0,0,0.1))"
              />
              <text x={10} y={20} className="text-[11px] font-medium" fill="#374151">
                {tooltip.source} &rarr; {tooltip.target}
              </text>
              <text x={10} y={38} className="text-[12px] font-semibold" fill="#111827">
                {formatCurrency(tooltip.value)}
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
