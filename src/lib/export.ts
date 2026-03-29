import * as XLSX from 'xlsx';
import type { Institution, FinancialHistory } from '@/types/institution';

// ─── Helpers ───────────────────────────────────────────────────────────────

function safeName(name: string): string {
  return name.replace(/[^a-z0-9]/gi, '_');
}

function fmtMoney(val: number | null): string {
  if (val == null) return '';
  if (Math.abs(val) >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (Math.abs(val) >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  return `$${val.toLocaleString()}`;
}

function fmtPct(val: number | null): string {
  if (val == null) return '';
  return `${val.toFixed(2)}%`;
}

// ─── Sheet builders ─────────────────────────────────────────────────────────

function buildProfileSheet(institution: Institution): XLSX.WorkSheet {
  const rows: [string, string | number | null][] = [
    ['Field', 'Value'],
    ['Name', institution.name],
    ['Legal Name', institution.legal_name ?? ''],
    ['Cert Number', institution.cert_number],
    ['Source', institution.source.toUpperCase()],
    ['Charter Type', institution.charter_type ?? ''],
    ['Active', institution.active ? 'Yes' : 'No'],
    ['Country', institution.country ?? 'US'],
    ['City', institution.city ?? ''],
    ['State / Province', institution.state ?? ''],
    ['ZIP / Postal', institution.zip ?? ''],
    ['County', institution.county ?? ''],
    ['Regulator', institution.regulator ?? ''],
    ['Holding Company', institution.holding_company ?? ''],
    ['Website', institution.website ?? ''],
    ['Established Date', institution.established_date ?? ''],
    ['Data As Of', institution.data_as_of ?? ''],
    ['Last Synced', institution.last_synced_at ?? ''],
    ['', ''],
    ['--- Financial Metrics ---', ''],
    ['Total Assets', fmtMoney(institution.total_assets)],
    ['Total Deposits', fmtMoney(institution.total_deposits)],
    ['Total Loans', fmtMoney(institution.total_loans)],
    ['Equity Capital', fmtMoney(institution.equity_capital)],
    ['Net Income', fmtMoney(institution.net_income)],
    ['Credit Card Loans', fmtMoney(institution.credit_card_loans)],
    ['Credit Card Charge-Offs', fmtMoney(institution.credit_card_charge_offs)],
    ['ROA', fmtPct(institution.roa)],
    ['ROE', fmtPct(institution.roi)],
    ['Branches', institution.num_branches != null ? institution.num_branches : ''],
    ['Employees', institution.num_employees != null ? institution.num_employees : ''],
  ];

  if (institution.total_assets && institution.equity_capital) {
    const ratio = (institution.equity_capital / institution.total_assets) * 100;
    rows.push(['Equity / Assets', fmtPct(ratio)]);
  }
  if (institution.total_loans && institution.total_deposits) {
    const ldr = (institution.total_loans / institution.total_deposits) * 100;
    rows.push(['Loan-to-Deposit Ratio', fmtPct(ldr)]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 28 }, { wch: 24 }];
  return ws;
}

function buildHistorySheet(history: FinancialHistory[]): XLSX.WorkSheet {
  const headers = [
    'Period',
    'Total Assets',
    'Total Deposits',
    'Total Loans',
    'Net Income',
    'Equity Capital',
    'ROA (%)',
    'ROE (%)',
    'Credit Card Loans',
  ];

  const rows = history.map((h) => [
    h.period,
    fmtMoney(h.total_assets),
    fmtMoney(h.total_deposits),
    fmtMoney(h.total_loans),
    fmtMoney(h.net_income),
    fmtMoney(h.equity_capital),
    h.roa != null ? h.roa.toFixed(2) : '',
    h.roi != null ? h.roi.toFixed(2) : '',
    fmtMoney(h.credit_card_loans),
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = headers.map(() => ({ wch: 18 }));
  return ws;
}

function buildRawDataSheet(institution: Institution): XLSX.WorkSheet {
  const raw = institution.raw_data;
  if (!raw) {
    const ws = XLSX.utils.aoa_to_sheet([['No raw data available']]);
    return ws;
  }

  const headers = ['Field', 'Raw Value'];
  const rows = Object.entries(raw).map(([k, v]) => [
    k,
    v != null ? String(v) : '',
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [{ wch: 22 }, { wch: 24 }];
  return ws;
}

// ─── Public exports ──────────────────────────────────────────────────────────

export function exportInstitutionToExcel(
  institution: Institution,
  history: FinancialHistory[],
): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Profile
  XLSX.utils.book_append_sheet(wb, buildProfileSheet(institution), 'Profile');

  // Sheet 2: Historical Data (last 8 quarters, newest first)
  const recent = [...history]
    .sort((a, b) => (a.period > b.period ? -1 : 1))
    .slice(0, 8);
  XLSX.utils.book_append_sheet(wb, buildHistorySheet(recent), 'Historical Data');

  // Sheet 3: Raw FDIC / source data
  XLSX.utils.book_append_sheet(wb, buildRawDataSheet(institution), 'Raw Data');

  XLSX.writeFile(wb, `${safeName(institution.name)}_DataStudio.xlsx`);
}

export function exportSearchResultsToExcel(institutions: Institution[]): void {
  const headers = [
    'Name',
    'Source',
    'Charter Type',
    'City',
    'State',
    'Country',
    'Regulator',
    'Total Assets',
    'Total Deposits',
    'Total Loans',
    'Net Income',
    'Credit Card Loans',
    'ROA (%)',
    'ROE (%)',
    'Active',
    'Data As Of',
    'Cert Number',
  ];

  const rows = institutions.map((inst) => [
    inst.name,
    inst.source.toUpperCase(),
    inst.charter_type ?? '',
    inst.city ?? '',
    inst.state ?? '',
    inst.country ?? 'US',
    inst.regulator ?? '',
    fmtMoney(inst.total_assets),
    fmtMoney(inst.total_deposits),
    fmtMoney(inst.total_loans),
    fmtMoney(inst.net_income),
    fmtMoney(inst.credit_card_loans),
    inst.roa != null ? inst.roa.toFixed(2) : '',
    inst.roi != null ? inst.roi.toFixed(2) : '',
    inst.active ? 'Yes' : 'No',
    inst.data_as_of ?? '',
    inst.cert_number,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 16) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Search Results');

  XLSX.writeFile(wb, 'DataStudio_Search_Results.xlsx');
}
