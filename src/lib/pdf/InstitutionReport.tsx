import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
import type { Institution, FinancialHistory } from '@/types/institution';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtCurrency(value: number | null | undefined): string {
  if (value == null) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toLocaleString()}`;
}

function fmtPct(value: number | null | undefined, dec = 2): string {
  if (value == null) return '—';
  return `${value.toFixed(dec)}%`;
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function fmtPeriod(period: string): string {
  // Convert YYYY-MM-DD → Q? YYYY
  try {
    const d = new Date(period);
    const q = Math.ceil((d.getMonth() + 1) / 3);
    return `Q${q} ${d.getFullYear()}`;
  } catch {
    return period;
  }
}

function getRaw(raw: Record<string, unknown> | null, field: string): number | null {
  if (!raw || raw[field] == null) return null;
  return Number(raw[field]) * 1000; // FDIC values in thousands
}

// ---------------------------------------------------------------------------
// Colour tokens
// ---------------------------------------------------------------------------
const C = {
  blue: '#2563eb',
  blueDark: '#1d4ed8',
  blueLight: '#dbeafe',
  bluePale: '#eff6ff',
  text: '#111827',
  textMuted: '#6b7280',
  textLight: '#9ca3af',
  bg: '#f8fafc',
  bgWhite: '#ffffff',
  border: '#e5e7eb',
  green: '#16a34a',
  red: '#dc2626',
  amber: '#d97706',
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: C.text,
    backgroundColor: C.bgWhite,
    paddingTop: 0,
    paddingBottom: 28,
    paddingHorizontal: 0,
  },

  // ---- Header band ----
  headerBand: {
    backgroundColor: C.blue,
    paddingHorizontal: 36,
    paddingTop: 24,
    paddingBottom: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    flexDirection: 'column',
    gap: 4,
  },
  headerInstitutionName: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: C.bgWhite,
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 9,
    color: '#bfdbfe',
    marginTop: 3,
  },
  headerRight: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 3,
  },
  headerMetaLabel: {
    fontSize: 7.5,
    color: '#93c5fd',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerMetaValue: {
    fontSize: 9,
    color: C.bgWhite,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
  },

  // ---- Body ----
  body: {
    paddingHorizontal: 36,
    paddingTop: 20,
    gap: 16,
  },

  // ---- Section ----
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: C.blue,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sectionDivider: {
    flex: 1,
    height: 1,
    backgroundColor: C.blueLight,
  },

  // ---- Key identifiers row ----
  identifiersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 0,
    backgroundColor: C.bg,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  identifierCell: {
    width: '33.33%',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  identifierLabel: {
    fontSize: 7,
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  identifierValue: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: C.text,
  },

  // ---- Balance sheet 2x2 grid ----
  bsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bsCard: {
    width: '48.5%',
    backgroundColor: C.bg,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
  },
  bsLabel: {
    fontSize: 7,
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  bsValue: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: C.text,
    marginBottom: 2,
  },
  bsSubtext: {
    fontSize: 7,
    color: C.textLight,
  },

  // ---- Performance metrics row ----
  perfRow: {
    flexDirection: 'row',
    gap: 6,
  },
  perfCard: {
    flex: 1,
    backgroundColor: C.bluePale,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.blueLight,
    padding: 10,
    alignItems: 'center',
  },
  perfLabel: {
    fontSize: 6.5,
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
    textAlign: 'center',
  },
  perfValue: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  perfGreen: { color: C.green },
  perfRed: { color: C.red },
  perfAmber: { color: C.amber },
  perfNeutral: { color: C.text },

  // ---- Data source audit ----
  auditRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  auditCell: {
    flex: 1,
    minWidth: '22%',
    backgroundColor: C.bg,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.border,
    padding: 10,
  },
  auditLabel: {
    fontSize: 7,
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  auditValue: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: C.text,
  },
  auditUrl: {
    fontSize: 7,
    color: C.blue,
    marginTop: 2,
  },

  // ---- Page 2 table ----
  table: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tableRowEven: {
    backgroundColor: C.bg,
  },
  tableRowOdd: {
    backgroundColor: C.bgWhite,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: C.blue,
  },
  tableHeaderCell: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: C.bgWhite,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingVertical: 7,
    paddingHorizontal: 8,
    flex: 1,
    textAlign: 'right',
  },
  tableHeaderCellFirst: {
    textAlign: 'left',
    flex: 1.2,
  },
  tableCell: {
    fontSize: 8,
    color: C.text,
    paddingVertical: 7,
    paddingHorizontal: 8,
    flex: 1,
    textAlign: 'right',
  },
  tableCellFirst: {
    fontFamily: 'Helvetica-Bold',
    textAlign: 'left',
    color: C.textMuted,
    flex: 1.2,
  },

  // ---- Footer ----
  footer: {
    position: 'absolute',
    bottom: 12,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 6,
  },
  footerText: {
    fontSize: 6.5,
    color: C.textLight,
  },

  // ---- Page number ----
  pageNum: {
    position: 'absolute',
    bottom: 12,
    right: 36,
    fontSize: 7,
    color: C.textLight,
  },
});

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function SectionHeading({ title }: { title: string }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.sectionDivider} />
    </View>
  );
}

function Footer({ institution }: { institution: Institution }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>
        Fintech Commons Data Studio · FDIC Cert #{institution.cert_number} · Generated{' '}
        {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
      </Text>
      <Text style={s.footerText}>
        Source: FDIC BankFind Suite · Public regulatory data only
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Page 1
// ---------------------------------------------------------------------------
function Page1({ institution }: { institution: Institution }) {
  const raw = institution.raw_data;

  // Derived metrics
  const loanToDeposit =
    institution.total_loans != null && institution.total_deposits != null && institution.total_deposits > 0
      ? (institution.total_loans / institution.total_deposits) * 100
      : null;

  const interestIncome = getRaw(raw, 'INTINC');
  const noninterestIncome = getRaw(raw, 'NONII');
  const noninterestExpense = getRaw(raw, 'ELNANTR');
  const totalRevenue = (interestIncome ?? 0) + (noninterestIncome ?? 0);
  const efficiencyRatio =
    totalRevenue > 0 && noninterestExpense != null
      ? (noninterestExpense / totalRevenue) * 100
      : null;

  const nim = getRaw(raw, 'NIM');

  function perfColor(value: number | null, greenThresh: number, redThresh: number, higherBetter = true) {
    if (value == null) return s.perfNeutral;
    if (higherBetter) {
      if (value >= greenThresh) return s.perfGreen;
      if (value < redThresh) return s.perfRed;
      return s.perfAmber;
    } else {
      if (value <= greenThresh) return s.perfGreen;
      if (value > redThresh) return s.perfRed;
      return s.perfAmber;
    }
  }

  // Source config
  const sourceLabels: Record<string, string> = {
    fdic: 'FDIC BankFind Suite',
    ncua: 'NCUA 5300 Reports',
    osfi: 'OSFI',
    rpaa: 'Bank of Canada RPAA',
  };
  const sourceUrls: Record<string, string> = {
    fdic: `https://banks.data.fdic.gov/api/institutions?filters=CERT:${institution.cert_number}`,
    ncua: `https://www.ncua.gov/institution/details/${institution.cert_number - 1_000_000}`,
    osfi: 'https://www.osfi-bsif.gc.ca/en/data-forms/financial-data',
    rpaa: 'https://rps.bankofcanada.ca/',
  };

  return (
    <Page size="LETTER" style={s.page}>
      {/* Header */}
      <View style={s.headerBand}>
        <View style={s.headerLeft}>
          <Text style={s.headerInstitutionName}>{institution.name}</Text>
          <Text style={s.headerSubtitle}>
            Institution Profile · One-Pager
            {institution.charter_type
              ? ` · ${institution.charter_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}`
              : ''}
          </Text>
        </View>
        <View style={s.headerRight}>
          <Text style={s.headerMetaLabel}>FDIC Cert #</Text>
          <Text style={s.headerMetaValue}>{institution.cert_number}</Text>
          <Text style={[s.headerMetaLabel, { marginTop: 6 }]}>Data As Of</Text>
          <Text style={s.headerMetaValue}>{fmtDate(institution.data_as_of)}</Text>
        </View>
      </View>

      <View style={s.body}>
        {/* Section 1: Key Identifiers */}
        <View>
          <SectionHeading title="Key Identifiers" />
          <View style={s.identifiersRow}>
            {[
              { label: 'State / Province', value: institution.state ?? '—' },
              { label: 'Charter Type', value: institution.charter_type?.replace(/_/g, ' ') ?? '—' },
              { label: 'Regulator', value: institution.regulator ?? '—' },
              { label: 'Established', value: fmtDate(institution.established_date) },
              { label: 'Branches', value: institution.num_branches != null ? institution.num_branches.toLocaleString() : '—' },
              { label: 'Employees (FTE)', value: institution.num_employees != null ? institution.num_employees.toLocaleString() : '—' },
            ].map((item, i) => (
              <View key={item.label} style={[s.identifierCell, i >= 3 ? { borderBottomWidth: 0 } : {}]}>
                <Text style={s.identifierLabel}>{item.label}</Text>
                <Text style={s.identifierValue}>{item.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Section 2: Balance Sheet Summary */}
        <View>
          <SectionHeading title="Balance Sheet Summary" />
          <View style={s.bsGrid}>
            {[
              {
                label: 'Total Assets',
                value: fmtCurrency(institution.total_assets),
                sub: 'Book value of all assets',
              },
              {
                label: 'Total Deposits',
                value: fmtCurrency(institution.total_deposits),
                sub: 'Customer deposit liabilities',
              },
              {
                label: 'Net Loans & Leases',
                value: fmtCurrency(institution.total_loans),
                sub: 'After allowances for losses',
              },
              {
                label: 'Equity Capital',
                value: fmtCurrency(institution.equity_capital),
                sub: 'Retained earnings + paid-in capital',
              },
            ].map((card) => (
              <View key={card.label} style={s.bsCard}>
                <Text style={s.bsLabel}>{card.label}</Text>
                <Text style={s.bsValue}>{card.value}</Text>
                <Text style={s.bsSubtext}>{card.sub}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Section 3: Performance Metrics */}
        <View>
          <SectionHeading title="Performance Metrics" />
          <View style={s.perfRow}>
            {[
              {
                label: 'Return on Assets',
                value: fmtPct(institution.roa),
                color: perfColor(institution.roa, 1, 0),
              },
              {
                label: 'Return on Equity',
                value: fmtPct(institution.roi, 1),
                color: perfColor(institution.roi, 8, 0),
              },
              {
                label: 'Net Interest Margin',
                value: nim != null ? fmtPct(nim / 1e6) : '—',
                color: s.perfNeutral,
              },
              {
                label: 'Efficiency Ratio',
                value: fmtPct(efficiencyRatio, 1),
                color: perfColor(efficiencyRatio, 0, 60, false),
              },
              {
                label: 'Loan / Deposit',
                value: fmtPct(loanToDeposit, 1),
                color: perfColor(loanToDeposit, 70, 90, false),
              },
            ].map((m) => (
              <View key={m.label} style={s.perfCard}>
                <Text style={s.perfLabel}>{m.label}</Text>
                <Text style={[s.perfValue, m.color]}>{m.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Section 4: Data Source Audit */}
        <View>
          <SectionHeading title="Data Source Audit" />
          <View style={s.auditRow}>
            <View style={s.auditCell}>
              <Text style={s.auditLabel}>Source</Text>
              <Text style={s.auditValue}>{sourceLabels[institution.source] ?? institution.source}</Text>
            </View>
            <View style={s.auditCell}>
              <Text style={s.auditLabel}>Data Date</Text>
              <Text style={s.auditValue}>{fmtDate(institution.data_as_of)}</Text>
            </View>
            <View style={s.auditCell}>
              <Text style={s.auditLabel}>Regulatory Body</Text>
              <Text style={s.auditValue}>{institution.regulator ?? '—'}</Text>
            </View>
            <View style={[s.auditCell, { flex: 1.5 }]}>
              <Text style={s.auditLabel}>Source URL</Text>
              <Text style={s.auditValue}>
                {sourceUrls[institution.source] ?? '—'}
              </Text>
              <Text style={s.auditUrl}>Public regulatory data · No auth required</Text>
            </View>
          </View>
        </View>
      </View>

      <Footer institution={institution} />
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Page 2: Historical Trends Table
// ---------------------------------------------------------------------------
function Page2({
  institution,
  history,
}: {
  institution: Institution;
  history: FinancialHistory[];
}) {
  // Most recent 8 quarters, newest first
  const rows = [...history]
    .sort((a, b) => b.period.localeCompare(a.period))
    .slice(0, 8);

  const cols = [
    { label: 'Period', key: 'period', fmt: (r: FinancialHistory) => fmtPeriod(r.period), first: true },
    { label: 'Total Assets', key: 'total_assets', fmt: (r: FinancialHistory) => fmtCurrency(r.total_assets), first: false },
    { label: 'Total Deposits', key: 'total_deposits', fmt: (r: FinancialHistory) => fmtCurrency(r.total_deposits), first: false },
    { label: 'Net Loans', key: 'total_loans', fmt: (r: FinancialHistory) => fmtCurrency(r.total_loans), first: false },
    { label: 'Net Income', key: 'net_income', fmt: (r: FinancialHistory) => fmtCurrency(r.net_income), first: false },
    { label: 'ROA', key: 'roa', fmt: (r: FinancialHistory) => fmtPct(r.roa), first: false },
    { label: 'ROE', key: 'roi', fmt: (r: FinancialHistory) => fmtPct(r.roi, 1), first: false },
  ];

  return (
    <Page size="LETTER" style={s.page}>
      {/* Header */}
      <View style={s.headerBand}>
        <View style={s.headerLeft}>
          <Text style={s.headerInstitutionName}>{institution.name}</Text>
          <Text style={s.headerSubtitle}>Historical Trends · Last 8 Quarters</Text>
        </View>
        <View style={s.headerRight}>
          <Text style={s.headerMetaLabel}>FDIC Cert #</Text>
          <Text style={s.headerMetaValue}>{institution.cert_number}</Text>
          <Text style={[s.headerMetaLabel, { marginTop: 6 }]}>Page</Text>
          <Text style={s.headerMetaValue}>2 of 2</Text>
        </View>
      </View>

      <View style={s.body}>
        <View>
          <SectionHeading title="Quarterly Financial History" />

          {rows.length === 0 ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ fontSize: 9, color: C.textMuted }}>
                No historical data available for this institution.
              </Text>
            </View>
          ) : (
            <View style={s.table}>
              {/* Header row */}
              <View style={s.tableHeaderRow}>
                {cols.map((col) => (
                  <Text
                    key={col.key}
                    style={[s.tableHeaderCell, col.first ? s.tableHeaderCellFirst : {}]}
                  >
                    {col.label}
                  </Text>
                ))}
              </View>

              {/* Data rows */}
              {rows.map((row, i) => (
                <View
                  key={row.id}
                  style={[s.tableRow, i % 2 === 0 ? s.tableRowEven : s.tableRowOdd]}
                >
                  {cols.map((col) => (
                    <Text
                      key={col.key}
                      style={[s.tableCell, col.first ? s.tableCellFirst : {}]}
                    >
                      {col.fmt(row)}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Notes */}
        <View style={{ marginTop: 12, padding: 12, backgroundColor: C.bg, borderRadius: 6, borderWidth: 1, borderColor: C.border }}>
          <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.textMuted, marginBottom: 4 }}>
            Methodology Notes
          </Text>
          <Text style={{ fontSize: 7, color: C.textLight, lineHeight: 1.5 }}>
            All financial figures sourced from FDIC Call Reports (BankFind Suite API). Amounts reported in USD. ROA = Net Income / Average
            Total Assets (annualized). ROE = Net Income / Average Equity Capital (annualized). Historical data may be restated. This report
            is for informational purposes only and does not constitute financial advice.
          </Text>
        </View>
      </View>

      <Footer institution={institution} />
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Main Document
// ---------------------------------------------------------------------------
interface InstitutionReportProps {
  institution: Institution;
  history: FinancialHistory[];
}

export function InstitutionReport({ institution, history }: InstitutionReportProps) {
  return (
    <Document
      title={`${institution.name} — Institution Profile`}
      author="Fintech Commons Data Studio"
      subject={`FDIC Institution Report — Cert #${institution.cert_number}`}
      creator="Fintech Commons Data Studio"
      producer="@react-pdf/renderer"
    >
      <Page1 institution={institution} />
      <Page2 institution={institution} history={history} />
    </Document>
  );
}
