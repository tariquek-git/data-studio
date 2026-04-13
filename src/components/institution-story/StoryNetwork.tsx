import { useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Network, ArrowRight } from 'lucide-react';
import * as d3force from 'd3-force';
import * as d3sel from 'd3-selection';
import type { BaseType } from 'd3-selection';
import * as d3zoom from 'd3-zoom';
import * as d3drag from 'd3-drag';
import { Skeleton } from '@/components/ui';

type EntityTable = 'institutions' | 'registry_entities' | 'ecosystem_entities';

interface GraphNode {
  id: string;
  entity_table: EntityTable;
  cert_number: number | null;
  name: string;
  city: string | null;
  state: string | null;
  source: string | null;
  charter_type: string | null;
  total_assets: number | null;
  roa: number | null;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface GraphEdge {
  id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
  label: string | null;
  confidence: number | null;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  total_nodes: number;
  total_edges: number;
}

interface StoryNetworkProps {
  entityId: string;
}

const EDGE_COLORS: Record<string, string> = {
  subsidiary_of: '#6366f1',
  sibling_of: '#94a3b8',
  acquired_by: '#f59e0b',
  merged_into: '#ef4444',
};

function nodeColor(n: GraphNode): string {
  if (n.entity_table === 'registry_entities') return '#10b981';
  if (n.entity_table === 'ecosystem_entities') return '#f97316';
  if (n.source === 'ncua' || n.charter_type === 'credit_union') return '#6366f1';
  if (n.source === 'osfi') return '#0ea5e9';
  if (n.charter_type === 'savings' || n.charter_type === 'savings_association') return '#f59e0b';
  return '#2563eb';
}

function nodeRadius(assets: number | null): number {
  if (!assets) return 6;
  if (assets >= 500e9) return 18;
  if (assets >= 50e9) return 13;
  if (assets >= 10e9) return 10;
  if (assets >= 1e9) return 7;
  return 6;
}

function appendNodeShape<GElement extends BaseType, PElement extends BaseType>(
  selection: d3sel.Selection<GElement, GraphNode, PElement, unknown>,
): void {
  selection.each(function (this: BaseType, d: GraphNode) {
    const g = d3sel.select(this);
    const r = nodeRadius(d.total_assets);
    const fill = nodeColor(d);

    if (d.entity_table === 'registry_entities') {
      g.append('rect')
        .attr('width', r * 2)
        .attr('height', r * 2)
        .attr('x', -r)
        .attr('y', -r)
        .attr('transform', 'rotate(45)')
        .attr('fill', fill)
        .attr('fill-opacity', 0.85)
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.5);
    } else if (d.entity_table === 'ecosystem_entities') {
      const tr = r + 2;
      g.append('polygon')
        .attr('points', `0,${-tr} ${-tr * 0.866},${tr * 0.5} ${tr * 0.866},${tr * 0.5}`)
        .attr('fill', fill)
        .attr('fill-opacity', 0.85)
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.5);
    } else {
      g.append('circle')
        .attr('r', r)
        .attr('fill', fill)
        .attr('fill-opacity', 0.85)
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.5);
    }
  });
}

async function fetchEntityGraph(entityId: string): Promise<GraphData> {
  const params = new URLSearchParams();
  params.set('entity', entityId);
  params.set('depth', '1');
  params.set('limit', '50');
  const res = await fetch(`/api/relationships/graph?${params}`);
  if (!res.ok) throw new Error('Failed to load graph');
  return res.json() as Promise<GraphData>;
}

export function StoryNetwork({ entityId }: StoryNetworkProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<d3force.Simulation<GraphNode, GraphEdge> | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['story-network', entityId],
    queryFn: () => fetchEntityGraph(entityId),
    staleTime: 5 * 60 * 1000,
    enabled: !!entityId,
    retry: false,
  });

  const renderGraph = useCallback(() => {
    if (!svgRef.current || !data || data.nodes.length === 0) return;

    const svg = d3sel.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = svgRef.current.clientWidth || 700;
    const height = 380;

    const container = svg.append('g');

    const zoom = d3zoom
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
      });

    svg.call(zoom);

    const sim = d3force
      .forceSimulation<GraphNode>(data.nodes)
      .force(
        'link',
        d3force
          .forceLink<GraphNode, GraphEdge>(data.edges)
          .id((d) => d.id)
          .distance(80),
      )
      .force('charge', d3force.forceManyBody().strength(-200))
      .force('center', d3force.forceCenter(width / 2, height / 2))
      .force('collision', d3force.forceCollide<GraphNode>().radius((d) => nodeRadius(d.total_assets) + 6));

    simRef.current = sim;

    // Edges
    const link = container
      .append('g')
      .selectAll('line')
      .data(data.edges)
      .join('line')
      .attr('stroke', (d) => EDGE_COLORS[d.type] ?? '#cbd5e1')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.6);

    // Edge labels
    const edgeLabel = container
      .append('g')
      .selectAll('text')
      .data(data.edges)
      .join('text')
      .attr('font-size', 9)
      .attr('fill', '#94a3b8')
      .attr('text-anchor', 'middle')
      .text((d) => d.label ?? d.type.replace(/_/g, ' '));

    // Node groups
    const nodeGroup = container
      .append('g')
      .selectAll<SVGGElement, GraphNode>('g')
      .data(data.nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .call(
        d3drag
          .drag<SVGGElement, GraphNode>()
          .on('start', (event, d) => {
            if (!event.active) sim.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) sim.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }),
      );

    appendNodeShape(nodeGroup);

    nodeGroup
      .append('text')
      .attr('dy', (d) => nodeRadius(d.total_assets) + 12)
      .attr('text-anchor', 'middle')
      .attr('font-size', 10)
      .attr('fill', '#334155')
      .text((d) => (d.name.length > 22 ? d.name.slice(0, 20) + '…' : d.name));

    sim.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as GraphNode).x ?? 0)
        .attr('y1', (d) => (d.source as GraphNode).y ?? 0)
        .attr('x2', (d) => (d.target as GraphNode).x ?? 0)
        .attr('y2', (d) => (d.target as GraphNode).y ?? 0);

      edgeLabel
        .attr(
          'x',
          (d) => (((d.source as GraphNode).x ?? 0) + ((d.target as GraphNode).x ?? 0)) / 2,
        )
        .attr(
          'y',
          (d) => (((d.source as GraphNode).y ?? 0) + ((d.target as GraphNode).y ?? 0)) / 2,
        );

      nodeGroup.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });
  }, [data]);

  useEffect(() => {
    renderGraph();
    return () => {
      simRef.current?.stop();
    };
  }, [renderGraph]);

  return (
    <section id="section-network" className="py-12 px-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 border-t border-slate-200" />
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap">
          Network
        </h2>
        <div className="flex-1 border-t border-slate-200" />
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <Network className="h-4 w-4 text-blue-500" />
            Relationships
          </div>
          <Link
            to="/graph"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            View full graph
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {isLoading && (
          <div className="p-6">
            <Skeleton className="h-72 w-full" />
          </div>
        )}

        {!isLoading && (error || !data || data.nodes.length === 0) && (
          <div className="flex items-center justify-center h-48 text-sm text-slate-400">
            No known relationships for this institution.
          </div>
        )}

        {!isLoading && data && data.nodes.length > 0 && (
          <svg
            ref={svgRef}
            className="w-full"
            style={{ height: 380 }}
          />
        )}

        {!isLoading && data && data.nodes.length > 0 && (
          <div className="px-6 pb-4 flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-600 opacity-85" />
              Institution
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 bg-emerald-500 opacity-85"
                style={{ transform: 'rotate(45deg)' }}
              />
              Registry
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block"
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: '6px solid transparent',
                  borderRight: '6px solid transparent',
                  borderBottom: '10px solid #f97316',
                  opacity: 0.85,
                }}
              />
              Ecosystem
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
