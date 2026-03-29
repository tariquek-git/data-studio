import { Link } from 'react-router';
import { Badge } from '@/components/ui';
import type { EntityRelationship } from '@/types/entity';
import { TerminalCard } from './EntityShell';

interface EntityRelationshipListProps {
  relationships: EntityRelationship[];
}

export function EntityRelationshipList({ relationships }: EntityRelationshipListProps) {
  return (
    <TerminalCard
      title="Relationship Graph"
      subtitle="Structured relationships, curated sponsorship signals, and counterparties."
    >
      {relationships.length > 0 ? (
        <div className="space-y-3">
          {relationships.map((relationship) => (
            <div
              key={relationship.id}
              className="rounded-xl border border-slate-700 bg-slate-950/70 p-4"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge color={relationship.active ? 'green' : 'yellow'} className="bg-slate-800 text-slate-100 ring-slate-700">
                      {relationship.relationship_label ?? relationship.relationship_type.replace(/_/g, ' ')}
                    </Badge>
                    <span className="text-xs text-slate-400">
                      {relationship.direction}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">
                    <Link
                      to={`/entities/${relationship.counterparty.id}`}
                      className="font-semibold text-white hover:text-cyan-300 transition-colors"
                    >
                      {relationship.counterparty.name}
                    </Link>
                    <span className="text-slate-500"> · {relationship.counterparty.entity_type.replace(/_/g, ' ')}</span>
                  </p>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <p>{relationship.effective_start ?? 'No start date'}</p>
                  <p>{relationship.confidence_score != null ? `${Math.round(relationship.confidence_score * 100)}% confidence` : 'No confidence score'}</p>
                </div>
              </div>
              {relationship.notes && (
                <p className="mt-3 text-xs leading-relaxed text-slate-400">
                  {relationship.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-700 p-6 text-sm text-slate-400">
          No structured relationships are available yet for this profile.
        </div>
      )}
    </TerminalCard>
  );
}
