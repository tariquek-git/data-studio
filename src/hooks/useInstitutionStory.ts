import { useQuery } from '@tanstack/react-query';
import type { Institution, FinancialHistory } from '@/types/institution';

// ── Types ──────────────────────────────────────────────────────────────────

export interface InstitutionStoryData {
  institution: Institution;
  financial_history: FinancialHistory[];
  branch_count: number;
}

export interface SimilarInstitution {
  id: string;
  name: string;
  source: string;
  city: string | null;
  state: string | null;
  total_assets: number | null;
  similarity: number;
}

export interface SimilarResponse {
  similar: SimilarInstitution[];
  embedding_available: boolean;
}

export interface AIInsightsResponse {
  summary: string;
  generated_at?: string;
  cached?: boolean;
}

// ── Fetchers ───────────────────────────────────────────────────────────────

async function fetchInstitutionStory(certNumber: string): Promise<InstitutionStoryData> {
  const res = await fetch(`/api/institutions/${certNumber}`);
  if (!res.ok) throw new Error('Failed to load institution');
  return res.json() as Promise<InstitutionStoryData>;
}

async function fetchSimilar(entityId: string): Promise<SimilarResponse> {
  const res = await fetch(`/api/entities/${entityId}/similar?limit=6`);
  if (!res.ok) throw new Error('Failed to load similar institutions');
  return res.json() as Promise<SimilarResponse>;
}

async function fetchAIInsights(certNumber: string): Promise<AIInsightsResponse> {
  const res = await fetch('/api/ai/summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ certNumber: Number(certNumber) }),
  });
  if (!res.ok) throw new Error('AI insights unavailable');
  return res.json() as Promise<AIInsightsResponse>;
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useInstitutionStory(certNumber: string | undefined) {
  const storyQuery = useQuery({
    queryKey: ['institution-story', certNumber],
    queryFn: () => fetchInstitutionStory(certNumber!),
    enabled: !!certNumber,
    staleTime: 5 * 60 * 1000, // 5 min
  });

  const entityId = storyQuery.data?.institution.id;

  const similarQuery = useQuery({
    queryKey: ['similar-story', entityId],
    queryFn: () => fetchSimilar(entityId!),
    enabled: !!entityId,
    staleTime: 60 * 60 * 1000, // 1 hour
  });

  const aiQuery = useQuery({
    queryKey: ['ai-insights-story', certNumber],
    queryFn: () => fetchAIInsights(certNumber!),
    enabled: !!certNumber,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
    retry: false,
  });

  return {
    institution: storyQuery.data?.institution ?? null,
    history: storyQuery.data?.financial_history ?? [],
    branchCount: storyQuery.data?.branch_count ?? 0,
    isLoading: storyQuery.isLoading,
    error: storyQuery.error,

    similar: similarQuery.data?.similar ?? [],
    embeddingAvailable: similarQuery.data?.embedding_available ?? false,
    similarLoading: similarQuery.isLoading,

    aiInsights: aiQuery.data ?? null,
    aiLoading: aiQuery.isLoading,
    aiError: aiQuery.isError,
  };
}
