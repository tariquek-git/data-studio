import { useState } from 'react';
import type { ReactNode } from 'react';
import { Building2, MapPin, ExternalLink, Calendar, Shield } from 'lucide-react';
import { Badge } from '@/components/ui';
import { formatDate, formatCurrency } from '@/lib/format';
import type { Institution } from '@/types/institution';
import { DataSourceBadge } from './DataSourceBadge';

interface ProfileHeaderProps {
  institution: Institution;
  /** Optional action buttons rendered next to the "Visit Website" button */
  actions?: ReactNode;
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

function getCountryFlag(institution: Institution): string {
  if (institution.source === 'osfi' || institution.source === 'rpaa' || institution.source === 'ciro' || institution.source === 'fintrac') return '🇨🇦';
  if (institution.country === 'CA') return '🇨🇦';
  if (institution.state && CA_PROVINCE_CODES.has(institution.state)) return '🇨🇦';
  return '🇺🇸';
}

function charterBadge(type: string | null) {
  if (!type) return null;
  const colorMap: Record<string, 'blue' | 'green' | 'purple' | 'indigo' | 'gray' | 'orange'> = {
    commercial: 'blue',
    savings: 'purple',
    savings_association: 'purple',
    credit_union: 'green',
    psp: 'purple',
    investment_dealer: 'indigo',
    mutual_fund_dealer: 'purple',
    crypto_exchange: 'orange',
    money_service: 'gray',
  };
  return (
    <Badge color={colorMap[type] ?? 'gray'}>
      {type.replace(/_/g, ' ')}
    </Badge>
  );
}

function regulatorBadge(reg: string | null) {
  if (!reg) return null;
  const colorMap: Record<string, 'indigo' | 'blue' | 'green' | 'yellow' | 'gray'> = {
    OCC: 'indigo',
    FDIC: 'blue',
    FRB: 'green',
    NCUA: 'yellow',
    OSFI: 'gray',
  };
  return <Badge color={colorMap[reg] ?? 'gray'}>{reg}</Badge>;
}

function BankLogo({ institution }: { institution: Institution }) {
  const [failed, setFailed] = useState(false);
  const domain = getDomain(institution.website);

  if (domain && !failed) {
    return (
      <div className="flex items-center justify-center h-14 w-14 rounded-xl bg-white border border-surface-200 shadow-sm overflow-hidden shrink-0">
        <img
          src={`https://logo.clearbit.com/${domain}`}
          alt={`${institution.name} logo`}
          className="h-10 w-10 object-contain"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  // Fallback: initials
  const initials = institution.name
    .split(/\s+/)
    .filter(w => /^[A-Z]/.test(w))
    .slice(0, 2)
    .map(w => w[0])
    .join('');

  return (
    <div className="flex items-center justify-center h-14 w-14 rounded-xl bg-primary-600 shrink-0">
      {initials ? (
        <span className="text-white text-lg font-bold">{initials}</span>
      ) : (
        <Building2 className="h-7 w-7 text-white" />
      )}
    </div>
  );
}

const REGISTRY_SOURCES: Institution['source'][] = ['rpaa', 'ciro', 'fintrac', 'fincen'];

export function ProfileHeader({ institution, actions }: ProfileHeaderProps) {
  const isRegistryOnly = REGISTRY_SOURCES.includes(institution.source);

  const heroStats = [
    { label: 'Total Assets', value: formatCurrency(institution.total_assets) },
    { label: 'Total Deposits', value: formatCurrency(institution.total_deposits) },
    { label: 'Net Loans', value: formatCurrency(institution.total_loans) },
    { label: 'Net Income', value: formatCurrency(institution.net_income), color: institution.net_income != null ? (institution.net_income >= 0 ? 'text-green-600' : 'text-red-600') : undefined },
    { label: 'ROA', value: institution.roa != null ? `${institution.roa.toFixed(2)}%` : '—', color: institution.roa != null ? (institution.roa >= 1 ? 'text-green-600' : institution.roa >= 0 ? 'text-amber-600' : 'text-red-600') : undefined },
    { label: 'ROE', value: institution.roi != null ? `${institution.roi.toFixed(1)}%` : '—', color: institution.roi != null ? (institution.roi >= 8 ? 'text-green-600' : institution.roi >= 0 ? 'text-amber-600' : 'text-red-600') : undefined },
  ];

  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
      {/* Top band */}
      <div className="p-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-4">
          <BankLogo institution={institution} />
          <div className="space-y-2 min-w-0">
            <h1 className="text-2xl font-bold text-surface-900 leading-tight">{institution.name}</h1>
            {institution.legal_name && institution.legal_name !== institution.name && (
              <p className="text-sm text-surface-500">{institution.legal_name}</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {charterBadge(institution.charter_type)}
              {regulatorBadge(institution.regulator)}
              <Badge color={institution.active ? 'green' : 'red'}>
                {institution.active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-surface-500">
              {(institution.city || institution.state) && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {[institution.city, institution.state].filter(Boolean).join(', ')}
                  <span title={getCountryFlag(institution) === '🇨🇦' ? 'Canada' : 'United States'}>
                    {getCountryFlag(institution)}
                  </span>
                </span>
              )}
              {institution.established_date && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Est. {formatDate(institution.established_date)}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Shield className="h-3.5 w-3.5" />
                Cert #{institution.cert_number}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {institution.website && (
            <a
              href={institution.website.startsWith('http') ? institution.website : `https://${institution.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors"
            >
              Visit Website
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {actions}
        </div>
      </div>

      {/* Hero stats strip — deposit-takers only */}
      {!isRegistryOnly && (
        <div className="grid grid-cols-3 sm:grid-cols-6 border-t border-surface-100 divide-x divide-surface-100">
          {heroStats.map((s) => (
            <div key={s.label} className="px-4 py-3 text-center">
              <p className="text-[11px] font-medium text-surface-400 uppercase tracking-wide mb-0.5">{s.label}</p>
              <p className={`text-base font-bold ${s.color ?? 'text-surface-900'}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Data source audit footer */}
      <DataSourceBadge institution={institution} />
    </div>
  );
}
