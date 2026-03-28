import { Building2, MapPin, ExternalLink, Calendar, Shield } from 'lucide-react';
import { Badge } from '@/components/ui';
import { formatDate } from '@/lib/format';
import type { Institution } from '@/types/institution';

interface ProfileHeaderProps {
  institution: Institution;
}

function charterBadge(type: string | null) {
  if (!type) return null;
  const colorMap: Record<string, 'blue' | 'green' | 'purple' | 'gray'> = {
    commercial: 'blue',
    savings: 'purple',
    savings_association: 'purple',
    credit_union: 'green',
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

export function ProfileHeader({ institution }: ProfileHeaderProps) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-sm p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-primary-50">
              <Building2 className="h-6 w-6 text-primary-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-surface-900">{institution.name}</h1>
              {institution.legal_name && institution.legal_name !== institution.name && (
                <p className="text-sm text-surface-500">{institution.legal_name}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {charterBadge(institution.charter_type)}
            {regulatorBadge(institution.regulator)}
            <Badge color={institution.active ? 'green' : 'red'}>
              {institution.active ? 'Active' : 'Inactive'}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-surface-600">
            {(institution.city || institution.state) && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4 text-surface-400" />
                {[institution.city, institution.state].filter(Boolean).join(', ')}
              </span>
            )}
            {institution.established_date && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-4 w-4 text-surface-400" />
                Est. {formatDate(institution.established_date)}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Shield className="h-4 w-4 text-surface-400" />
              Cert #{institution.cert_number}
            </span>
          </div>
        </div>

        {institution.website && (
          <a
            href={institution.website.startsWith('http') ? institution.website : `https://${institution.website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors shrink-0"
          >
            Visit Website
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}
