import React from 'react';
import type { Institution, FinancialHistory } from '@/types/institution';

/**
 * Downloads a PDF report for the given institution.
 * Uses dynamic import to avoid SSR/Node.js conflicts with @react-pdf/renderer
 * during Vite's build-time analysis.
 */
export async function downloadInstitutionPDF(
  institution: Institution,
  history: FinancialHistory[],
): Promise<void> {
  // Dynamic import keeps react-pdf out of the initial bundle and avoids
  // build-time issues with Node.js-only modules inside @react-pdf/renderer.
  const [{ pdf }, { InstitutionReport }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./InstitutionReport'),
  ]);

  // Cast required: pdf() expects ReactElement<DocumentProps>; InstitutionReport
  // renders a <Document> at its root but TypeScript cannot infer that here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(InstitutionReport, { institution, history }) as any;
  const blob = await pdf(element).toBlob();

  const safeFileName = institution.name.replace(/[^a-z0-9]/gi, '_').replace(/__+/g, '_');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFileName}_Report.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
