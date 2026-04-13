import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import { Link } from 'react-router';
import { useEffect } from 'react';
import { MapPin } from 'lucide-react';
import { formatCurrency, formatPercent } from '@/lib/format';
import type { Institution } from '@/types/institution';
import 'leaflet/dist/leaflet.css';

interface ExploreResultsMapProps {
  institutions: Institution[];
  isLoading: boolean;
}

// Color institutions by charter type / source
function markerColor(inst: Institution): string {
  if (inst.source === 'ncua' || inst.charter_type === 'credit_union') return '#6366f1';
  if (inst.source === 'osfi' || inst.source === 'rpaa' || inst.source === 'ciro') return '#0ea5e9';
  if (inst.charter_type === 'savings' || inst.charter_type === 'savings_association') return '#f59e0b';
  return '#2563eb';
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

// Auto-fit map bounds to institutions with coordinates
function MapBoundsFitter({ institutions }: { institutions: Institution[] }) {
  const map = useMap();

  useEffect(() => {
    const withCoords = institutions.filter(
      (i) => i.latitude != null && i.longitude != null,
    );
    if (withCoords.length === 0) return;

    const lats = withCoords.map((i) => i.latitude as number);
    const lngs = withCoords.map((i) => i.longitude as number);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    map.fitBounds(
      [
        [minLat, minLng],
        [maxLat, maxLng],
      ],
      { padding: [40, 40], maxZoom: 10 },
    );
  }, [institutions, map]);

  return null;
}

export function ExploreResultsMap({ institutions, isLoading }: ExploreResultsMapProps) {
  const withCoords = institutions.filter((i) => i.latitude != null && i.longitude != null);

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-200 shadow-sm" style={{ height: '520px' }}>
      {isLoading && (
        <div className="absolute inset-0 bg-white/70 z-[1000] flex items-center justify-center">
          <div className="text-sm text-slate-500">Loading institutions...</div>
        </div>
      )}

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
        <MapBoundsFitter institutions={withCoords} />
        {withCoords.map((inst) => (
          <CircleMarker
            key={inst.id}
            center={[inst.latitude as number, inst.longitude as number]}
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
                <div className="font-semibold text-sm text-slate-900">
                  {inst.name || inst.holding_company || `Cert #${inst.cert_number}`}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {inst.city}, {inst.state} · {inst.source.toUpperCase()}
                </div>
                <div className="mt-2 space-y-0.5 text-xs">
                  {inst.total_assets != null && (
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">Assets</span>
                      <span className="font-medium">{formatCurrency(inst.total_assets)}</span>
                    </div>
                  )}
                  {inst.roa != null && (
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">ROA</span>
                      <span className={`font-medium ${inst.roa < 0 ? 'text-red-600' : 'text-green-700'}`}>
                        {formatPercent(inst.roa)}
                      </span>
                    </div>
                  )}
                </div>
                <Link
                  to={`/institution/${inst.cert_number}`}
                  className="mt-2 block text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  View profile →
                </Link>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {!isLoading && withCoords.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-50 pointer-events-none">
          <MapPin className="h-10 w-10 text-slate-300" />
          <p className="text-slate-500 text-sm">No geocoded institutions in current results.</p>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg border border-slate-200 px-3 py-2 z-[400] flex items-center gap-3">
        {[
          { color: '#2563eb', label: 'Bank' },
          { color: '#6366f1', label: 'Credit Union' },
          { color: '#f59e0b', label: 'Savings' },
          { color: '#0ea5e9', label: 'Canadian' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-xs text-slate-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
