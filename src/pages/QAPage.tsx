/**
 * QA Dashboard
 * Validates stored institution data against live FDIC API values.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle, AlertTriangle, XCircle, Info,
  ExternalLink, ChevronDown, ChevronRight, FlaskConical,
  Database, RefreshCw, Search,
} from 'lucide-react';
import { Card, Button, Input, Badge, Skeleton } from '@/components/ui';
import { FormulaReference } from '@/components/qa/FormulaReference';
import { formatCurrency, formatPercent } from '@/lib/format';

// ─── Types (mirrors api/qa/check.ts) ─────────────────────────────────────────

type CheckSeverity = 'ok' | 'warning' | 'error' | 'info';

interface FieldCheck {
  field: string;
  label: string;
  stored_value: number | null;
  fdic_value: number | null;
  pct_diff: number | null;
  severity: CheckSeverity;
  message: string;
}

interface SanityCheck {
  check: string;
  value: number | null;
  passed: boolean;
  severity: CheckSeverity;
  message: string;
}

interface DerivedMetric {
  metric: string;
  label: string;
  formula: string;
  computed_value: number | null;
  stored_value: number | null;
  pct_diff: number | null;
  severity: CheckSeverity;
  step_by_step: string;
}

interface InstitutionQAResult {
  cert_number: number;
  name: string;
  data_as_of: string | null;
  fdic_report_date: string | null;
  overall_severity: CheckSeverity;
  error?: string;
  field_checks: FieldCheck[];
  derived_metrics: DerivedMetric[];
  sanity_checks: SanityCheck[];
  fdic_sdi_url: string;
  checked_at: string;
}

interface QACheckResponse {
  mode: 'single' | 'sample';
  total_checked: number;
  pass_count: number;
  warning_count: number;
  error_count: number;
  results: InstitutionQAResult[];
  checked_at: string;
}

interface QAStatusResponse {
  last_check: {
    checked_at: string | null;
    total_checked: number;
    pass_count: number;
    warning_count: number;
    error_count: number;
    pass_rate_pct: number | null;
  };
  database_summary: {
    total_fdic_institutions: number;
    total_active_fdic: number;
    institutions_with_raw_data: number;
    stale_records_count: number;
  };
  known_issues: Array<{ severity: 'warning' | 'error'; code: string; message: string }>;
  status: 'healthy' | 'degraded' | 'unknown';
  checked_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const INDUSTRY_BENCHMARKS: Record<string, { label: string; value: number; unit: string }> = {
  roa: { label: 'ROA', value: 1.05, unit: '%' },
  roi: { label: 'ROE', value: 10.5, unit: '%' },
  nim: { label: 'NIM', value: 3.0, unit: '%' },
  efficiency_ratio: { label: 'Efficiency Ratio', value: 62.0, unit: '%' },
  loan_to_deposit: { label: 'Loan-to-Deposit', value: 77.0, unit: '%' },
};

function severityIcon(severity: CheckSeverity, className = 'w-4 h-4') {
  switch (severity) {
    case 'ok':
      return <CheckCircle className={`${className} text-green-500`} />;
    case 'warning':
      return <AlertTriangle className={`${className} text-yellow-500`} />;
    case 'error':
      return <XCircle className={`${className} text-red-500`} />;
    case 'info':
      return <Info className={`${className} text-surface-400`} />;
  }
}

function severityBadge(severity: CheckSeverity) {
  const map: Record<CheckSeverity, { color: 'green' | 'yellow' | 'red' | 'gray'; label: string }> = {
    ok: { color: 'green', label: 'PASS' },
    warning: { color: 'yellow', label: 'WARN' },
    error: { color: 'red', label: 'FAIL' },
    info: { color: 'gray', label: 'N/A' },
  };
  const { color, label } = map[severity];
  return <Badge color={color}>{label}</Badge>;
}

function formatFieldValue(field: string, value: number | null): string {
  if (value == null) return '—';
  const ratioFields = ['roa', 'roi', 'nim', 'efficiency_ratio', 'loan_to_deposit'];
  if (ratioFields.includes(field)) return formatPercent(value);
  return formatCurrency(value);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusOverview({ status }: { status: QAStatusResponse }) {
  const { database_summary: db, known_issues: issues, status: health } = status;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <Card className="flex flex-col gap-1">
        <p className="text-xs text-surface-500">FDIC Institutions</p>
        <p className="text-2xl font-bold text-surface-900">{db.total_fdic_institutions.toLocaleString()}</p>
        <p className="text-xs text-surface-400">{db.total_active_fdic.toLocaleString()} active</p>
      </Card>
      <Card className="flex flex-col gap-1">
        <p className="text-xs text-surface-500">With Raw Data</p>
        <p className="text-2xl font-bold text-surface-900">{db.institutions_with_raw_data.toLocaleString()}</p>
        <p className="text-xs text-surface-400">needed for derived metrics</p>
      </Card>
      <Card className="flex flex-col gap-1">
        <p className="text-xs text-surface-500">Stale Records</p>
        <p className={`text-2xl font-bold ${db.stale_records_count > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
          {db.stale_records_count.toLocaleString()}
        </p>
        <p className="text-xs text-surface-400">data_as_of &gt; 6 months old</p>
      </Card>
      <Card className="flex flex-col gap-1">
        <p className="text-xs text-surface-500">Database Health</p>
        <div className="flex items-center gap-2 mt-1">
          {health === 'healthy'
            ? <CheckCircle className="w-6 h-6 text-green-500" />
            : health === 'degraded'
            ? <XCircle className="w-6 h-6 text-red-500" />
            : <Info className="w-6 h-6 text-surface-400" />}
          <span className={`text-lg font-semibold capitalize ${
            health === 'healthy' ? 'text-green-600' : health === 'degraded' ? 'text-red-600' : 'text-surface-500'
          }`}>
            {health}
          </span>
        </div>
      </Card>

      {issues.length > 0 && (
        <div className="col-span-2 sm:col-span-4 space-y-2">
          {issues.map((issue) => (
            <div
              key={issue.code}
              className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
                issue.severity === 'error'
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
              }`}
            >
              {issue.severity === 'error'
                ? <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
              <span>{issue.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FieldChecksTable({ checks }: { checks: FieldCheck[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-200">
            <th className="text-left py-2 px-3 text-xs font-semibold text-surface-500 uppercase tracking-wide">Field</th>
            <th className="text-right py-2 px-3 text-xs font-semibold text-surface-500 uppercase tracking-wide">Stored</th>
            <th className="text-right py-2 px-3 text-xs font-semibold text-surface-500 uppercase tracking-wide">FDIC Live</th>
            <th className="text-right py-2 px-3 text-xs font-semibold text-surface-500 uppercase tracking-wide">Diff %</th>
            <th className="text-center py-2 px-3 text-xs font-semibold text-surface-500 uppercase tracking-wide">Status</th>
            <th className="text-left py-2 px-3 text-xs font-semibold text-surface-500 uppercase tracking-wide">Message</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-100">
          {checks.map((check) => (
            <tr key={check.field} className="hover:bg-surface-50 transition-colors">
              <td className="py-2.5 px-3 font-medium text-surface-800">{check.label}</td>
              <td className="py-2.5 px-3 text-right text-surface-700 tabular-nums">
                {formatFieldValue(check.field, check.stored_value)}
              </td>
              <td className="py-2.5 px-3 text-right text-surface-700 tabular-nums">
                {formatFieldValue(check.field, check.fdic_value)}
              </td>
              <td className={`py-2.5 px-3 text-right tabular-nums font-medium ${
                check.pct_diff == null ? 'text-surface-400'
                : Math.abs(check.pct_diff) > 5 ? 'text-red-600'
                : Math.abs(check.pct_diff) > 1 ? 'text-yellow-600'
                : 'text-green-600'
              }`}>
                {check.pct_diff != null ? `${check.pct_diff > 0 ? '+' : ''}${check.pct_diff.toFixed(2)}%` : '—'}
              </td>
              <td className="py-2.5 px-3 text-center">
                {severityBadge(check.severity)}
              </td>
              <td className="py-2.5 px-3 text-surface-500 text-xs">{check.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DerivedMetricsSection({ metrics }: { metrics: DerivedMetric[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (metric: string) =>
    setExpanded((prev) => ({ ...prev, [metric]: !prev[metric] }));

  return (
    <div className="space-y-2">
      {metrics.map((m) => {
        const benchmark = INDUSTRY_BENCHMARKS[m.metric];
        const isExpanded = !!expanded[m.metric];

        return (
          <div
            key={m.metric}
            className="border border-surface-200 rounded-lg overflow-hidden"
          >
            <button
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-50 transition-colors text-left"
              onClick={() => toggle(m.metric)}
            >
              {isExpanded
                ? <ChevronDown className="w-4 h-4 text-surface-400 shrink-0" />
                : <ChevronRight className="w-4 h-4 text-surface-400 shrink-0" />}
              {severityIcon(m.severity)}
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-surface-800">{m.label}</span>
                <span className="ml-2 text-xs text-surface-500">{m.formula}</span>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                {m.computed_value != null && (
                  <span className="text-sm text-surface-600 tabular-nums">
                    {formatPercent(m.computed_value)} (FDIC)
                  </span>
                )}
                {benchmark && m.computed_value != null && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    m.computed_value >= benchmark.value
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {m.computed_value >= benchmark.value ? '▲' : '▼'} vs {benchmark.value}{benchmark.unit} avg
                  </span>
                )}
                {severityBadge(m.severity)}
              </div>
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 pt-1 border-t border-surface-100 bg-surface-50 space-y-3">
                {/* Step-by-step math */}
                <div>
                  <p className="text-xs font-semibold text-surface-600 mb-1">Step-by-step computation</p>
                  <code className="block bg-white border border-surface-200 rounded px-3 py-2 text-xs text-surface-800 font-mono whitespace-pre-wrap">
                    {m.step_by_step}
                  </code>
                </div>

                {/* Stored vs computed */}
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="bg-white rounded-md border border-surface-200 p-2">
                    <p className="text-surface-500 mb-0.5">Computed (FDIC raw)</p>
                    <p className="font-semibold text-surface-900 tabular-nums">
                      {m.computed_value != null ? formatPercent(m.computed_value) : '—'}
                    </p>
                  </div>
                  <div className="bg-white rounded-md border border-surface-200 p-2">
                    <p className="text-surface-500 mb-0.5">Stored (our DB)</p>
                    <p className="font-semibold text-surface-900 tabular-nums">
                      {m.stored_value != null ? formatPercent(m.stored_value) : '—'}
                    </p>
                  </div>
                  <div className="bg-white rounded-md border border-surface-200 p-2">
                    <p className="text-surface-500 mb-0.5">Difference</p>
                    <p className={`font-semibold tabular-nums ${
                      m.pct_diff == null ? 'text-surface-400'
                      : Math.abs(m.pct_diff) > 5 ? 'text-red-600'
                      : Math.abs(m.pct_diff) > 1 ? 'text-yellow-600'
                      : 'text-green-600'
                    }`}>
                      {m.pct_diff != null ? `${m.pct_diff > 0 ? '+' : ''}${m.pct_diff.toFixed(2)}%` : '—'}
                    </p>
                  </div>
                </div>

                {/* Industry benchmark */}
                {benchmark && m.computed_value != null && (
                  <div className="flex items-center gap-2 text-xs text-surface-500">
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    Industry benchmark: <span className="font-semibold text-surface-700">{benchmark.value}{benchmark.unit}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SanityChecksGrid({ checks }: { checks: SanityCheck[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {checks.map((check) => (
        <div
          key={check.check}
          className={`flex items-start gap-2.5 rounded-lg p-3 border ${
            check.severity === 'ok' ? 'bg-green-50 border-green-200'
            : check.severity === 'error' ? 'bg-red-50 border-red-200'
            : check.severity === 'warning' ? 'bg-yellow-50 border-yellow-200'
            : 'bg-surface-50 border-surface-200'
          }`}
        >
          {severityIcon(check.severity, 'w-4 h-4 shrink-0 mt-0.5')}
          <p className={`text-xs leading-relaxed ${
            check.severity === 'ok' ? 'text-green-700'
            : check.severity === 'error' ? 'text-red-700'
            : check.severity === 'warning' ? 'text-yellow-700'
            : 'text-surface-500'
          }`}>
            {check.message}
          </p>
        </div>
      ))}
    </div>
  );
}

function InstitutionResult({ result }: { result: InstitutionQAResult }) {
  const [open, setOpen] = useState(true);

  return (
    <Card padding={false} className="overflow-hidden">
      {/* Institution header */}
      <button
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-surface-50 transition-colors text-left"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="w-4 h-4 text-surface-400" /> : <ChevronRight className="w-4 h-4 text-surface-400" />}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-surface-900 text-sm truncate">{result.name}</p>
          <p className="text-xs text-surface-400">
            FDIC Cert #{result.cert_number}
            {result.data_as_of && ` · Data as of ${result.data_as_of}`}
            {result.fdic_report_date && ` · FDIC report: ${result.fdic_report_date}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {severityIcon(result.overall_severity, 'w-5 h-5')}
          {severityBadge(result.overall_severity)}
          <a
            href={`https://www.ffiec.gov/nicpubweb/content/BHCPRS.aspx`}
            onClick={(e) => e.stopPropagation()}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
            title="View on FDIC SDI"
          >
            FDIC SDI <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </button>

      {open && (
        <div className="border-t border-surface-200 divide-y divide-surface-100">
          {result.error ? (
            <div className="px-5 py-4 flex items-center gap-2 text-sm text-red-600">
              <XCircle className="w-4 h-4 shrink-0" />
              {result.error}
            </div>
          ) : (
            <>
              {/* Field checks */}
              <div className="px-5 py-4">
                <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-3">
                  Stored vs. FDIC Live Values
                </h3>
                <FieldChecksTable checks={result.field_checks} />
              </div>

              {/* Derived metrics */}
              {result.derived_metrics.length > 0 && (
                <div className="px-5 py-4">
                  <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-3">
                    Derived Metrics &amp; Formula Verification
                  </h3>
                  <DerivedMetricsSection metrics={result.derived_metrics} />
                </div>
              )}

              {/* Sanity checks */}
              {result.sanity_checks.length > 0 && (
                <div className="px-5 py-4">
                  <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-3">
                    Sanity Checks
                  </h3>
                  <SanityChecksGrid checks={result.sanity_checks} />
                </div>
              )}

              {/* FDIC SDI link */}
              <div className="px-5 py-3 bg-surface-50 flex items-center justify-between">
                <p className="text-xs text-surface-400">
                  Checked at {new Date(result.checked_at).toLocaleTimeString()}
                </p>
                <a
                  href={`https://banks.data.fdic.gov/api/institutions?filters=CERT:${result.cert_number}&fields=CERT,INSTNAME,CITY,STNAME&limit=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700"
                >
                  <Database className="w-3.5 h-3.5" />
                  View raw FDIC API response
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type ActiveTab = 'check' | 'status' | 'formulas';

export default function QAPage() {
  const [tab, setTab] = useState<ActiveTab>('check');
  const [certInput, setCertInput] = useState('');
  const [activeCert, setActiveCert] = useState<string | null>(null);
  const [sampleSize, setSampleSize] = useState(10);
  const [sampleTrigger, setSampleTrigger] = useState(0);

  // Status query
  const { data: statusData, isLoading: statusLoading, refetch: refetchStatus } = useQuery<QAStatusResponse>({
    queryKey: ['qa-status'],
    queryFn: async () => {
      const res = await fetch('/api/qa/status');
      if (!res.ok) throw new Error('Failed to fetch QA status');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  // Single cert check
  const {
    data: certData,
    isLoading: certLoading,
    error: certError,
  } = useQuery<QACheckResponse>({
    queryKey: ['qa-check-cert', activeCert],
    queryFn: async () => {
      const res = await fetch(`/api/qa/check?cert=${activeCert}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Check failed');
      }
      return res.json();
    },
    enabled: !!activeCert,
    staleTime: 0,
  });

  // Sample check
  const {
    data: sampleData,
    isLoading: sampleLoading,
    error: sampleError,
    refetch: refetchSample,
  } = useQuery<QACheckResponse>({
    queryKey: ['qa-check-sample', sampleSize, sampleTrigger],
    queryFn: async () => {
      const res = await fetch(`/api/qa/check?sample=${sampleSize}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Sample check failed');
      }
      return res.json();
    },
    enabled: false,
    staleTime: 0,
  });

  function handleCertCheck(e: React.FormEvent) {
    e.preventDefault();
    const val = certInput.trim();
    if (!val) return;
    setActiveCert(val);
  }

  function handleRunSample() {
    setSampleTrigger((t) => t + 1);
    refetchSample();
  }

  const TABS: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'check', label: 'Check Institution', icon: <Search className="w-4 h-4" /> },
    { id: 'status', label: 'Database Status', icon: <Database className="w-4 h-4" /> },
    { id: 'formulas', label: 'Formula Reference', icon: <FlaskConical className="w-4 h-4" /> },
  ];

  const activeReport = certData ?? sampleData;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold text-surface-900 flex items-center gap-2">
          <FlaskConical className="w-6 h-6 text-primary-600" />
          Data QA Dashboard
        </h1>
        <p className="text-sm text-surface-500 mt-1">
          Validate stored institution data against live FDIC API values and check formula computations.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-surface-200">
        <nav className="flex gap-1 -mb-px">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-surface-500 hover:text-surface-700 hover:border-surface-300'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Check tab ───────────────────────────────────────────────────────── */}
      {tab === 'check' && (
        <div className="space-y-6">
          {/* Controls */}
          <Card>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Single cert check */}
              <div>
                <h2 className="text-sm font-semibold text-surface-800 mb-3">Check by FDIC Cert Number</h2>
                <form onSubmit={handleCertCheck} className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="e.g. 3511"
                    value={certInput}
                    onChange={(e) => setCertInput(e.target.value)}
                    className="flex-1"
                    min={1}
                  />
                  <Button type="submit" disabled={certLoading || !certInput.trim()}>
                    {certLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    Check
                  </Button>
                </form>
                <p className="text-xs text-surface-400 mt-1.5">
                  Fetches live FDIC data and compares with our stored values.
                </p>
              </div>

              {/* Random sample */}
              <div>
                <h2 className="text-sm font-semibold text-surface-800 mb-3">Random Sample Check</h2>
                <div className="flex gap-2">
                  <select
                    value={sampleSize}
                    onChange={(e) => setSampleSize(Number(e.target.value))}
                    className="block rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-surface-900 focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  >
                    {[5, 10, 20, 50].map((n) => (
                      <option key={n} value={n}>{n} institutions</option>
                    ))}
                  </select>
                  <Button variant="secondary" onClick={handleRunSample} disabled={sampleLoading}>
                    {sampleLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Run Sample
                  </Button>
                </div>
                <p className="text-xs text-surface-400 mt-1.5">
                  Checks a random slice of active FDIC institutions from the database.
                </p>
              </div>
            </div>
          </Card>

          {/* Summary stats for active report */}
          {activeReport && (
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Checked', value: activeReport.total_checked, color: 'text-surface-900' },
                { label: 'Pass', value: activeReport.pass_count, color: 'text-green-600' },
                { label: 'Warnings', value: activeReport.warning_count, color: 'text-yellow-600' },
                { label: 'Errors', value: activeReport.error_count, color: 'text-red-600' },
              ].map((stat) => (
                <Card key={stat.label} className="text-center py-4">
                  <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-xs text-surface-500 mt-1">{stat.label}</p>
                </Card>
              ))}
            </div>
          )}

          {/* Error */}
          {(certError || sampleError) && (
            <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <XCircle className="w-4 h-4 shrink-0" />
              {(certError ?? sampleError)?.message}
            </div>
          )}

          {/* Loading state */}
          {(certLoading || sampleLoading) && (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          )}

          {/* Results */}
          {activeReport && !certLoading && !sampleLoading && (
            <div className="space-y-4">
              {activeReport.results.map((result) => (
                <InstitutionResult key={result.cert_number} result={result} />
              ))}
            </div>
          )}

          {!activeReport && !certLoading && !sampleLoading && !certError && !sampleError && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FlaskConical className="w-10 h-10 text-surface-300 mb-3" />
              <p className="text-surface-500 text-sm">
                Enter a cert number or run a sample check to begin validation.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Status tab ──────────────────────────────────────────────────────── */}
      {tab === 'status' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-surface-500">
              {statusData
                ? `Last checked: ${new Date(statusData.checked_at).toLocaleString()}`
                : 'Loading database summary...'}
            </p>
            <Button variant="secondary" size="sm" onClick={() => refetchStatus()} disabled={statusLoading}>
              <RefreshCw className={`w-3.5 h-3.5 ${statusLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {statusLoading && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          )}

          {statusData && <StatusOverview status={statusData} />}
        </div>
      )}

      {/* ── Formulas tab ─────────────────────────────────────────────────────── */}
      {tab === 'formulas' && <FormulaReference />}
    </div>
  );
}
