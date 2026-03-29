import { useState } from 'react';
import { Sparkles, Loader2, AlertCircle, Clock } from 'lucide-react';
import { Card, Badge, Button } from '@/components/ui';

interface AISummaryProps {
  certNumber: number;
}

type Status = 'idle' | 'loading' | 'done' | 'error';

interface SummaryResponse {
  summary: string;
  generated_at?: string;
  cached?: boolean;
}

export function AISummary({ certNumber }: AISummaryProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [summaryData, setSummaryData] = useState<SummaryResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  async function handleGenerate() {
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await fetch('/api/ai/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certNumber }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const data = (await res.json()) as SummaryResponse;
      setSummaryData(data);
      setStatus('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  }

  function formatDate(isoString: string): string {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return isoString;
    }
  }

  // Idle state — just show the button
  if (status === 'idle') {
    return (
      <div className="flex justify-start">
        <Button variant="secondary" size="md" onClick={handleGenerate}>
          <Sparkles className="h-4 w-4 text-purple-500" />
          Generate AI Summary
        </Button>
      </div>
    );
  }

  // Loading state
  if (status === 'loading') {
    return (
      <Card>
        <div className="flex items-center gap-3 py-2">
          <Loader2 className="h-5 w-5 text-purple-500 animate-spin shrink-0" />
          <p className="text-sm text-surface-500">Generating analyst brief…</p>
        </div>
      </Card>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <Card>
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-red-600 font-medium">Failed to generate summary</p>
            <p className="text-xs text-surface-400 mt-0.5">{errorMsg}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleGenerate}>
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  // Done — show the summary card
  const summary = summaryData?.summary ?? '';
  const isCached = summaryData?.cached === true;
  const generatedAt = summaryData?.generated_at;

  const cacheLabel = isCached && generatedAt
    ? `Cached · Generated ${formatDate(generatedAt)}`
    : 'Generated just now';

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-500" />
          <h3 className="text-sm font-semibold text-surface-800">AI Analysis</h3>
          <Badge color="purple">AI</Badge>
          {isCached && (
            <span className="inline-flex items-center gap-1 text-xs text-surface-400">
              <Clock className="h-3 w-3" />
              {cacheLabel}
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={handleGenerate}>
          Regenerate
        </Button>
      </div>

      <div className="space-y-3">
        {summary.split('\n\n').filter(Boolean).map((para, i) => (
          <p key={i} className="text-sm text-surface-700 leading-relaxed">
            {para.trim()}
          </p>
        ))}
      </div>

      <p className="mt-4 text-xs text-surface-400 border-t border-surface-100 pt-3">
        AI-generated analysis · Not financial advice · Powered by Claude
        {!isCached && generatedAt && (
          <span className="ml-2">· {cacheLabel}</span>
        )}
      </p>
    </Card>
  );
}
