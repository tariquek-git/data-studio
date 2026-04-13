import { useState, useCallback } from 'react';
import { ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui';
import { BalanceSheetFlow } from '@/components/institution/BalanceSheetFlow';
import { IncomeFlow } from '@/components/institution/IncomeFlow';
import type { Institution } from '@/types/institution';

interface StoryDeepDiveProps {
  institution: Institution;
}

// ── Capabilities ──────────────────────────────────────────────────────────

interface CapabilitiesData {
  cert_number: number;
  institution_name: string;
  capabilities: {
    fed_master_account: boolean | null;
    fedwire_participant: boolean | null;
    nacha_odfi: boolean | null;
    nacha_rdfi: boolean | null;
    swift_member: boolean | null;
    visa_principal: boolean | null;
    mastercard_principal: boolean | null;
    amex_issuer: boolean | null;
    issues_credit_cards: boolean | null;
    issues_debit_cards: boolean | null;
    issues_prepaid: boolean | null;
    issues_commercial_cards: boolean | null;
    baas_platform: boolean | null;
    treasury_management: boolean | null;
    notes: string | null;
  };
}

async function fetchCapabilities(certNumber: number): Promise<CapabilitiesData> {
  const res = await fetch(`/api/institutions/${certNumber}/capabilities`);
  if (!res.ok) throw new Error('Failed to load capabilities');
  return res.json() as Promise<CapabilitiesData>;
}

function CapabilityRow({ label, value }: { label: string; value: boolean | null }) {
  const isDefined = value != null;
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      {!isDefined ? (
        <span className="text-xs text-slate-400">Unknown</span>
      ) : value ? (
        <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Yes</span>
      ) : (
        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">No</span>
      )}
    </div>
  );
}

function CapabilitiesPanel({ certNumber }: { certNumber: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['capabilities', certNumber],
    queryFn: () => fetchCapabilities(certNumber),
    staleTime: 30 * 60 * 1000,
  });

  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (!data) return <p className="text-sm text-slate-400">No capability data available.</p>;

  const cap = data.capabilities;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Payment Rails</p>
        <CapabilityRow label="Fed Master Account" value={cap.fed_master_account} />
        <CapabilityRow label="Fedwire Participant" value={cap.fedwire_participant} />
        <CapabilityRow label="NACHA ODFI" value={cap.nacha_odfi} />
        <CapabilityRow label="NACHA RDFI" value={cap.nacha_rdfi} />
        <CapabilityRow label="SWIFT Member" value={cap.swift_member} />
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Card Programs</p>
        <CapabilityRow label="Visa Principal" value={cap.visa_principal} />
        <CapabilityRow label="Mastercard Principal" value={cap.mastercard_principal} />
        <CapabilityRow label="Amex Issuer" value={cap.amex_issuer} />
        <CapabilityRow label="Issues Credit Cards" value={cap.issues_credit_cards} />
        <CapabilityRow label="Issues Debit Cards" value={cap.issues_debit_cards} />
        <CapabilityRow label="Issues Prepaid Cards" value={cap.issues_prepaid} />
        <CapabilityRow label="Commercial Cards" value={cap.issues_commercial_cards} />
        <CapabilityRow label="BaaS Platform" value={cap.baas_platform} />
        <CapabilityRow label="Treasury Management" value={cap.treasury_management} />
      </div>
      {cap.notes && (
        <div className="col-span-full mt-3">
          <p className="text-xs text-slate-500 italic">{cap.notes}</p>
        </div>
      )}
    </div>
  );
}

// ── Accordion ─────────────────────────────────────────────────────────────

interface AccordionItemProps {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function AccordionItem({ title, isOpen, onToggle, children }: AccordionItemProps) {
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full py-4 flex justify-between items-center cursor-pointer hover:bg-slate-50 rounded-lg px-4 transition-colors text-left"
      >
        <span className="text-sm font-semibold text-slate-700">{title}</span>
        <ChevronRight
          className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
        />
      </button>
      {isOpen && (
        <div className="px-4 pb-6">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

function getRawField(raw: Record<string, unknown> | null, field: string): number | null {
  if (!raw || raw[field] == null) return null;
  const v = Number(raw[field]);
  return isNaN(v) ? null : v * 1000;
}

export function StoryDeepDive({ institution }: StoryDeepDiveProps) {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const raw = institution.raw_data;

  const incomeData = {
    interest_income: getRawField(raw, 'INTINC'),
    noninterest_income: getRawField(raw, 'NONII'),
    interest_expense: getRawField(raw, 'EINTEXP'),
    noninterest_expense: getRawField(raw, 'ELNANTR'),
    provision_for_losses: getRawField(raw, 'ELNATR'),
    net_income: institution.net_income,
  };

  const balanceData = {
    total_assets: institution.total_assets,
    total_deposits: institution.total_deposits,
    total_loans: institution.total_loans,
    equity_capital: institution.equity_capital,
    credit_card_loans: institution.credit_card_loans,
    cash_and_due: getRawField(raw, 'CASHDUE'),
    securities: getRawField(raw, 'SC'),
    real_estate_loans: getRawField(raw, 'LNRE'),
    commercial_loans: getRawField(raw, 'LNCI'),
    consumer_loans: getRawField(raw, 'LNCON'),
  };

  const REGISTRY_SOURCES: Institution['source'][] = ['rpaa', 'ciro', 'fintrac', 'fincen'];
  const isRegistryOnly = REGISTRY_SOURCES.includes(institution.source);

  return (
    <section id="section-details" className="py-12 px-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 border-t border-slate-200" />
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap">
          Deep Dive
        </h2>
        <div className="flex-1 border-t border-slate-200" />
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-2">
        {!isRegistryOnly && (
          <>
            <AccordionItem
              title="Balance Sheet"
              isOpen={openSections.has('balance')}
              onToggle={() => toggle('balance')}
            >
              <BalanceSheetFlow data={balanceData} />
            </AccordionItem>

            <AccordionItem
              title="Income Statement"
              isOpen={openSections.has('income')}
              onToggle={() => toggle('income')}
            >
              <IncomeFlow data={incomeData} />
            </AccordionItem>
          </>
        )}

        <AccordionItem
          title="Branch Network"
          isOpen={openSections.has('branches')}
          onToggle={() => toggle('branches')}
        >
          <div className="space-y-2">
            {institution.num_branches != null ? (
              <>
                <p className="text-sm text-slate-700">
                  <span className="text-2xl font-bold text-slate-900 mr-2">{institution.num_branches.toLocaleString()}</span>
                  branches {institution.state ? `in ${institution.state}` : 'across all locations'}
                </p>
                {institution.cert_number < 900001 && (
                  <a
                    href={`https://banks.data.fdic.gov/api/branches?filters=CERT:${institution.cert_number}&limit=100`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    View branch locations on FDIC →
                  </a>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-400">Branch data not available.</p>
            )}
          </div>
        </AccordionItem>

        <AccordionItem
          title="Card & Payment Capabilities"
          isOpen={openSections.has('capabilities')}
          onToggle={() => toggle('capabilities')}
        >
          {openSections.has('capabilities') && (
            <CapabilitiesPanel certNumber={institution.cert_number} />
          )}
        </AccordionItem>

        <AccordionItem
          title="Regulatory History"
          isOpen={openSections.has('regulatory')}
          onToggle={() => toggle('regulatory')}
        >
          <div className="space-y-3">
            {institution.established_date && (
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-slate-700">Established</p>
                  <p className="text-xs text-slate-500">
                    {new Date(institution.established_date).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
              </div>
            )}
            {institution.holding_company && (
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-slate-700">Holding Company</p>
                  <p className="text-xs text-slate-500">{institution.holding_company}</p>
                </div>
              </div>
            )}
            {institution.regulator && (
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-slate-700">Primary Regulator</p>
                  <p className="text-xs text-slate-500">{institution.regulator}</p>
                </div>
              </div>
            )}
            {!institution.established_date && !institution.holding_company && !institution.regulator && (
              <p className="text-sm text-slate-400">No regulatory history data available.</p>
            )}
          </div>
        </AccordionItem>
      </div>
    </section>
  );
}
