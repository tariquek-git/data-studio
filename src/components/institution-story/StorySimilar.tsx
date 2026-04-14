import { Link } from 'react-router';
import { Sparkles } from 'lucide-react';
import { Skeleton } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import type { SimilarInstitution } from '@/hooks/useInstitutionStory';

interface StorySimilarProps {
  similar: SimilarInstitution[];
  embeddingAvailable: boolean;
  isLoading: boolean;
}

function similarityBadgeClass(score: number): string {
  if (score >= 0.8) return 'bg-emerald-50 text-emerald-700';
  if (score >= 0.6) return 'bg-blue-50 text-blue-700';
  return 'bg-slate-100 text-slate-600';
}

export function StorySimilar({ similar, embeddingAvailable, isLoading }: StorySimilarProps) {
  return (
    <section id="section-similar" className="py-12 px-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 border-t border-slate-200" />
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap">
          Similar Institutions
        </h2>
        <div className="flex-1 border-t border-slate-200" />
      </div>

      {isLoading && (
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-56 shrink-0 rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && (!embeddingAvailable || similar.length === 0) && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Sparkles className="h-4 w-4" />
          <p>Similarity data coming soon — embeddings will be generated shortly.</p>
        </div>
      )}

      {!isLoading && similar.length > 0 && (
        <div className="overflow-x-auto snap-x snap-mandatory scroll-smooth pb-2">
          <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
            {similar.map((inst) => {
              const pct = Math.round(inst.similarity * 100);
              const location = [inst.city, inst.state].filter(Boolean).join(', ');
              return (
                <Link
                  key={inst.id}
                  to={inst.cert_number ? `/institution/${inst.cert_number}` : `/entities/${inst.id}`}
                  className="snap-start flex-shrink-0 w-56 bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:border-blue-200 hover:shadow-md transition-all group"
                >
                  <p className="text-sm font-bold text-slate-900 group-hover:text-blue-600 leading-tight mb-1 line-clamp-2">
                    {inst.name}
                  </p>
                  {location && (
                    <p className="text-xs text-slate-500 mb-2">{location}</p>
                  )}
                  {inst.total_assets != null && (
                    <p className="text-xs text-slate-600 mb-3">
                      {formatCurrency(inst.total_assets)} assets
                    </p>
                  )}
                  <span
                    className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${similarityBadgeClass(inst.similarity)}`}
                  >
                    {pct}% match
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
