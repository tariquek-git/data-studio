import { Globe, Landmark, Network, ShieldCheck, Waypoints } from 'lucide-react';
import { Link } from 'react-router';
import { Badge, Card } from '@/components/ui';
import type { EntityDetail } from '@/types/entity';

interface EntityProfileRailProps {
  entity: EntityDetail;
  contextCompleteness: number;
  historyCount: number;
  relationshipCount: number;
  sourceCount: number;
}

function buildSearchUrl(params: Record<string, string | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  return `/entities?${search.toString()}`;
}

export function EntityProfileRail({
  entity,
  contextCompleteness,
  historyCount,
  relationshipCount,
  sourceCount,
}: EntityProfileRailProps) {
  const primaryRole = entity.business_roles[0] ?? null;

  return (
    <div className="space-y-4 xl:sticky xl:top-24">
      <Card className="border-slate-200 bg-white text-slate-900 shadow-2xl shadow-slate-200/50/30">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-cyan-600/80">Identity rail</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-900">{entity.name}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">{entity.context_summary}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 text-cyan-600">
            <ShieldCheck className="h-5 w-5" />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge color="gray" className="bg-slate-50 text-slate-900 ring-slate-200">
            {entity.profile_kind.replace(/_/g, ' ')}
          </Badge>
          <Badge color="green" className="bg-emerald-50 text-emerald-700 ring-emerald-200">
            {entity.source_authority}
          </Badge>
          {primaryRole && (
            <Badge color="blue" className="bg-cyan-50 text-cyan-700 ring-cyan-200">
              {primaryRole.replace(/_/g, ' ')}
            </Badge>
          )}
        </div>

        <div className="mt-5 grid gap-3">
          {[
            ['Country', entity.country_label],
            ['Regulator', entity.regulator ?? entity.source_authority],
            ['Charter / family', entity.charter_family?.replace(/_/g, ' ') ?? 'Not classified'],
            ['Parent', entity.holding_company ?? entity.parent_name ?? 'Not loaded'],
            ['Freshness', entity.data_as_of ?? entity.last_synced_at ?? 'Unknown'],
            ['Confidence', entity.confidence_score != null ? `${Math.round(entity.confidence_score * 100)}%` : 'n/a'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white/70 p-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
              <p className="mt-1 text-sm text-slate-900">{value}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="border-slate-200 bg-slate-50/80 text-slate-900">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Drill paths</p>
          <Waypoints className="h-4 w-4 text-slate-500" />
        </div>
        <div className="mt-4 space-y-2">
          <Link
            to={buildSearchUrl({ country: entity.country, profile_kind: entity.profile_kind })}
            className="block rounded-xl border border-slate-200 bg-white/70 px-3 py-3 text-sm text-slate-800 transition-colors hover:border-cyan-500/50 hover:bg-slate-50"
          >
            Open peer set in {entity.country_label}
          </Link>
          <Link
            to={buildSearchUrl({ regulator: entity.regulator ?? entity.source_authority })}
            className="block rounded-xl border border-slate-200 bg-white/70 px-3 py-3 text-sm text-slate-800 transition-colors hover:border-cyan-500/50 hover:bg-slate-50"
          >
            Explore same regulator / authority
          </Link>
          {entity.charter_family && (
            <Link
              to={buildSearchUrl({ charter_family: entity.charter_family, country: entity.country })}
              className="block rounded-xl border border-slate-200 bg-white/70 px-3 py-3 text-sm text-slate-800 transition-colors hover:border-cyan-500/50 hover:bg-slate-50"
            >
              Compare same charter family
            </Link>
          )}
          {primaryRole && (
            <Link
              to={buildSearchUrl({ business_role: primaryRole })}
              className="block rounded-xl border border-slate-200 bg-white/70 px-3 py-3 text-sm text-slate-800 transition-colors hover:border-cyan-500/50 hover:bg-slate-50"
            >
              Trace same business role
            </Link>
          )}
        </div>
      </Card>

      <Card className="border-slate-200 bg-slate-50/80 text-slate-900">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          {[
            { label: 'Context', value: `${contextCompleteness}%`, icon: <Landmark className="h-4 w-4" /> },
            { label: 'History', value: historyCount.toLocaleString(), icon: <Network className="h-4 w-4" /> },
            { label: 'Graph', value: relationshipCount.toLocaleString(), icon: <Waypoints className="h-4 w-4" /> },
            { label: 'Sources', value: sourceCount.toLocaleString(), icon: <Globe className="h-4 w-4" /> },
          ].map((metric) => (
            <div key={metric.label} className="rounded-xl border border-slate-200 bg-white/70 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{metric.label}</p>
                <div className="text-slate-500">{metric.icon}</div>
              </div>
              <p className="mt-2 text-lg font-semibold text-slate-900">{metric.value}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
