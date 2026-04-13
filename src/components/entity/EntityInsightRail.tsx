import { AlertTriangle, Database, Radar, SearchCheck, Waypoints } from 'lucide-react';
import { Link } from 'react-router';
import { Badge, Card } from '@/components/ui';
import type { EntityContextResponse, EntityDetail, EntityHistoryPoint, EntityRelationship, EntitySourceRecord } from '@/types/entity';

interface EntityInsightRailProps {
  entity: EntityDetail;
  context: EntityContextResponse | undefined;
  history: EntityHistoryPoint[];
  relationships: EntityRelationship[];
  sources: EntitySourceRecord[];
}

function isNavigableCounterpartyId(id: string) {
  return !id.startsWith('derived:');
}

export function EntityInsightRail({
  entity,
  context,
  history,
  relationships,
  sources,
}: EntityInsightRailProps) {
  const officialSources = sources.filter((source) => source.source_kind === 'official');
  const aiSummary = context?.sections.find((section) => section.key === 'ai')?.summary ?? entity.context_summary;
  const openQuestions = [
    relationships.length === 0 ? 'Relationship graph still needs enrichment for this profile.' : null,
    history.length < 4 ? 'Historical depth is still thin relative to a full intelligence profile.' : null,
    officialSources.length === 0 ? 'No primary-source record is attached in the current provenance surface.' : null,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-4 xl:sticky xl:top-24">
      <Card className="border-slate-200 bg-white text-slate-900 shadow-2xl shadow-slate-200/50/30">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-cyan-600/80">Why this matters</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-800">{aiSummary}</p>
          </div>
          <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-3 text-cyan-600">
            <Radar className="h-5 w-5" />
          </div>
        </div>
      </Card>

      <Card className="border-slate-200 bg-slate-50/80 text-slate-900">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Signal board</p>
          <Database className="h-4 w-4 text-slate-500" />
        </div>
        <div className="mt-4 grid gap-3">
          {[
            { label: 'Primary sources', value: String(officialSources.length) },
            { label: 'Structured relationships', value: String(relationships.length) },
            { label: 'Historical observations', value: String(history.length) },
            { label: 'Source authority', value: entity.source_authority },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{item.label}</p>
              <p className="mt-1 text-sm text-slate-900">{item.value}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="border-slate-200 bg-slate-50/80 text-slate-900">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Drill down</p>
          <Waypoints className="h-4 w-4 text-slate-500" />
        </div>
        <div className="mt-4 space-y-2">
          {relationships.slice(0, 4).map((relationship) => (
            isNavigableCounterpartyId(relationship.counterparty.id) ? (
              <Link
                key={relationship.id}
                to={`/entities/${relationship.counterparty.id}`}
                className="block rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm transition-colors hover:border-cyan-500/50 hover:bg-slate-50"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-900">{relationship.counterparty.name}</span>
                  <Badge color="gray" className="bg-slate-50 text-slate-800 ring-slate-200">
                    {relationship.relationship_label ?? relationship.relationship_type.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </Link>
            ) : (
              <div
                key={relationship.id}
                className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-900">{relationship.counterparty.name}</span>
                  <Badge color="gray" className="bg-slate-50 text-slate-800 ring-slate-200">
                    {relationship.relationship_label ?? relationship.relationship_type.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </div>
            )
          ))}
          {relationships.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
              Relationship edges will appear here as the graph deepens.
            </div>
          )}
        </div>
      </Card>

      <Card className="border-slate-200 bg-slate-50/80 text-slate-900">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Open questions</p>
          <AlertTriangle className="h-4 w-4 text-amber-600" />
        </div>
        <div className="mt-4 space-y-3">
          {openQuestions.length > 0 ? (
            openQuestions.map((question) => (
              <div key={question} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-800">
                {question}
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-relaxed text-emerald-800">
              Coverage is strong enough to support quick diligence and peer navigation.
            </div>
          )}
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
          <SearchCheck className="h-3.5 w-3.5" />
          Evidence gaps stay visible so AI context never looks more certain than the data.
        </div>
      </Card>
    </div>
  );
}
