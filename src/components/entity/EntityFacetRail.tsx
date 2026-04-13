import type { ReactNode } from 'react';
import { Filter, Radar, Sparkles, TowerControl } from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui';
import type { EntityProfileKind, EntitySearchAggregations } from '@/types/entity';

type CountryFilter = 'all' | 'US' | 'CA' | 'NA';

interface EntityFacetRailProps {
  total: number;
  aggregations: EntitySearchAggregations;
  filters: {
    country: CountryFilter;
    profileKind: 'all' | EntityProfileKind;
    businessRole: string;
    regulator: string;
    charterFamily: string;
    sourceAuthority: string;
    status: string;
  };
  onUpdate: (next: Record<string, string | number | undefined>) => void;
}

const PRESET_SCREENS = [
  {
    label: 'Sponsor banks',
    description: 'Banks tagged for fintech sponsorship and embedded-banking programs.',
    params: { business_role: 'sponsor_bank', profile_kind: 'regulated_institution' },
  },
  {
    label: 'Canada PSPs',
    description: 'RPAA registry coverage and payments supervision profiles.',
    params: { country: 'CA', profile_kind: 'registry_entity', source_authority: 'Bank of Canada' },
  },
  {
    label: 'U.S. charters',
    description: 'FDIC, OCC, and depository institution screens with charter context.',
    params: { country: 'US', profile_kind: 'regulated_institution' },
  },
];

function topEntries(record: Record<string, number>, limit = 6) {
  return Object.entries(record)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

function FacetChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
        active
          ? 'border-cyan-300 bg-cyan-50 text-cyan-700'
          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">{label}</span>
        <span className="text-xs text-slate-500">{count}</span>
      </div>
    </button>
  );
}

function FacetSection({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="border-slate-200 bg-slate-50/80 text-slate-900 shadow-xl shadow-slate-200/50/20">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{subtitle}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500">{icon}</div>
      </div>
      <div className="space-y-2">{children}</div>
    </Card>
  );
}

export function EntityFacetRail({ total, aggregations, filters, onUpdate }: EntityFacetRailProps) {
  const topRegulators = topEntries(aggregations.by_regulator);
  const topCharters = topEntries(aggregations.by_charter_family);
  const topRoles = topEntries(aggregations.by_business_role);
  const topSources = topEntries(aggregations.by_source_key);
  const topStatuses = topEntries(aggregations.by_status);
  const activeFilters = [
    filters.country !== 'all' ? filters.country : null,
    filters.profileKind !== 'all' ? filters.profileKind.replace(/_/g, ' ') : null,
    filters.businessRole ? filters.businessRole.replace(/_/g, ' ') : null,
    filters.regulator || null,
    filters.charterFamily ? filters.charterFamily.replace(/_/g, ' ') : null,
    filters.sourceAuthority || null,
    filters.status ? filters.status.replace(/_/g, ' ') : null,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-4 xl:sticky xl:top-24">
      <Card className="border-slate-200 bg-white text-slate-900 shadow-2xl shadow-slate-200/50/40">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.26em] text-cyan-600/80">Signal scope</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{total.toLocaleString()}</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">
              Context-first entity coverage across banks and registries.
            </p>
          </div>
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-3 text-cyan-600">
            <TowerControl className="h-5 w-5" />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {activeFilters.length > 0 ? (
            activeFilters.map((filter) => (
              <Badge key={filter} color="gray" className="bg-slate-50 text-slate-800 ring-slate-200">
                {filter}
              </Badge>
            ))
          ) : (
            <Badge color="gray" className="bg-slate-50 text-slate-700 ring-slate-200">
              all signals
            </Badge>
          )}
        </div>

        <Button
          variant="secondary"
          size="sm"
          className="mt-4 !w-full !justify-center !border-slate-200 !bg-white !text-slate-900 hover:!bg-slate-50"
          onClick={() => onUpdate({
            country: undefined,
            profile_kind: undefined,
            business_role: undefined,
            regulator: undefined,
            charter_family: undefined,
            source_authority: undefined,
            status: undefined,
            page: 1,
          })}
        >
          Reset scope
        </Button>
      </Card>

      <FacetSection
        title="Command Screens"
        subtitle="One-click lenses for high-value workflows."
        icon={<Sparkles className="h-4 w-4" />}
      >
        {PRESET_SCREENS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => onUpdate({ ...preset.params, page: 1 })}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-left transition-colors hover:border-cyan-500/50 hover:bg-slate-50"
          >
            <p className="text-sm font-medium text-slate-900">{preset.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{preset.description}</p>
          </button>
        ))}
      </FacetSection>

      <FacetSection
        title="Dynamic Filters"
        subtitle="Facets expand and contract with the current result set."
        icon={<Filter className="h-4 w-4" />}
      >
        <div className="space-y-3">
          {topRegulators.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Regulators</p>
              {topRegulators.map(([label, count]) => (
                <FacetChip
                  key={label}
                  label={label}
                  count={count}
                  active={filters.regulator === label}
                  onClick={() => onUpdate({ regulator: filters.regulator === label ? undefined : label, page: 1 })}
                />
              ))}
            </div>
          )}
          {topCharters.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Charter families</p>
              {topCharters.map(([label, count]) => (
                <FacetChip
                  key={label}
                  label={label.replace(/_/g, ' ')}
                  count={count}
                  active={filters.charterFamily === label}
                  onClick={() => onUpdate({ charter_family: filters.charterFamily === label ? undefined : label, page: 1 })}
                />
              ))}
            </div>
          )}
          {topRoles.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Business roles</p>
              {topRoles.map(([label, count]) => (
                <FacetChip
                  key={label}
                  label={label.replace(/_/g, ' ')}
                  count={count}
                  active={filters.businessRole === label}
                  onClick={() => onUpdate({ business_role: filters.businessRole === label ? undefined : label, page: 1 })}
                />
              ))}
            </div>
          )}
          {topStatuses.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Status</p>
              {topStatuses.map(([label, count]) => (
                <FacetChip
                  key={label}
                  label={label.replace(/_/g, ' ')}
                  count={count}
                  active={filters.status === label}
                  onClick={() => onUpdate({ status: filters.status === label ? undefined : label, page: 1 })}
                />
              ))}
            </div>
          )}
        </div>
      </FacetSection>

      <FacetSection
        title="Source Authority"
        subtitle="Official coverage footprint inside the current view."
        icon={<Radar className="h-4 w-4" />}
      >
        {topSources.map(([label, count]) => (
          <FacetChip
            key={label}
            label={label.replace(/_/g, ' ')}
            count={count}
            active={filters.sourceAuthority === label}
            onClick={() => onUpdate({ source_authority: filters.sourceAuthority === label ? undefined : label, page: 1 })}
          />
        ))}
      </FacetSection>
    </div>
  );
}
