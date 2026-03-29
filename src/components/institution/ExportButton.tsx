import { useState, useRef, useEffect } from 'react';
import { Download, ChevronDown, Link2, Check, Loader2, FileText } from 'lucide-react';
import { exportInstitutionToExcel } from '@/lib/export';
import type { Institution, FinancialHistory } from '@/types/institution';

interface ExportButtonProps {
  institution: Institution;
  history: FinancialHistory[];
}

export function ExportButton({ institution, history }: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  function handleExcelExport() {
    setOpen(false);
    exportInstitutionToExcel(institution, history);
  }

  async function handlePDFExport() {
    setOpen(false);
    setPdfLoading(true);
    try {
      const { downloadInstitutionPDF } = await import('@/lib/pdf/useInstitutionPDF');
      await downloadInstitutionPDF(institution, history);
    } catch (err) {
      console.error('PDF generation failed:', err);
    } finally {
      setPdfLoading(false);
    }
  }

  async function handleCopyLink() {
    setOpen(false);
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers that block clipboard without user gesture
      const input = document.createElement('input');
      input.value = window.location.href;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="relative inline-block" ref={containerRef}>
      {/* Main button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        disabled={pdfLoading}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-surface-300 bg-white text-sm font-medium text-surface-700 hover:bg-surface-50 hover:border-surface-400 transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-60 disabled:cursor-not-allowed"
        aria-haspopup="true"
        aria-expanded={open}
      >
        {pdfLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary-600" />
        ) : copied ? (
          <Check className="h-3.5 w-3.5 text-green-600" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        {pdfLoading ? 'Generating PDF…' : copied ? 'Copied!' : 'Export'}
        {!pdfLoading && <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>

      {/* Dropdown menu */}
      {open && (
        <div className="absolute right-0 mt-1.5 w-48 bg-white rounded-xl border border-surface-200 shadow-lg z-50 overflow-hidden">
          <button
            onClick={handleExcelExport}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-surface-700 hover:bg-surface-50 transition-colors text-left"
          >
            <Download className="h-4 w-4 text-green-600 shrink-0" />
            <div>
              <p className="font-medium">Export to Excel</p>
              <p className="text-xs text-surface-400">Profile + history + raw data</p>
            </div>
          </button>

          <div className="border-t border-surface-100" />

          <button
            onClick={handlePDFExport}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-surface-700 hover:bg-primary-50 hover:text-primary-700 transition-colors text-left"
          >
            <FileText className="h-4 w-4 text-primary-600 shrink-0" />
            <div>
              <p className="font-medium">Export to PDF</p>
              <p className="text-xs text-surface-400">Bloomberg-style one-pager</p>
            </div>
          </button>

          <div className="border-t border-surface-100" />

          <button
            onClick={handleCopyLink}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-surface-700 hover:bg-surface-50 transition-colors text-left"
          >
            <Link2 className="h-4 w-4 text-primary-600 shrink-0" />
            <div>
              <p className="font-medium">Copy Link</p>
              <p className="text-xs text-surface-400">Shareable URL to this page</p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
