import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Layers } from 'lucide-react';
import { Card, Badge, Skeleton } from '@/components/ui';
import { formatCurrency } from '@/lib/format';

interface SimilarInstitution {
  id: string;
  cert_number: number | null;
  name: string;
  source: string;
  city: string | null;
  state: string | null;
  total_assets: number | null;
  similarity: number;
}

interface SimilarResponse {
  similar: SimilarInstitution[];
  embedding_available: boolean;
}

interface SimilarInstitutionsProps {
  entityId: string;
}

async function fetchSimilar(entityId: string): Promise<SimilarResponse> {
  const res = await fetch(`/api/entities/${entityId}/similar?limit=5`);
  if (!res.ok) throw new Error('Failed to load similar institutions');
  return res.json() as Promise<SimilarResponse>;
}

function similarityColor(score: number): 'green' | 'blue' | 'gray' {
  if (score >= 0.9) return 'green';
  if (score >= 0.75) return 'blue';
  return 'gray';
}

export function SimilarInstitutions({ entityId }: SimilarInstitutionsProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['similar-institutions', entityId],
    queryFn: () => fetchSimilar(entityId),
    staleTime: 60 * 60 * 1000, // 1 hour — embeddings don't change often
    enabled: !!entityId,
  });

  if (isLoading) {
    return (
      <Card>
        <h3 className="text-sm font-semibold text-surface-300 mb-4 flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary-500" />
          Similar Institutions
        </h3>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (!data?.embedding_available || data.similar.length === 0) {
    return (
      <Card>
        <h3 className="text-sm font-semibold text-surface-300 mb-3 flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary-500" />
          Similar Institutions
        </h3>
        <p className="text-xs text-surface-400">
          Similarity data not yet available for this institution.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h3 className="text-sm font-semibold text-surface-300 mb-4 flex items-center gap-2">
        <Layers className="h-4 w-4 text-primary-500" />
        Similar Institutions
      </h3>
      <ul className="space-y-2">
        {data.similar.map((inst) => {
          const pct = Math.round(inst.similarity * 100);
          const locationLabel = [inst.city, inst.state].filter(Boolean).join(', ');
          return (
            <li key={inst.id}>
              <Link
                to={inst.cert_number ? `/institution/${inst.cert_number}` : `/entities/${inst.id}`}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-900 transition-colors group"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-surface-100 group-hover:text-primary-700 truncate">
                    {inst.name}
                  </p>
                  <p className="text-xs text-surface-400 truncate">
                    {locationLabel || inst.source.toUpperCase()}
                    {inst.total_assets != null && (
                      <> &middot; {formatCurrency(inst.total_assets)}</>
                    )}
                  </p>
                </div>
                <Badge color={similarityColor(inst.similarity)} className="shrink-0 tabular-nums">
                  {pct}%
                </Badge>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
