import { useParams, Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Skeleton, SectionErrorBoundary } from '@/components/ui';
import { useInstitutionStory } from '@/hooks/useInstitutionStory';
import { StoryNavRail } from '@/components/institution-story/StoryNavRail';
import { StoryHero } from '@/components/institution-story/StoryHero';
import { StoryMetricCards } from '@/components/institution-story/StoryMetricCards';
import { StoryFinancialTrajectory } from '@/components/institution-story/StoryFinancialTrajectory';
import { StoryNetwork } from '@/components/institution-story/StoryNetwork';
import { StoryInsights } from '@/components/institution-story/StoryInsights';
import { StoryBrimSignals } from '@/components/institution-story/StoryBrimSignals';
import { StorySimilar } from '@/components/institution-story/StorySimilar';
import { StoryDeepDive } from '@/components/institution-story/StoryDeepDive';

export default function InstitutionStoryPage() {
  const { certNumber } = useParams<{ certNumber: string }>();

  const {
    institution,
    history,
    isLoading,
    error,
    similar,
    embeddingAvailable,
    similarLoading,
    aiInsights,
    aiLoading,
    aiError,
  } = useInstitutionStory(certNumber);

  // ── Loading skeleton ────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8 space-y-6">
        <Skeleton className="h-6 w-32" />
        <div className="space-y-4">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-4 w-full max-w-3xl" />
          <Skeleton className="h-4 w-5/6 max-w-3xl" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────────
  if (error || !institution) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-16 text-center">
        <p className="text-red-600 text-sm mb-4">
          {error instanceof Error ? error.message : 'Institution not found.'}
        </p>
        <Link
          to="/explore"
          className="text-blue-600 hover:text-blue-700 text-sm font-medium"
        >
          Back to Search
        </Link>
      </div>
    );
  }

  const REGISTRY_SOURCES: Array<typeof institution.source> = ['rpaa', 'ciro', 'fintrac', 'fincen'];
  const isRegistryOnly = REGISTRY_SOURCES.includes(institution.source);

  return (
    <div className="relative">
      {/* Sticky left nav rail (desktop only) */}
      <StoryNavRail />

      {/* Main content — offset for nav rail on large screens */}
      <div className="lg:pl-44">
        {/* Back link */}
        <div className="px-8 pt-6">
          <Link
            to="/explore"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Search
          </Link>
        </div>

        {/* Hero section */}
        <StoryHero
          institution={institution}
          lede={aiInsights?.summary ?? null}
          ledeLoading={aiLoading}
        />

        {/* Brim fit — why this matters */}
        {!isRegistryOnly && certNumber && (
          <SectionErrorBoundary section="Brim Fit">
            <StoryBrimSignals certNumber={certNumber} />
          </SectionErrorBoundary>
        )}

        {/* Metric cards grid */}
        {!isRegistryOnly && (
          <SectionErrorBoundary section="Metrics">
            <StoryMetricCards institution={institution} history={history} />
          </SectionErrorBoundary>
        )}

        {/* Financial trajectory chart */}
        {!isRegistryOnly && history.length > 0 && (
          <SectionErrorBoundary section="Financial Trajectory">
            <StoryFinancialTrajectory history={history} />
          </SectionErrorBoundary>
        )}

        {/* Relationship network */}
        <SectionErrorBoundary section="Relationship Network">
          <StoryNetwork entityId={institution.id} />
        </SectionErrorBoundary>

        {/* AI insights */}
        <SectionErrorBoundary section="AI Insights">
          <StoryInsights
            data={aiInsights}
            isLoading={aiLoading}
            isError={aiError}
          />
        </SectionErrorBoundary>

        {/* Similar institutions carousel */}
        <SectionErrorBoundary section="Similar Institutions">
          <StorySimilar
            similar={similar}
            embeddingAvailable={embeddingAvailable}
            isLoading={similarLoading}
          />
        </SectionErrorBoundary>

        {/* Deep dive accordion */}
        <SectionErrorBoundary section="Deep Dive">
          <StoryDeepDive institution={institution} />
        </SectionErrorBoundary>

        {/* Footer spacer */}
        <div className="h-24" />
      </div>
    </div>
  );
}
