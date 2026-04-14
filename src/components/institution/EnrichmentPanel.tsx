import { useQuery } from '@tanstack/react-query';
import { ExternalLink, AlertTriangle, CheckCircle, Info, FileText, TrendingUp, BookOpen, Shield, Gavel } from 'lucide-react';
import { Card } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import type { Institution } from '@/types/institution';

interface EnrichmentData {
  cra: { rating: string; rating_code: number; exam_date: string | null; source_url: string } | null;
  enforcement: Array<{ date: string; type: string; active: boolean; termination_date: string | null; penalty_amount: number | null }>;
  sec: {
    entity_name: string; cik: string; ticker: string | null; exchange: string | null;
    edgar_url: string;
    recent_filings: Array<{ form: string; date: string; url: string }>;
  } | null;
  wiki: { title: string; extract: string; thumbnail: string | null; url: string } | null;
  rssd_id: number | null;
}

interface Props {
  institution: Institution;
}

async function fetchEnrichment(certNumber: number): Promise<EnrichmentData> {
  const res = await fetch(`/api/institutions/${certNumber}/enrich`);
  if (!res.ok) throw new Error('Enrichment unavailable');
  return res.json();
}

const CRA_COLORS: Record<number, { text: string; bg: string; border: string; icon: React.ElementType }> = {
  1: { text: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', icon: CheckCircle },
  2: { text: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: CheckCircle },
  3: { text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: AlertTriangle },
  4: { text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: AlertTriangle },
};

export function EnrichmentPanel({ institution }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['enrich', institution.cert_number],
    queryFn: () => fetchEnrichment(institution.cert_number),
    staleTime: 24 * 60 * 60 * 1000, // 24h
    retry: false,
  });

  const hasAnything = data && (data.wiki || data.cra || data.sec || data.enforcement.length > 0);

  if (isLoading) {
    return (
      <div className="h-6 flex items-center gap-2 text-xs text-surface-400">
        <div className="h-3 w-3 rounded-full border-2 border-surface-600 border-t-primary-500 animate-spin" />
        Loading public records…
      </div>
    );
  }

  if (!data || !hasAnything) return null;

  const activeEnforcement = data.enforcement.filter(e => e.active);
  const pastEnforcement = data.enforcement.filter(e => !e.active);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-surface-300 flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-primary-500" />
        Public Records & Filings
        <span className="text-xs font-normal text-surface-400 ml-1">
          Live data · SEC EDGAR · FDIC · Wikipedia
        </span>
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Wikipedia summary */}
        {data.wiki && (
          <Card>
            <div className="flex items-start gap-3">
              {data.wiki.thumbnail && (
                <img
                  src={data.wiki.thumbnail}
                  alt={data.wiki.title}
                  className="h-14 w-14 rounded-lg object-cover shrink-0 border border-surface-700"
                />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <Info className="h-3.5 w-3.5 text-surface-400 shrink-0" />
                  <span className="text-[11px] font-semibold text-surface-400 uppercase tracking-wide">About</span>
                  <a
                    href={data.wiki.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto text-[11px] text-primary-500 hover:underline inline-flex items-center gap-0.5"
                  >
                    Wikipedia <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
                <p className="text-sm text-surface-300 leading-relaxed">{data.wiki.extract}</p>
              </div>
            </div>
          </Card>
        )}

        {/* SEC EDGAR */}
        {data.sec && (
          <Card>
            <div className="flex items-center gap-1.5 mb-3">
              <FileText className="h-3.5 w-3.5 text-surface-400" />
              <span className="text-[11px] font-semibold text-surface-400 uppercase tracking-wide">SEC EDGAR</span>
              {data.sec.ticker && (
                <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-primary-100 text-primary-700">
                  {data.sec.ticker}
                  {data.sec.exchange && <span className="font-normal ml-1 opacity-70">· {data.sec.exchange}</span>}
                </span>
              )}
              <a
                href={data.sec.edgar_url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-[11px] text-primary-500 hover:underline inline-flex items-center gap-0.5"
              >
                All filings <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </div>

            <p className="text-xs text-surface-500 mb-2">{data.sec.entity_name} · CIK {data.sec.cik}</p>

            {data.sec.recent_filings.length > 0 && (
              <div className="space-y-1">
                {data.sec.recent_filings.map((f, i) => (
                  <a
                    key={i}
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs hover:bg-surface-900 px-2 py-1 rounded-lg transition-colors group"
                  >
                    <span className={`font-semibold px-1.5 py-0.5 rounded text-[10px] ${
                      f.form === '10-K' ? 'bg-blue-100 text-blue-700' : 'bg-surface-800 text-surface-400'
                    }`}>{f.form}</span>
                    <span className="text-surface-400">{f.date}</span>
                    <ExternalLink className="h-3 w-3 text-surface-300 group-hover:text-primary-500 ml-auto" />
                  </a>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* CRA Rating */}
        {data.cra && (
          <Card>
            <div className="flex items-center gap-1.5 mb-2">
              <Shield className="h-3.5 w-3.5 text-surface-400" />
              <span className="text-[11px] font-semibold text-surface-400 uppercase tracking-wide">CRA Rating</span>
              <a
                href="https://www.ffiec.gov/craratings/"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-[11px] text-primary-500 hover:underline inline-flex items-center gap-0.5"
              >
                FFIEC <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </div>
            {(() => {
              const style = CRA_COLORS[data.cra!.rating_code] ?? CRA_COLORS[2];
              const Icon = style.icon;
              return (
                <div className={`rounded-lg border px-3 py-2.5 ${style.bg} ${style.border}`}>
                  <div className={`flex items-center gap-2 font-semibold text-sm ${style.text}`}>
                    <Icon className="h-4 w-4 shrink-0" />
                    {data.cra!.rating}
                  </div>
                  {data.cra!.exam_date && (
                    <p className={`text-xs mt-1 opacity-75 ${style.text}`}>
                      Most recent exam: {data.cra!.exam_date}
                    </p>
                  )}
                  <p className={`text-xs mt-1 opacity-60 ${style.text}`}>
                    Community Reinvestment Act examination by primary regulator
                  </p>
                </div>
              );
            })()}
          </Card>
        )}

        {/* RSSD / Fed link */}
        {data.rssd_id && data.rssd_id > 0 && (
          <div className="flex items-center gap-2 text-xs text-surface-500 px-1">
            <TrendingUp className="h-3.5 w-3.5 text-surface-400 shrink-0" />
            Fed RSSD ID: {data.rssd_id} ·{' '}
            <a
              href={`https://www.ffiec.gov/npw/FinancialReport/ReturnFinancialReport?selectedyear=2024&rpt=BHC&selectedyear=2024&rssd=${data.rssd_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:underline inline-flex items-center gap-0.5"
            >
              FFIEC BHC Performance Report <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>
        )}
      </div>

      {/* Enforcement Actions */}
      {data.enforcement.length > 0 && (
        <Card className={activeEnforcement.length > 0 ? 'border-red-200 bg-red-50' : ''}>
          <div className="flex items-center gap-1.5 mb-3">
            <Gavel className={`h-3.5 w-3.5 ${activeEnforcement.length > 0 ? 'text-red-500' : 'text-surface-400'}`} />
            <span className={`text-[11px] font-semibold uppercase tracking-wide ${activeEnforcement.length > 0 ? 'text-red-600' : 'text-surface-400'}`}>
              Enforcement Actions
            </span>
            {activeEnforcement.length > 0 && (
              <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                {activeEnforcement.length} Active
              </span>
            )}
            <a
              href={`https://banks.data.fdic.gov/api/enforcement?filters=CERT:${institution.cert_number}&limit=10`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-[11px] text-primary-500 hover:underline inline-flex items-center gap-0.5"
            >
              FDIC Source <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>

          <div className="space-y-2">
            {data.enforcement.map((action, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 text-xs px-3 py-2 rounded-lg ${
                  action.active ? 'bg-red-100' : 'bg-surface-900'
                }`}
              >
                <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${action.active ? 'bg-red-500' : 'bg-surface-300'}`} />
                <div className="min-w-0 flex-1">
                  <span className={`font-medium ${action.active ? 'text-red-700' : 'text-surface-400'}`}>
                    {action.type}
                  </span>
                  <span className="text-surface-400 ml-2">{action.date}</span>
                  {action.penalty_amount && (
                    <span className="ml-2 text-red-600 font-semibold">
                      {formatCurrency(action.penalty_amount)} penalty
                    </span>
                  )}
                </div>
                {!action.active && action.termination_date && (
                  <span className="text-surface-400 shrink-0">Terminated {action.termination_date}</span>
                )}
              </div>
            ))}
          </div>

          {pastEnforcement.length > 0 && activeEnforcement.length === 0 && (
            <p className="text-xs text-surface-400 mt-2">All prior enforcement actions have been terminated.</p>
          )}
        </Card>
      )}

      <p className="text-[11px] text-surface-300 text-right">
        Sources: FDIC BankFind · SEC EDGAR · Wikipedia · FFIEC · refreshed every 24h
      </p>
    </div>
  );
}
