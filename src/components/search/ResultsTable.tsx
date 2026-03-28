import { Link } from 'react-router';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { Badge } from '@/components/ui';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import type { Institution } from '@/types/institution';
import type { SortField } from '@/types/filters';

interface ResultsTableProps {
  institutions: Institution[];
  sortBy: SortField;
  sortDir: 'asc' | 'desc';
  onSort: (field: SortField) => void;
}

const COLUMNS: { key: SortField; label: string; align?: 'right' }[] = [
  { key: 'name', label: 'Name' },
  { key: 'state', label: 'State' },
  { key: 'total_assets', label: 'Total Assets', align: 'right' },
  { key: 'total_deposits', label: 'Total Deposits', align: 'right' },
  { key: 'num_branches', label: 'Branches', align: 'right' },
  { key: 'roa', label: 'ROA', align: 'right' },
  { key: 'roi', label: 'ROE', align: 'right' },
];

function charterColor(type: string | null): 'blue' | 'green' | 'purple' | 'gray' {
  if (!type) return 'gray';
  if (type.includes('commercial')) return 'blue';
  if (type.includes('credit_union')) return 'green';
  if (type.includes('savings')) return 'purple';
  return 'gray';
}

export function ResultsTable({ institutions, sortBy, sortDir, onSort }: ResultsTableProps) {
  function SortIcon({ field }: { field: SortField }) {
    if (sortBy !== field) return <ArrowUpDown className="h-3.5 w-3.5 text-surface-300" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 text-primary-600" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-primary-600" />
    );
  }

  if (institutions.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-surface-500 text-sm">No institutions found. Try adjusting your filters.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-surface-200 rounded-lg">
      <table className="min-w-full divide-y divide-surface-200">
        <thead className="bg-surface-50">
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider cursor-pointer select-none hover:text-surface-700 ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                onClick={() => onSort(col.key)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  <SortIcon field={col.key} />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-surface-100">
          {institutions.map((inst, idx) => (
            <tr
              key={inst.id}
              className={`hover:bg-primary-50/40 transition-colors ${idx % 2 === 1 ? 'bg-surface-50/50' : ''}`}
            >
              <td className="px-4 py-3 whitespace-nowrap">
                <Link
                  to={`/institution/${inst.cert_number}`}
                  className="text-sm font-medium text-primary-700 hover:text-primary-800 hover:underline"
                >
                  {inst.name}
                </Link>
                {inst.charter_type && (
                  <Badge color={charterColor(inst.charter_type)} className="ml-2 align-middle">
                    {inst.charter_type.replace(/_/g, ' ')}
                  </Badge>
                )}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-surface-600">
                {inst.state ?? '\u2014'}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-surface-900 text-right font-mono">
                {formatCurrency(inst.total_assets)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-surface-900 text-right font-mono">
                {formatCurrency(inst.total_deposits)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-surface-600 text-right">
                {formatNumber(inst.num_branches)}
              </td>
              <td
                className={`px-4 py-3 whitespace-nowrap text-sm text-right font-mono ${
                  inst.roa != null && inst.roa < 0 ? 'text-red-600' : 'text-green-700'
                }`}
              >
                {formatPercent(inst.roa)}
              </td>
              <td
                className={`px-4 py-3 whitespace-nowrap text-sm text-right font-mono ${
                  inst.roi != null && inst.roi < 0 ? 'text-red-600' : 'text-green-700'
                }`}
              >
                {formatPercent(inst.roi)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
