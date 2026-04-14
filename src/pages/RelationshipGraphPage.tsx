import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Network, RefreshCw } from 'lucide-react';
import * as d3force from 'd3-force';
import * as d3sel from 'd3-selection';
import type { BaseType } from 'd3-selection';
import * as d3zoom from 'd3-zoom';
import * as d3drag from 'd3-drag';
import { formatCurrency } from '@/lib/format';

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
  // d3 simulation adds these:
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

const EDGE_COLORS: Record<string, string> = {
  subsidiary_of: '#6366f1',
  sibling_of: '#94a3b8',
  acquired_by: '#f59e0b',
  merged_into: '#ef4444',
};

function nodeColor(n: GraphNode): string {
  if (n.entity_table === 'registry_entities') return '#10b981';
  if (n.entity_table === 'ecosystem_entities') return '#f97316';
  // institutions
  if (n.source === 'ncua' || n.charter_type === 'credit_union') return '#6366f1';
  if (n.source === 'osfi' || n.source === 'bcfsa') return '#0ea5e9';
  if (n.charter_type === 'savings' || n.charter_type === 'savings_association') return '#f59e0b';
  return '#2563eb';
}

function nodeRadius(assets: number | null): number {
  if (!assets) return 5;
  if (assets >= 500e9) return 20;
  if (assets >= 50e9) return 14;
  if (assets >= 10e9) return 10;
  if (assets >= 1e9) return 7;
  return 5;
}

/** Draw the appropriate shape for each node based on entity type. */
function appendNodeShape<GElement extends BaseType, PElement extends BaseType>(
  selection: d3sel.Selection<GElement, GraphNode, PElement, unknown>
): void {
  selection.each(function (this: BaseType, d: GraphNode) {
    const g = d3sel.select(this);
    const r = nodeRadius(d.total_assets);
    const fill = nodeColor(d);

    if (d.entity_table === 'registry_entities') {
      // diamond (rotated square)
      g.append('rect')
        .attr('width', r * 2).attr('height', r * 2)
        .attr('x', -r).attr('y', -r)
        .attr('transform', 'rotate(45)')
        .attr('fill', fill).attr('fill-opacity', 0.85)
        .attr('stroke', '#fff').attr('stroke-width', 1.5);
    } else if (d.entity_table === 'ecosystem_entities') {
      // triangle (upward)
      const tr = r + 2;
      g.append('polygon')
        .attr('points', `0,${-tr} ${-tr * 0.866},${tr * 0.5} ${tr * 0.866},${tr * 0.5}`)
        .attr('fill', fill).attr('fill-opacity', 0.85)
        .attr('stroke', '#fff').attr('stroke-width', 1.5);
    } else {
      // institutions → circle (default)
      g.append('circle')
        .attr('r', r)
        .attr('fill', fill).attr('fill-opacity', 0.85)
        .attr('stroke', '#fff').attr('stroke-width', 1.5);
    }
  });
}

async function fetchGraph(type: string, minAssets: number | null, depth: number): Promise<GraphData> {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (minAssets != null) params.set('min_assets', String(minAssets));
  params.set('limit', '300');
  params.set('depth', String(depth));
  const res = await fetch(`/api/relationships/graph?${params}`);
  if (!res.ok) throw new Error('Failed to load graph');
  return res.json();
}

const REL_TYPES = [
  { value: '', label: 'All types' },
  { value: 'subsidiary_of', label: 'Subsidiary' },
  { value: 'sibling_of', label: 'Co-subsidiary' },
  { value: 'acquired_by', label: 'Acquired by' },
];

const MIN_ASSETS_OPTIONS = [
  { value: '', label: 'All sizes' },
  { value: '1000000000', label: '$1B+' },
  { value: '10000000000', label: '$10B+' },
  { value: '50000000000', label: '$50B+' },
];

const DEPTH_OPTIONS = [
  { value: '1', label: 'Depth 1' },
  { value: '2', label: 'Depth 2' },
  { value: '3', label: 'Depth 3' },
];

const ENTITY_TABLE_LABELS: Record<EntityTable, string> = {
  institutions: 'Institution',
  registry_entities: 'Registry Entity',
  ecosystem_entities: 'Ecosystem Entity',
};

export default function RelationshipGraphPage() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [relType, setRelType] = useState('');
  const [minAssetsStr, setMinAssetsStr] = useState('1000000000');
  const [depth, setDepth] = useState(1);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const simRef = useRef<d3force.Simulation<GraphNode, GraphEdge> | null>(null);

  const minAssets = minAssetsStr ? Number(minAssetsStr) : null;

  const { data, isLoading, error } = useQuery({
    queryKey: ['graph', relType, minAssetsStr, depth],
    queryFn: () => fetchGraph(relType, minAssets, depth),
    staleTime: 5 * 60 * 1000,
  });

  const renderGraph = useCallback(() => {
    if (!svgRef.current || !data || data.nodes.length === 0) return;

    const svg = d3sel.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = svgRef.current.clientWidth || 900;
    const height = svgRef.current.clientHeight || 600;

    // Zoom container
    const container = svg.append('g');

    const zoom = d3zoom.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
      });

    svg.call(zoom);
    svg.call(zoom.transform, d3zoom.zoomIdentity.translate(width / 2, height / 2).scale(0.8));

    // Copy nodes/edges for d3 mutation
    const nodes: GraphNode[] = data.nodes.map(n => ({ ...n }));
    const edges: GraphEdge[] = data.edges.map(e => ({ ...e }));

    // Simulation
    const simulation = d3force.forceSimulation<GraphNode>(nodes)
      .force('link', d3force.forceLink<GraphNode, GraphEdge>(edges)
        .id(d => d.id)
        .distance((d: GraphEdge) => (d.type === 'subsidiary_of' ? 80 : 50))
        .strength(0.4))
      .force('charge', d3force.forceManyBody().strength(-120))
      .force('center', d3force.forceCenter(0, 0))
      .force('collision', d3force.forceCollide<GraphNode>().radius(d => nodeRadius(d.total_assets) + 4));

    simRef.current = simulation;

    // Edges
    const link = container.append('g')
      .selectAll('line')
      .data(edges)
      .join('line')
      .attr('stroke', (d: GraphEdge) => EDGE_COLORS[d.type] ?? '#64748b')
      .attr('stroke-opacity', 0.5)
      .attr('stroke-width', (d: GraphEdge) => (d.type === 'subsidiary_of' ? 2 : 1));

    // Nodes — cast needed because D3's .join() returns Selection<Element | BaseType>
    // but drag behavior requires Selection<Element>. This is a known D3 typing limitation.
    const nodeGroup = container.append('g')
      .selectAll<SVGGElement, GraphNode>('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .on('click', (_event, d) => setSelected(d))
      .call(
        d3drag.drag<SVGGElement, GraphNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    appendNodeShape(nodeGroup);

    nodeGroup.append('text')
      .text(d => d.name.split(' ').slice(0, 2).join(' '))
      .attr('x', d => nodeRadius(d.total_assets) + 3)
      .attr('y', 4)
      .attr('font-size', '9px')
      .attr('fill', '#374151')
      .attr('pointer-events', 'none');

    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as GraphNode).x ?? 0)
        .attr('y1', d => (d.source as GraphNode).y ?? 0)
        .attr('x2', d => (d.target as GraphNode).x ?? 0)
        .attr('y2', d => (d.target as GraphNode).y ?? 0);

      nodeGroup.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

  }, [data]);

  useEffect(() => {
    renderGraph();
    return () => { simRef.current?.stop(); };
  }, [renderGraph]);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Top bar */}
      <div className="bg-white border-b border-surface-700 px-4 py-3 flex items-center gap-4 shrink-0 flex-wrap">
        <div className="flex items-center gap-2">
          <Network className="h-5 w-5 text-primary-600" />
          <h1 className="text-base font-semibold text-surface-100">Relationship Graph</h1>
        </div>

        <select
          value={relType}
          onChange={e => setRelType(e.target.value)}
          className="text-sm border border-surface-700 rounded-lg px-2.5 py-1.5 bg-white text-surface-300 focus:outline-none"
        >
          {REL_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <select
          value={minAssetsStr}
          onChange={e => setMinAssetsStr(e.target.value)}
          className="text-sm border border-surface-700 rounded-lg px-2.5 py-1.5 bg-white text-surface-300 focus:outline-none"
        >
          {MIN_ASSETS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <select
          value={String(depth)}
          onChange={e => setDepth(Number(e.target.value))}
          className="text-sm border border-surface-700 rounded-lg px-2.5 py-1.5 bg-white text-surface-300 focus:outline-none"
          title="Traversal depth"
        >
          {DEPTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {data && (
          <span className="text-xs text-surface-500 ml-1">
            <span className="font-semibold text-surface-200">{data.total_nodes}</span> nodes ·{' '}
            <span className="font-semibold text-surface-200">{data.total_edges}</span> edges
          </span>
        )}

        <button
          onClick={() => { simRef.current?.alpha(0.5).restart(); }}
          className="ml-auto p-1.5 rounded-lg border border-surface-700 text-surface-500 hover:bg-surface-900"
          title="Reheat simulation"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>

        {/* Legend */}
        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          {[
            { color: EDGE_COLORS.subsidiary_of, label: 'Subsidiary' },
            { color: EDGE_COLORS.sibling_of, label: 'Co-subsidiary' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1">
              <div className="w-6 h-0.5" style={{ backgroundColor: color }} />
              <span className="text-xs text-surface-500">{label}</span>
            </div>
          ))}
          {/* Node shape legend */}
          <div className="flex items-center gap-1">
            <svg width="12" height="12" viewBox="-6 -6 12 12"><circle r="5" fill="#2563eb" fillOpacity={0.85} /></svg>
            <span className="text-xs text-surface-500">Institution</span>
          </div>
          <div className="flex items-center gap-1">
            <svg width="12" height="12" viewBox="-6 -6 12 12"><rect x="-4" y="-4" width="8" height="8" transform="rotate(45)" fill="#10b981" fillOpacity={0.85} /></svg>
            <span className="text-xs text-surface-500">Registry</span>
          </div>
          <div className="flex items-center gap-1">
            <svg width="12" height="12" viewBox="-6 -6 12 12"><polygon points="0,-5 -4.3,2.5 4.3,2.5" fill="#f97316" fillOpacity={0.85} /></svg>
            <span className="text-xs text-surface-500">Ecosystem</span>
          </div>
        </div>
      </div>

      {/* Graph + sidebar */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative bg-surface-900">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-sm text-surface-500">Loading graph...</div>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-red-600 text-sm">Failed to load graph data.</p>
            </div>
          )}
          {!isLoading && data?.nodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <Network className="h-10 w-10 text-surface-600" />
              <p className="text-surface-500 text-sm">No relationships match these filters.</p>
            </div>
          )}
          <svg ref={svgRef} className="w-full h-full" />

          {/* Zoom hint */}
          <div className="absolute bottom-3 left-3 text-xs text-surface-500 bg-white/80 rounded px-2 py-1">
            Scroll to zoom · drag to pan · click node for details
          </div>
        </div>

        {/* Node detail panel */}
        {selected && (
          <div className="w-64 border-l border-surface-700 bg-white p-4 shrink-0 overflow-y-auto">
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-sm font-semibold text-surface-100 leading-tight">{selected.name}</h3>
              <button
                onClick={() => setSelected(null)}
                className="text-surface-500 hover:text-surface-400 text-lg leading-none ml-2"
              >×</button>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-surface-500">Type</span>
                <span className="font-medium">{ENTITY_TABLE_LABELS[selected.entity_table]}</span>
              </div>
              {(selected.city || selected.state) && (
                <div className="flex justify-between">
                  <span className="text-surface-500">Location</span>
                  <span className="font-medium">
                    {[selected.city, selected.state].filter(Boolean).join(', ')}
                  </span>
                </div>
              )}
              {selected.source && (
                <div className="flex justify-between">
                  <span className="text-surface-500">Source</span>
                  <span className="font-medium uppercase">{selected.source}</span>
                </div>
              )}
              {selected.charter_type && (
                <div className="flex justify-between">
                  <span className="text-surface-500">Charter / Subtype</span>
                  <span className="font-medium">{selected.charter_type.replace(/_/g, ' ')}</span>
                </div>
              )}
              {selected.total_assets != null && (
                <div className="flex justify-between">
                  <span className="text-surface-500">Assets</span>
                  <span className="font-medium">{formatCurrency(selected.total_assets)}</span>
                </div>
              )}
              {selected.roa != null && (
                <div className="flex justify-between">
                  <span className="text-surface-500">ROA</span>
                  <span className={`font-medium ${selected.roa < 0 ? 'text-red-600' : 'text-green-700'}`}>
                    {selected.roa.toFixed(2)}%
                  </span>
                </div>
              )}
            </div>
            {selected.entity_table === 'institutions' && selected.cert_number != null && (
              <Link
                to={`/institution/${selected.cert_number}`}
                className="mt-4 block text-center text-xs bg-primary-600 text-white rounded-lg px-3 py-2 hover:bg-primary-700"
              >
                View full profile →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
