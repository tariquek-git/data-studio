/**
 * FormulaReference
 * Displays standard banking formula definitions with source links.
 */

import { ExternalLink } from 'lucide-react';
import { Card, Badge } from '@/components/ui';

interface FormulaSource {
  label: string;
  href: string;
}

interface Formula {
  name: string;
  abbreviation: string;
  definition: string;
  numerator: string;
  denominator: string;
  notes: string;
  sources: FormulaSource[];
  benchmarks?: string;
}

const FORMULAS: Formula[] = [
  {
    name: 'Return on Assets',
    abbreviation: 'ROA',
    definition: 'Measures how efficiently a bank uses its assets to generate profit.',
    numerator: 'Net Income',
    denominator: 'Average Total Assets',
    notes: 'FDIC pre-computes using annualized net income. Values above 1% are generally considered strong.',
    benchmarks: 'Industry avg: ~1.05% | Strong: >1.2% | Weak: <0.5%',
    sources: [
      { label: 'FDIC SDI Glossary', href: 'https://banks.data.fdic.gov/docs/#/Financial%20Data/getFinancials' },
      { label: 'CFA Institute', href: 'https://www.cfainstitute.org/en/membership/professional-development/refresher-readings/financial-analysis-techniques' },
    ],
  },
  {
    name: 'Return on Equity',
    abbreviation: 'ROE',
    definition: 'Measures the return generated on shareholders\' equity.',
    numerator: 'Net Income',
    denominator: 'Average Total Equity Capital',
    notes: 'Also called ROI in FDIC data (field: ROE). Higher leverage amplifies ROE relative to ROA.',
    benchmarks: 'Industry avg: ~10.5% | Strong: >12% | Weak: <6%',
    sources: [
      { label: 'FDIC SDI Glossary', href: 'https://banks.data.fdic.gov/docs/#/Financial%20Data/getFinancials' },
      { label: 'CFA Institute', href: 'https://www.cfainstitute.org/en/membership/professional-development/refresher-readings/financial-analysis-techniques' },
    ],
  },
  {
    name: 'Net Interest Margin',
    abbreviation: 'NIM',
    definition: 'Measures the spread between interest income earned and interest paid, relative to earning assets.',
    numerator: 'Interest Income − Interest Expense',
    denominator: 'Average Earning Assets (proxied by Total Assets)',
    notes: 'FDIC fields: (INTINC − EINTEXP) / ASSET × 100. Federal Reserve uses average earning assets; we proxy with total assets from FDIC.',
    benchmarks: 'Normal range: 2.5%–4.5% | Very low: <1.5% | Very high: >6%',
    sources: [
      { label: 'Federal Reserve Definition', href: 'https://www.federalreserve.gov/releases/h8/h8_technical_q_and_a.htm' },
      { label: 'FDIC SDI Fields', href: 'https://banks.data.fdic.gov/docs/#/Financial%20Data/getFinancials' },
    ],
  },
  {
    name: 'Efficiency Ratio',
    abbreviation: 'Eff. Ratio',
    definition: 'Non-interest expense as a percentage of total revenue. Lower means more efficient.',
    numerator: 'Non-Interest Expense (ELNATR)',
    denominator: 'Net Interest Income + Non-Interest Income',
    notes: 'FDIC fields: ELNATR / (INTINC − EINTEXP + NONII) × 100. Below 60% is considered efficient.',
    benchmarks: 'Excellent: <55% | Good: 55%–65% | Needs improvement: >70%',
    sources: [
      { label: 'FDIC SDI Fields', href: 'https://banks.data.fdic.gov/docs/#/Financial%20Data/getFinancials' },
      { label: 'OCC Handbook', href: 'https://www.occ.gov/publications-and-resources/publications/comptrollers-handbook/index-comptrollers-handbook.html' },
    ],
  },
  {
    name: 'Texas Ratio',
    abbreviation: 'Texas Ratio',
    definition: 'Predicts bank failure risk by comparing non-performing assets to capital buffer.',
    numerator: 'Non-Performing Assets (NPAs)',
    denominator: 'Tangible Equity Capital + Loan Loss Reserves',
    notes: 'Not directly pre-computed by FDIC. A value above 100% has historically predicted bank failures. Requires NPA and loan loss reserve data.',
    benchmarks: 'Low risk: <30% | Moderate: 30%–75% | High risk: >100%',
    sources: [
      { label: 'RBC Capital Markets (original research)', href: 'https://www.fdic.gov/bank/analytical/quarterly/2009_vol3_2/article.pdf' },
      { label: 'FDIC Quarterly', href: 'https://www.fdic.gov/bank/analytical/quarterly/' },
    ],
  },
  {
    name: 'Loan-to-Deposit Ratio',
    abbreviation: 'LTD',
    definition: 'Shows how much of deposits are deployed as loans.',
    numerator: 'Net Loans (NETLOANS)',
    denominator: 'Total Deposits (DEP)',
    notes: 'Too high (>90%) may signal liquidity risk; too low (<60%) may signal excess liquidity dragging ROA.',
    benchmarks: 'Optimal: 70%–85% | Low: <60% | High: >90%',
    sources: [
      { label: 'FDIC SDI Fields', href: 'https://banks.data.fdic.gov/docs/#/Financial%20Data/getFinancials' },
      { label: 'OCC Liquidity Guidance', href: 'https://www.occ.gov/topics/supervision-and-examination/bank-operations/liquidity/index-liquidity.html' },
    ],
  },
];

export function FormulaReference() {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-surface-900">Formula Reference</h2>
          <p className="text-xs text-surface-500 mt-0.5">
            Standard banking metrics with definitions, computation details, and primary sources.
          </p>
        </div>
        <a
          href="https://banks.data.fdic.gov/docs/#/Financial%20Data/getFinancials"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 shrink-0"
        >
          FDIC SDI Docs
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FORMULAS.map((formula) => (
          <Card key={formula.abbreviation} className="flex flex-col gap-3">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-surface-900">{formula.name}</h3>
                <p className="text-xs text-surface-500 mt-0.5">{formula.definition}</p>
              </div>
              <Badge color="blue" className="shrink-0">{formula.abbreviation}</Badge>
            </div>

            {/* Formula display */}
            <div className="bg-surface-50 rounded-lg px-4 py-3 text-center">
              <div className="inline-flex flex-col items-center gap-0.5">
                <span className="text-sm font-medium text-surface-800 border-b border-surface-400 pb-1 w-full text-center">
                  {formula.numerator}
                </span>
                <span className="text-sm font-medium text-surface-800 pt-1">
                  {formula.denominator}
                </span>
              </div>
            </div>

            {/* Notes */}
            <p className="text-xs text-surface-600">{formula.notes}</p>

            {/* Benchmarks */}
            {formula.benchmarks && (
              <div className="bg-blue-50 rounded-md px-3 py-2">
                <p className="text-xs text-blue-700">{formula.benchmarks}</p>
              </div>
            )}

            {/* Sources */}
            <div className="flex flex-wrap gap-2 mt-auto">
              {formula.sources.map((source) => (
                <a
                  key={source.href}
                  href={source.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 bg-primary-50 hover:bg-primary-100 px-2 py-0.5 rounded-md transition-colors"
                >
                  {source.label}
                  <ExternalLink className="w-3 h-3" />
                </a>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
