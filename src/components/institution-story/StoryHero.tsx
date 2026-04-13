import { useState } from 'react';
import { Building2, MapPin, Calendar, Shield, ExternalLink, Database } from 'lucide-react';
import { Badge, WatchlistButton } from '@/components/ui';
import { formatDate } from '@/lib/format';
import type { Institution } from '@/types/institution';

interface StoryHeroProps {
  institution: Institution;
  lede: string | null;
  ledeLoading: boolean;
}

function getDomain(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    const url = website.startsWith('http') ? website : `https://${website}`;
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

const CA_PROVINCE_CODES = new Set([
  'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT',
]);

function isCanadian(institution: Institution): boolean {
  if (['osfi', 'rpaa', 'ciro', 'fintrac'].includes(institution.source)) return true;
  if (institution.country === 'CA') return true;
  if (institution.state && CA_PROVINCE_CODES.has(institution.state)) return true;
  return false;
}

function charterLabel(type: string | null): string | null {
  if (!type) return null;
  const labels: Record<string, string> = {
    commercial: 'Commercial Bank',
    savings: 'Savings Bank',
    savings_association: 'Savings Association',
    credit_union: 'Credit Union',
    psp: 'Payment Service Provider',
    investment_dealer: 'Investment Dealer',
    mutual_fund_dealer: 'Mutual Fund Dealer',
    crypto_exchange: 'Crypto Exchange',
    money_service: 'Money Service Business',
  };
  return labels[type] ?? type.replace(/_/g, ' ');
}

function BankLogo({ institution }: { institution: Institution }) {
  const [failed, setFailed] = useState(false);
  const domain = getDomain(institution.website);

  if (domain && !failed) {
    return (
      <div className="flex items-center justify-center h-16 w-16 rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden shrink-0">
        <img
          src={`https://logo.clearbit.com/${domain}`}
          alt={`${institution.name} logo`}
          className="h-12 w-12 object-contain"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  const initials = institution.name
    .split(/\s+/)
    .filter((w) => /^[A-Z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('');

  return (
    <div className="flex items-center justify-center h-16 w-16 rounded-xl bg-blue-600 shrink-0">
      {initials ? (
        <span className="text-white text-xl font-bold">{initials}</span>
      ) : (
        <Building2 className="h-8 w-8 text-white" />
      )}
    </div>
  );
}

export function StoryHero({ institution, lede, ledeLoading }: StoryHeroProps) {
  const flag = isCanadian(institution) ? '🇨🇦' : '🇺🇸';
  const location = [institution.city, institution.state].filter(Boolean).join(', ');
  const charter = charterLabel(institution.charter_type);
  const established = institution.established_date ? formatDate(institution.established_date) : null;

  return (
    <section id="section-overview" className="bg-white py-12 px-8">
      {/* Name + logo row */}
      <div className="flex items-start gap-5 mb-6">
        <BankLogo institution={institution} />
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold text-slate-900 leading-tight mb-2">
            {institution.name}
          </h1>

          {/* Subtitle meta row */}
          <p className="text-base text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-1">
            {location && (
              <>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {location} {flag}
                </span>
                <span className="text-slate-300">·</span>
              </>
            )}
            {institution.regulator && (
              <>
                <span className="inline-flex items-center gap-1">
                  <Shield className="h-3.5 w-3.5" />
                  {institution.regulator}
                </span>
                <span className="text-slate-300">·</span>
              </>
            )}
            {charter && (
              <>
                <span>{charter}</span>
                <span className="text-slate-300">·</span>
              </>
            )}
            {established && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Est. {established}
              </span>
            )}
          </p>

          {/* Badges */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Badge color={institution.active ? 'green' : 'red'}>
              {institution.active ? 'Active' : 'Inactive'}
            </Badge>
            <span className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-100 rounded-md px-2 py-0.5">
              <Database className="h-3 w-3" />
              {institution.source.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <WatchlistButton certNumber={institution.cert_number} size="md" />
          {institution.website && (
            <a
              href={institution.website.startsWith('http') ? institution.website : `https://${institution.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Website
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* AI lede paragraph */}
      {ledeLoading ? (
        <div className="max-w-3xl space-y-2">
          <div className="h-4 bg-slate-200 animate-pulse rounded-md w-full" />
          <div className="h-4 bg-slate-200 animate-pulse rounded-md w-5/6" />
        </div>
      ) : lede ? (
        <p className="text-lg text-slate-700 leading-relaxed max-w-3xl">
          {lede.split('\n\n')[0].trim()}
        </p>
      ) : null}

      {institution.data_as_of && (
        <p className="text-xs text-slate-400 mt-4">
          Data as of {institution.data_as_of} · FDIC Cert #{institution.cert_number}
        </p>
      )}
    </section>
  );
}
