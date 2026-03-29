import { ExternalLink, Database } from 'lucide-react';
import type { Institution } from '@/types/institution';

interface DataSourceBadgeProps {
  institution: Institution;
}

interface SourceConfig {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  getUrl: (institution: Institution) => string;
}

const SOURCE_CONFIG: Record<Institution['source'], SourceConfig> = {
  fdic: {
    label: 'FDIC BankFind',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    getUrl: (inst) =>
      `https://banks.data.fdic.gov/api/institutions?filters=CERT:${inst.cert_number}&fields=INSTNAME`,
  },
  ncua: {
    label: 'NCUA 5300',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    getUrl: (inst) => {
      // NCUA charter number = cert_number - 1000000 (per spec)
      const charter = inst.cert_number - 1_000_000;
      return `https://www.ncua.gov/institution/details/${charter}`;
    },
  },
  osfi: {
    label: 'OSFI',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    getUrl: () =>
      'https://www.osfi-bsif.gc.ca/en/data-forms/financial-data/who-we-regulate',
  },
  rpaa: {
    label: 'Bank of Canada RPAA',
    color: 'text-green-700',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    getUrl: () => 'https://rps.bankofcanada.ca/',
  },
  ciro: {
    label: 'CIRO',
    color: 'text-indigo-700',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
    getUrl: () => 'https://www.ciro.ca/office-of-the-investor/investment-industry-resources/find-an-investment-firm',
  },
  fintrac: {
    label: 'FINTRAC MSB Registry',
    color: 'text-teal-700',
    bgColor: 'bg-teal-50',
    borderColor: 'border-teal-200',
    getUrl: () => 'https://www10.fintrac-canafe.gc.ca/msb-esm/public/msb-list/',
  },
  fincen: {
    label: 'FinCEN MSB Registry',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    getUrl: () => 'https://www.fincen.gov/msb-registrant-search',
  },
};

/** Maps the `regulator` field to supplemental Canadian registry labels */
function getSupplementalSource(
  institution: Institution,
): { label: string; url: string } | null {
  if (!institution.regulator) return null;
  if (institution.regulator === 'CIRO') {
    return { label: 'CIRO', url: 'https://www.ciro.ca/dealers' };
  }
  if (institution.regulator === 'FINTRAC') {
    return {
      label: 'FINTRAC',
      url: 'https://www10.fintrac-canafe.gc.ca/msb-esm/public/msb-list/',
    };
  }
  return null;
}

function formatDataDate(raw: string | null): string {
  if (!raw) return 'Unknown';
  // Accept YYYY-MM-DD or YYYY-QN style strings
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const date = new Date(raw);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  return raw;
}

export function DataSourceBadge({ institution }: DataSourceBadgeProps) {
  const config = SOURCE_CONFIG[institution.source];
  const supplemental = getSupplementalSource(institution);
  const sourceUrl = config.getUrl(institution);

  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 border-t ${config.borderColor} ${config.bgColor} rounded-b-xl`}
    >
      {/* Source icon + label */}
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${config.color}`}>
        <Database className="h-3.5 w-3.5 shrink-0" />
        {config.label}
      </span>

      {/* Supplemental regulator (CIRO / FINTRAC) if applicable */}
      {supplemental && (
        <span className="inline-flex items-center gap-1 text-xs text-surface-500">
          <span className="text-surface-300">·</span>
          <a
            href={supplemental.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 hover:underline text-surface-600 hover:text-surface-900"
          >
            {supplemental.label}
            <ExternalLink className="h-3 w-3" />
          </a>
        </span>
      )}

      {/* Data as-of date */}
      <span className={`text-xs ${config.color} opacity-75`}>
        Data as of {formatDataDate(institution.data_as_of)}
      </span>

      {/* View Source link — pushed to the right on larger screens */}
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`ml-auto inline-flex items-center gap-1 text-xs font-medium ${config.color} hover:underline`}
      >
        View Source
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
