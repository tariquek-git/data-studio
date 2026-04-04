import { Link } from 'react-router';
import { ArrowRight, Network } from 'lucide-react';
import { Badge } from '@/components/ui';
import type { EntityRelationship } from '@/types/entity';
import { TerminalCard } from './EntityShell';

interface EntityRelationshipListProps {
  relationships: EntityRelationship[];
}

function relationshipTone(relationship: EntityRelationship) {
  if (!relationship.active) return 'yellow';
  if ((relationship.confidence_score ?? 0) >= 0.75) return 'green';
  return 'blue';
}

function groupLabel(relationships: EntityRelationship[]) {
  const groups = new Map<string, number>();
  for (const relationship of relationships) {
    const key = relationship.relationship_label ?? relationship.relationship_type.replace(/_/g, ' ');
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  return [...groups.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
}

export function EntityRelationshipList({ relationships }: EntityRelationshipListProps) {
  const topGroups = groupLabel(relationships);

  return (
    <TerminalCard
      title="Relationship Graph"
      subtitle="Structured links, sponsor-bank signals, and counterparties mapped around this entity."
      className="border-slate-800 bg-slate-950/85 shadow-[0_18px_70px_rgba(2,6,23,0.45)]"
    >
      {relationships.length > 0 ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Total links</p>
              <p className="mt-2 text-xl font-semibold text-white">{relationships.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Active links</p>
              <p className="mt-2 text-xl font-semibold text-white">
                {relationships.filter((relationship) => relationship.active).length}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Top edge type</p>
              <p className="mt-2 text-sm font-semibold text-white">
                {topGroups[0]?.[0] ?? 'Unclassified'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {topGroups.map(([label, count]) => (
              <Badge key={label} color="purple" className="bg-slate-900 text-slate-100 ring-slate-700">
                {label} · {count}
              </Badge>
            ))}
          </div>

          <div className="space-y-3">
            {relationships.map((relationship) => (
              <div
                key={relationship.id}
                className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4"
              >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge color={relationshipTone(relationship)} className="bg-slate-950 text-slate-100 ring-slate-700">
                        {relationship.relationship_label ?? relationship.relationship_type.replace(/_/g, ' ')}
                      </Badge>
                      <Badge color="gray" className="bg-slate-950 text-slate-300 ring-slate-700">
                        {relationship.direction}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-300">
                      <Link
                        to={`/entities/${relationship.counterparty.id}`}
                        className="font-semibold text-white transition-colors hover:text-cyan-300"
                      >
                        {relationship.counterparty.name}
                      </Link>
                      <span className="text-slate-500">
                        {' '}
                        · {relationship.counterparty.entity_type.replace(/_/g, ' ')} · {relationship.counterparty.country_label}
                      </span>
                    </p>
                    {relationship.notes && (
                      <p className="text-xs leading-relaxed text-slate-400">
                        {relationship.notes}
                      </p>
                    )}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3 xl:w-[320px] xl:grid-cols-1">
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Window</p>
                      <p className="mt-1 text-xs text-slate-300">
                        {relationship.effective_start ?? 'Unknown'}{relationship.effective_end ? ` to ${relationship.effective_end}` : ''}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Confidence</p>
                      <p className="mt-1 text-xs text-slate-300">
                        {relationship.confidence_score != null ? `${Math.round(relationship.confidence_score * 100)}%` : 'No score'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Counterparty</p>
                      <p className="mt-1 text-xs text-slate-300">{relationship.counterparty.source_authority}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3 text-xs text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <Network className="h-3.5 w-3.5" />
                    graph edge
                  </span>
                  <Link
                    to={`/entities/${relationship.counterparty.id}`}
                    className="inline-flex items-center gap-1 font-medium text-cyan-300 hover:text-cyan-200"
                  >
                    Open counterparty
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-sm text-slate-400">
          No structured relationships are available yet for this profile.
        </div>
      )}
    </TerminalCard>
  );
}
