import { TrendingUp, Info, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui';
import type { AIInsightsResponse } from '@/hooks/useInstitutionStory';

interface StoryInsightsProps {
  data: AIInsightsResponse | null;
  isLoading: boolean;
  isError: boolean;
}

type InsightSentiment = 'positive' | 'warning' | 'info';

function detectSentiment(text: string): InsightSentiment {
  const lower = text.toLowerCase();
  const positiveWords = ['strong', 'high', 'above', 'growth', 'improve', 'healthy', 'solid', 'best', 'top', 'exceed'];
  const warningWords = ['watch', 'risk', 'concern', 'below', 'weak', 'decline', 'low', 'loss', 'caution', 'pressure'];
  const posScore = positiveWords.filter((w) => lower.includes(w)).length;
  const warnScore = warningWords.filter((w) => lower.includes(w)).length;
  if (warnScore > posScore) return 'warning';
  if (posScore > 0) return 'positive';
  return 'info';
}

function InsightIcon({ sentiment }: { sentiment: InsightSentiment }) {
  if (sentiment === 'positive') {
    return <TrendingUp className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />;
  }
  if (sentiment === 'warning') {
    return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />;
  }
  return <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />;
}

function parseBullets(summary: string): string[] {
  // Split on bullet chars, newlines, or double newlines into 3-5 items
  const lines = summary
    .split(/\n+/)
    .map((l) => l.replace(/^[\s•\-–—*]+/, '').trim())
    .filter((l) => l.length > 0);

  if (lines.length >= 3) return lines.slice(0, 5);

  // Fall back: split paragraphs into sentences, take up to 5
  const sentences = summary
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20)
    .slice(0, 5);

  return sentences.length >= 2 ? sentences : [summary.trim()];
}

export function StoryInsights({ data, isLoading, isError }: StoryInsightsProps) {
  // Don't render the section at all if AI is unavailable
  if (isError || (!isLoading && !data)) return null;

  const bullets = data ? parseBullets(data.summary) : [];

  return (
    <section id="section-insights" className="py-12 px-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 border-t border-slate-200" />
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap">
          AI Insights
        </h2>
        <div className="flex-1 border-t border-slate-200" />
      </div>

      <div className="rounded-xl bg-gradient-to-br from-slate-50 to-blue-50/50 border-l-4 border-blue-400 p-6">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-4 w-4 shrink-0 mt-0.5 rounded-full" />
                <Skeleton className={`h-4 ${i === 3 ? 'w-2/3' : 'w-full'}`} />
              </div>
            ))}
          </div>
        ) : (
          <ul className="space-y-3">
            {bullets.map((bullet, i) => {
              const sentiment = detectSentiment(bullet);
              return (
                <li key={i} className="flex items-start gap-3">
                  <InsightIcon sentiment={sentiment} />
                  <span className="text-sm text-slate-700 leading-relaxed">{bullet}</span>
                </li>
              );
            })}
          </ul>
        )}

        {data && (
          <p className="mt-4 pt-3 border-t border-slate-200/50 text-xs text-slate-400">
            AI-generated analysis · Not financial advice · Powered by Claude
            {data.cached && data.generated_at && (
              <> · Cached</>
            )}
          </p>
        )}
      </div>
    </section>
  );
}
