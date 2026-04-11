import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Filter } from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { Link } from 'react-router';
import { formatCurrency, formatPercent } from '@/lib/format';
import 'leaflet/dist/leaflet.css';

interface GeoInstitution {
  id: string;
  cert_number: number;
  name: string;
  city: string;
  state: string;
  source: string;
  charter_type: string;
  total_assets: number | null;
  roa: number | null;
  latitude: number;
  longitude: number;
  brim_score: number | null;
  brim_tier: string | null;
}

const SOURCE_OPTIONS = [
  { value: '', label: 'All Sources' },
  { value: 'fdic', label: 'FDIC Banks' },
  { value: 'ncua', label: 'NCUA Credit Unions' },
  { value: 'osfi', label: 'OSFI (Canada)' },
];

const SIZE_FILTERS = [
  { value: '', label: 'All Sizes' },
  { value: 'mega', label: '$250B+', min: 250e9 },
  { value: 'large', label: '$10B+', min: 10e9 },
  { value: 'regional', label: '$1B+', min: 1e9 },
  { value: 'community', label: '$100M+', min: 100e6 },
  { value: 'small', label: '<$100M', max: 100e6 },
];

// Color institutions by charter type / source
function markerColor(inst: GeoInstitution): string {
  if (inst.source === 'ncua' || inst.charter_type === 'credit_union') return '#6366f1'; // violet
  if (inst.source === 'osfi' || inst.source === 'bcfsa') return '#0ea5e9';              // sky
  if (inst.charter_type === 'savings' || inst.charter_type === 'savings_association') return '#f59e0b'; // amber
  return '#2563eb'; // blue (commercial bank)
}

// Radius by asset size (log scale)
function markerRadius(assets: number | null): number {
  if (!assets) return 3;
  if (assets >= 1e12) return 18;
  if (assets >= 100e9) return 14;
  if (assets >= 10e9) return 10;
  if (assets >= 1e9) return 7;
  if (assets >= 100e6) return 5;
  return 3;
}

async function fetchGeo(source: string, minAssets: number | null, maxAssets: number | null) {
  const params = new URLSearchParams();
  if (source) params.set('source', source);
  if (minAssets != null) params.set('min_assets', String(minAssets));
  if (maxAssets != null) params.set('max_assets', String(maxAssets));
  const res = await fetch(`/api/institutions/geo?${params}`);
  if (!res.ok) throw new Error('Failed to load geo data');
  return res.json() as Promise<{ institutions: GeoInstitution[]; total: number }>;
}

export default function GeoMapPage() {
  const [source, setSource] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');

  const activeSize = SIZE_FILTERS.find(s => s.value === sizeFilter);
  const minAssets = activeSize?.min ?? null;
  const maxAssets = activeSize?.max ?? null;

  const { data, isLoading, error } = useQuery({
    queryKey: ['geo', source, sizeFilter],
    queryFn: () => fetchGeo(source, minAssets, maxAssets),
    staleTime: 10 * 60 * 1000,
  });

  const institutions = data?.institutions ?? [];

  // Summary stats
  const stats = useMemo(() => {
    if (!institutions.length) return null;
    const withAssets = institutions.filter(i => i.total_assets);
    return {
      count: institutions.length,
      total_assets: withAssets.reduce((s, i) => s + (i.total_assets ?? 0), 0),
      states: new Set(institutions.map(i => i.state)).size,
    };
  }, [institutions]);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Top bar */}
      <div className="bg-white border-b border-surface-200 px-4 py-3 flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary-600" />
          <h1 className="text-base font-semibold text-surface-900">Geographic Map</h1>
        </div>

        <div className="flex items-center gap-2 ml-2">
          <Filter className="h-3.5 w-3.5 text-surface-400" />
          <select
            value={source}
            onChange={e => setSource(e.target.value)}
            className="text-sm border border-surface-200 rounded-lg px-2.5 py-1.5 bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            value={sizeFilter}
            onChange={e => setSizeFilter(e.target.value)}
            className="text-sm border border-surface-200 rounded-lg px-2.5 py-1.5 bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {SIZE_FILTERS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {stats && (
          <div className="flex items-center gap-4 ml-auto text-xs text-surface-500">
            <span><span className="font-semibold text-surface-800">{stats.count.toLocaleString()}</span> institutions</span>
            <span><span className="font-semibold text-surface-800">{formatCurrency(stats.total_assets)}</span> total assets</span>
            <span><span className="font-semibold text-surface-800">{stats.states}</span> states/provinces</span>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-3 ml-4 shrink-0">
          {[
            { color: '#2563eb', label: 'Bank' },
            { color: '#6366f1', label: 'Credit Union' },
            { color: '#f59e0b', label: 'Savings' },
            { color: '#0ea5e9', label: 'Canadian' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-xs text-surface-500">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 bg-white/70 z-[1000] flex items-center justify-center">
            <div className="text-sm text-surface-500">Loading {institutions.length > 0 ? 'more ' : ''}institutions...</div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-red-600 text-sm">Failed to load map data.</p>
          </div>
        )}
        {!error && (
          <MapContainer
            center={[39.5, -98.35]}
            zoom={4}
            style={{ height: '100%', width: '100%' }}
            preferCanvas={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {institutions.map(inst => (
              <CircleMarker
                key={inst.id}
                center={[inst.latitude, inst.longitude]}
                radius={markerRadius(inst.total_assets)}
                pathOptions={{
                  fillColor: markerColor(inst),
                  fillOpacity: 0.75,
                  color: markerColor(inst),
                  weight: 1,
                  opacity: 0.9,
                }}
              >
                <Popup>
                  <div className="min-w-[200px]">
                    <div className="font-semibold text-sm text-surface-900">{inst.name}</div>
                    <div className="text-xs text-surface-500 mt-0.5">{inst.city}, {inst.state} · {inst.source.toUpperCase()}</div>
                    <div className="mt-2 space-y-0.5 text-xs">
                      {inst.total_assets != null && (
                        <div className="flex justify-between gap-4">
                          <span className="text-surface-500">Assets</span>
                          <span className="font-medium">{formatCurrency(inst.total_assets)}</span>
                        </div>
                      )}
                      {inst.roa != null && (
                        <div className="flex justify-between gap-4">
                          <span className="text-surface-500">ROA</span>
                          <span className={`font-medium ${inst.roa < 0 ? 'text-red-600' : 'text-green-700'}`}>
                            {formatPercent(inst.roa)}
                          </span>
                        </div>
                      )}
                      {inst.brim_score != null && (
                        <div className="flex justify-between gap-4">
                          <span className="text-surface-500">Brim Score</span>
                          <span className="font-medium">{inst.brim_score} ({inst.brim_tier})</span>
                        </div>
                      )}
                    </div>
                    <Link
                      to={`/institution/${inst.cert_number}`}
                      className="mt-2 block text-xs text-primary-600 hover:text-primary-800 font-medium"
                    >
                      View profile →
                    </Link>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        )}

        {!isLoading && institutions.length === 0 && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface-50">
            <MapPin className="h-10 w-10 text-surface-300" />
            <p className="text-surface-500 text-sm">No geocoded institutions yet.</p>
            <p className="text-surface-400 text-xs">Run <code className="bg-surface-100 px-1 rounded">python scripts/agent_fill_coords.py</code> to geocode all 10K institutions.</p>
          </div>
        )}
      </div>
    </div>
  );
}
