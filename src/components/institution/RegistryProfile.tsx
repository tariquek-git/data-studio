import { ExternalLink, Calendar, MapPin, Globe, Hash, Shield, Zap, RefreshCw, Building2 } from 'lucide-react';
import { Card } from '@/components/ui';
import type { Institution } from '@/types/institution';

interface RegistryProfileProps {
  institution: Institution;
}

function getRaw(raw: Record<string, unknown> | null, key: string): string | null {
  if (!raw || raw[key] == null) return null;
  return String(raw[key]);
}

function getRawArray(raw: Record<string, unknown> | null, key: string): string[] {
  if (!raw) return [];
  const v = raw[key];
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string' && v.length) return v.split(',').map(s => s.trim());
  return [];
}

const SERVICE_LABELS: Record<string, string> = {
  virtual_currency: '₿ Virtual Currency',
  money_transfer: '↔ Money Transfer',
  foreign_exchange: '💱 Foreign Exchange',
  payment_processing: '⚡ Payment Processing',
  issuing: '💳 Card Issuing',
  acquiring: '🛒 Merchant Acquiring',
  open_banking: '🔓 Open Banking',
  remittance: '↔ Remittance',
  prepaid: '💳 Prepaid Cards',
  cheque_cashing: '📄 Cheque Cashing',
};

function ContextBanner({ institution }: { institution: Institution }) {
  type BannerConfig = { title: string; description: string; color: string; icon: string };

  const map: Partial<Record<Institution['source'], BannerConfig>> = {
    rpaa: {
      title: 'Payment Service Provider — Bank of Canada RPAA',
      description:
        'Registered with the Bank of Canada under the Retail Payment Activities Act. PSPs process retail payment transactions in Canada but are not deposit-takers — client funds are not CDIC insured.',
      color: 'bg-green-50 border-green-200 text-green-800',
      icon: '💳',
    },
    ciro: {
      title: institution.charter_type === 'mutual_fund_dealer' ? 'Mutual Fund Dealer — CIRO' : 'Investment Dealer — CIRO',
      description:
        'Regulated by the Canadian Investment Regulatory Organization (CIRO), the national SRO for investment dealers. Client assets are protected by the Canadian Investor Protection Fund (CIPF) up to $1M per account category.',
      color: 'bg-indigo-50 border-indigo-200 text-indigo-800',
      icon: '📈',
    },
    fintrac: {
      title:
        institution.charter_type === 'crypto_exchange'
          ? 'Virtual Asset Service Provider (VASP) — FINTRAC'
          : 'Money Service Business — FINTRAC',
      description:
        institution.charter_type === 'crypto_exchange'
          ? 'Registered with FINTRAC as a Virtual Currency Dealer under the Proceeds of Crime (Money Laundering) Act. Subject to AML/CFT transaction reporting. Crypto assets are not CDIC insured.'
          : 'Registered with FINTRAC as a Money Service Business. Subject to AML/CFT obligations: transaction monitoring, suspicious activity reports, and KYC requirements.',
      color: 'bg-teal-50 border-teal-200 text-teal-800',
      icon: '🔐',
    },
    fincen: {
      title:
        institution.charter_type === 'crypto_exchange'
          ? 'Crypto Exchange — FinCEN Registered'
          : 'Money Service Business — FinCEN',
      description:
        'Registered with FinCEN (US Treasury) under the Bank Secrecy Act. Subject to AML program requirements, Suspicious Activity Reports (SARs), Currency Transaction Reports (CTRs), and state-level money transmitter licensing.',
      color: 'bg-amber-50 border-amber-200 text-amber-800',
      icon: '🏛️',
    },
  };

  const config = map[institution.source];
  if (!config) return null;

  return (
    <div className={`rounded-xl border px-4 py-3 ${config.color}`}>
      <p className="text-sm font-semibold mb-1">{config.icon} {config.title}</p>
      <p className="text-xs leading-relaxed opacity-90">{config.description}</p>
    </div>
  );
}

function KeyFact({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <Icon className="h-3.5 w-3.5 text-surface-400 mt-0.5 shrink-0" />
      <div>
        <p className="text-xs text-surface-400">{label}</p>
        <p className="font-medium text-surface-200">{value}</p>
      </div>
    </div>
  );
}

export function RegistryProfile({ institution }: RegistryProfileProps) {
  const raw = institution.raw_data as Record<string, unknown> | null;
  const services = getRawArray(raw, 'services');
  const regNumber = getRaw(raw, 'registration_number') ?? getRaw(raw, 'nmls_id') ?? getRaw(raw, 'reg_number');
  const regDate = getRaw(raw, 'registration_date') ?? getRaw(raw, 'registered_date');
  const fiType = getRaw(raw, 'fi_type') ?? getRaw(raw, 'firm_type') ?? getRaw(raw, 'fi_group');
  const isCA = ['rpaa', 'ciro', 'fintrac', 'osfi'].includes(institution.source);

  const regulatorLabel =
    institution.source === 'rpaa' ? 'Bank of Canada' :
    institution.source === 'ciro' ? 'CIRO' :
    institution.source === 'fintrac' ? 'FINTRAC' :
    institution.source === 'fincen' ? 'FinCEN (US Treasury)' :
    institution.regulator ?? '—';

  const legalFramework =
    institution.source === 'rpaa' ? 'Retail Payment Activities Act (RPAA), 2024' :
    institution.source === 'ciro' ? 'CIRO Rules — SRO under NI 31-103' :
    institution.source === 'fintrac' ? 'Proceeds of Crime (PCMLTFA) Act' :
    institution.source === 'fincen' ? 'Bank Secrecy Act (BSA), 31 USC 5311' :
    '—';

  return (
    <div className="space-y-4">
      {/* Context banner */}
      <ContextBanner institution={institution} />

      {/* Three-column cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Registration card */}
        <Card>
          <p className="text-[11px] font-semibold text-surface-400 uppercase tracking-wide mb-3">Registration</p>
          <div className="space-y-3">
            {regNumber && <KeyFact icon={Hash} label="Registration #" value={regNumber} />}
            {regDate && <KeyFact icon={Calendar} label="Registered" value={regDate} />}
            <KeyFact
              icon={Shield}
              label="Status"
              value={institution.active ? 'Active' : 'Inactive / Revoked'}
            />
            {fiType && (
              <KeyFact icon={Building2} label="Entity Type" value={fiType.replace(/_/g, ' ')} />
            )}
          </div>
        </Card>

        {/* Location card */}
        <Card>
          <p className="text-[11px] font-semibold text-surface-400 uppercase tracking-wide mb-3">Location</p>
          <div className="space-y-3">
            {(institution.city || institution.state) && (
              <KeyFact
                icon={MapPin}
                label="Headquarters"
                value={`${[institution.city, institution.state].filter(Boolean).join(', ')} ${isCA ? '🇨🇦' : '🇺🇸'}`}
              />
            )}
            {institution.legal_name && institution.legal_name !== institution.name && (
              <KeyFact icon={Building2} label="Legal Name" value={institution.legal_name} />
            )}
            {institution.website && (
              <div className="flex items-start gap-2.5 text-sm">
                <Globe className="h-3.5 w-3.5 text-surface-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-surface-400">Website</p>
                  <a
                    href={institution.website.startsWith('http') ? institution.website : `https://${institution.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary-600 hover:underline inline-flex items-center gap-1"
                  >
                    {institution.website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Regulator card */}
        <Card>
          <p className="text-[11px] font-semibold text-surface-400 uppercase tracking-wide mb-3">Regulatory Framework</p>
          <div className="space-y-3">
            <KeyFact icon={Shield} label="Regulator" value={regulatorLabel} />
            <KeyFact icon={Zap} label="Legal Basis" value={legalFramework} />
            {institution.data_as_of && (
              <KeyFact icon={RefreshCw} label="Data as of" value={institution.data_as_of} />
            )}
          </div>
        </Card>
      </div>

      {/* Services */}
      {services.length > 0 && (
        <Card>
          <p className="text-[11px] font-semibold text-surface-400 uppercase tracking-wide mb-3">Registered Services</p>
          <div className="flex flex-wrap gap-2">
            {services.map(s => (
              <span
                key={s}
                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-surface-800 text-surface-300 border border-surface-700"
              >
                {SERVICE_LABELS[s] ?? s.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* CIRO-specific: investor protection note */}
      {institution.source === 'ciro' && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs text-indigo-700 leading-relaxed">
          <strong>CIPF Coverage:</strong> Client assets held at CIRO member firms are eligible for Canadian Investor Protection Fund coverage up to $1,000,000 per account category (general accounts, RRSPs, RRIFs, TFSAs). CIPF does not cover market losses.
        </div>
      )}

      {/* RPAA-specific: what this means for fintechs */}
      {institution.source === 'rpaa' && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-xs text-green-800 leading-relaxed">
          <strong>About RPAA Registration:</strong> Since November 2024, all companies processing retail payments in Canada must register with the Bank of Canada. Registration is not approval — it demonstrates the PSP is subject to Bank of Canada oversight for operational risk and safeguarding of end-user funds.
        </div>
      )}

      {/* No financial data notice */}
      <div className="rounded-xl border border-surface-700 bg-surface-900 px-4 py-3 text-xs text-surface-400 text-center">
        Financial statements not available — this institution does not file call reports with banking regulators and is not a deposit-taking entity.
      </div>
    </div>
  );
}
