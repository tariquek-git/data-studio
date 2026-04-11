#!/usr/bin/env python3
"""
agent_scraper_ca.py — Extract financials from Canadian CU annual reports.

Targets 26 Canadian CUs that are currently missing financial data.
Downloads annual report PDFs, extracts key metrics with pdfplumber,
stores in institutions table and financial_history.

Rules:
  - No LLM/AI API calls. pdfplumber only.
  - Reports are in thousands of CAD → multiply by 1000 before storing
  - cert_number 900001+ for Canadian CUs
  - Delete PDF after extraction
  - Set data_confidence = 'medium', data_provenance = 'annual_report_pdf'

Run: python scripts/agent_scraper_ca.py [--dry-run] [--cert 900003]
"""
import sys
import os
import re
import json
import tempfile
import time
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from _db import check_write_access, SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY
import requests
from datetime import datetime, date

try:
    import pdfplumber
    HAS_PDF = True
except ImportError:
    HAS_PDF = False
    print('WARNING: pdfplumber not installed. Run: pip install pdfplumber')

DRY_RUN = '--dry-run' in sys.argv
TARGET_CERT = None
for i, arg in enumerate(sys.argv):
    if arg == '--cert' and i + 1 < len(sys.argv):
        TARGET_CERT = int(sys.argv[i + 1])

if not DRY_RUN:
    check_write_access()

KEY = SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY
HEADERS_R = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}
HEADERS_W = {**HEADERS_R, 'Prefer': 'return=minimal'}

# ── Curated Canadian CU annual report data ──────────────────────────────────
# Each entry: cert_number, name, annual_report_url (PDF direct link or report page)
# URLs updated for fiscal year 2023/2024. Re-run annually.
#
# Pattern: look for "Consolidated Statement of Financial Position"
# Values in thousands CAD unless noted.

CA_CU_TARGETS = [
    {
        'cert_number': 900003,
        'name': 'First West Credit Union',
        'province': 'BC',
        'report_page': 'https://www.firstwestcu.ca/about-us/investor-relations/annual-report/',
        'pdf_pattern': r'annual.report.*\.pdf',
        'data_as_of': '2023-12-31',
    },
    {
        'cert_number': 900004,
        'name': 'BlueShore Financial',
        'province': 'BC',
        'report_page': 'https://www.blueshorefinancial.com/about-us/about-blueshore/annual-report',
        'pdf_pattern': r'annual.report.*\.pdf',
        'data_as_of': '2023-12-31',
    },
    {
        'cert_number': 900005,
        'name': 'Beem Credit Union',
        'province': 'BC',
        'report_page': 'https://www.beemcreditunion.ca/about/annual-report',
        'pdf_pattern': r'annual.*report.*\.pdf',
        'data_as_of': '2023-12-31',
    },
    {
        'cert_number': 900006,
        'name': 'Prospera Credit Union',
        'province': 'BC',
        'report_page': 'https://www.prospera.ca/about-us/annual-report',
        'pdf_pattern': r'annual.*report.*\.pdf',
        'data_as_of': '2023-12-31',
    },
    {
        'cert_number': 900007,
        'name': 'Island Savings',
        'province': 'BC',
        'report_page': 'https://www.islandsavings.ca/about-us/annual-report',
        'pdf_pattern': r'annual.*report.*\.pdf',
        'data_as_of': '2023-10-31',
    },
    {
        'cert_number': 900008,
        'name': 'G&F Financial Group',
        'province': 'BC',
        'report_page': 'https://www.gfraser.com/about/investor-relations',
        'pdf_pattern': r'annual.*report.*\.pdf',
        'data_as_of': '2023-12-31',
    },
    {
        'cert_number': 900009,
        'name': 'Westminster Savings',
        'province': 'BC',
        'report_page': 'https://www.wscu.com/about-us/annual-reports',
        'pdf_pattern': r'annual.*report.*\.pdf',
        'data_as_of': '2023-12-31',
    },
    {
        'cert_number': 900010,
        'name': 'Envision Financial',
        'province': 'BC',
        'report_page': 'https://www.envisionfinancial.ca/about-us/annual-report',
        'pdf_pattern': r'annual.*report.*\.pdf',
        'data_as_of': '2023-12-31',
    },
    {
        'cert_number': 900012,
        'name': 'Alterna Savings',
        'province': 'ON',
        'report_page': 'https://www.alterna.ca/about-alterna/annual-report',
        'pdf_pattern': r'annual.*report.*\.pdf',
        'data_as_of': '2023-12-31',
    },
    {
        'cert_number': 900013,
        'name': 'DUCA',
        'province': 'ON',
        'report_page': 'https://www.dfrcu.com/about-duca/investor-relations/annual-report',
        'pdf_pattern': r'annual.*report.*\.pdf',
        'data_as_of': '2023-12-31',
    },
    {
        'cert_number': 900014,
        'name': 'Desjardins Ontario',
        'province': 'ON',
        'report_page': 'https://www.desjardins.com/en/a-propos/publications/rapports-annuels/',
        'pdf_pattern': r'annual.*report.*\.pdf',
        'data_as_of': '2023-12-31',
    },
    {
        'cert_number': 900015,
        'name': 'Libro Credit Union',
        'province': 'ON',
        'report_page': 'https://www.libro.ca/about-libro/annual-report',
        'pdf_pattern': r'annual.*report.*\.pdf',
        'data_as_of': '2023-12-31',
    },
    {
        'cert_number': 900016,
        'name': 'FirstOntario',
        'province': 'ON',
        'report_page': 'https://www.firstontario.com/about-firstontario/annual-report',
        'pdf_pattern': r'annual.*report.*\.pdf',
        'data_as_of': '2023-12-31',
    },
    {
        'cert_number': 900017,
        'name': 'Kindred Credit Union',
        'province': 'ON',
        'report_page': 'https://www.kindredcu.com/about-kindred/annual-report',
        'pdf_pattern': r'annual.*report.*\.pdf',
        'data_as_of': '2023-12-31',
    },
    {
        'cert_number': 900018,
        'name': 'Moya Financial',
        'province': 'ON',
        'report_page': 'https://www.moyafinancial.ca/about/annual-reports',
        'pdf_pattern': r'annual.*report.*\.pdf',
        'data_as_of': '2023-12-31',
    },
    {
        'cert_number': 900020,
        'name': 'Connect First',
        'province': 'AB',
        'report_page': 'https://www.connectfirstcu.com/about-us/annual-report',
        'pdf_pattern': r'annual.*report.*\.pdf',
        'data_as_of': '2023-12-31',
    },
    {
        'cert_number': 900021,
        'name': 'Access Credit Union',
        'province': 'MB',
        'report_page': 'https://www.accesscu.ca/about-us/annual-report',
        'pdf_pattern': r'annual.*report.*\.pdf',
        'data_as_of': '2023-12-31',
    },
    {
        'cert_number': 900022,
        'name': 'Steinbach Credit Union',
        'province': 'MB',
        'report_page': 'https://www.scu.mb.ca/about/annual-report',
        'pdf_pattern': r'annual.*report.*\.pdf',
        'data_as_of': '2023-12-31',
    },
    {
        'cert_number': 900023,
        'name': 'Assiniboine Credit Union',
        'province': 'MB',
        'report_page': 'https://www.acu.ca/about-acu/annual-report',
        'pdf_pattern': r'annual.*report.*\.pdf',
        'data_as_of': '2023-12-31',
    },
    {
        'cert_number': 900024,
        'name': 'Cambrian Credit Union',
        'province': 'MB',
        'report_page': 'https://www.cambrian.mb.ca/about-us/annual-reports',
        'pdf_pattern': r'annual.*report.*\.pdf',
        'data_as_of': '2023-12-31',
    },
    {
        'cert_number': 900025,
        'name': 'Innovation Credit Union',
        'province': 'SK',
        'report_page': 'https://www.innovationcu.ca/about-innovation/annual-report',
        'pdf_pattern': r'annual.*report.*\.pdf',
        'data_as_of': '2023-12-31',
    },
    {
        'cert_number': 900026,
        'name': 'Conexus Credit Union',
        'province': 'SK',
        'report_page': 'https://www.conexus.ca/about/annual-report',
        'pdf_pattern': r'annual.*report.*\.pdf',
        'data_as_of': '2023-12-31',
    },
    {
        'cert_number': 900027,
        'name': 'Affinity Credit Union',
        'province': 'SK',
        'report_page': 'https://www.affinitycu.ca/about/annual-report',
        'pdf_pattern': r'annual.*report.*\.pdf',
        'data_as_of': '2023-12-31',
    },
    {
        'cert_number': 900028,
        'name': 'Cornerstone Credit Union',
        'province': 'SK',
        'report_page': 'https://www.cornerstonecu.com/about/annual-report',
        'pdf_pattern': r'annual.*report.*\.pdf',
        'data_as_of': '2023-12-31',
    },
    {
        'cert_number': 900029,
        'name': 'UNI Financial Cooperation',
        'province': 'NB',
        'report_page': 'https://www.uni.ca/a-propos/publications/rapport-annuel',
        'pdf_pattern': r'rapport.annuel.*\.pdf|annual.report.*\.pdf',
        'data_as_of': '2023-12-31',
    },
    {
        'cert_number': 900030,
        'name': 'East Coast Credit Union',
        'province': 'NS',
        'report_page': 'https://www.eastcoastcu.ca/about-us/annual-reports',
        'pdf_pattern': r'annual.*report.*\.pdf',
        'data_as_of': '2023-12-31',
    },
]

# ── Financial extraction helpers ─────────────────────────────────────────────

# Patterns for key balance sheet line items (case-insensitive)
EXTRACTION_PATTERNS = {
    'total_assets': [
        r'total\s+assets\s+[\$\d,]+\s+([\d,]+)',
        r'total\s+assets[^\d]+([\d,]+)',
        r'TOTAL\s+ASSETS\s+([\d,]+)',
    ],
    'total_deposits': [
        r'total\s+deposits\s+[\$\d,]+\s+([\d,]+)',
        r'total\s+(?:member\s+)?deposits[^\d]+([\d,]+)',
        r'deposits\s+from\s+members[^\d]+([\d,]+)',
        r'member\s+deposits[^\d]+([\d,]+)',
    ],
    'total_loans': [
        r'total\s+(?:loans|loan\s+portfolio)[^\d]+([\d,]+)',
        r'loans\s+and\s+advances\s+to\s+members[^\d]+([\d,]+)',
        r'loans\s+to\s+members[^\d]+([\d,]+)',
        r'net\s+loans[^\d]+([\d,]+)',
    ],
    'equity_capital': [
        r'total\s+(?:members\s*[\'']?\s*)?equity[^\d]+([\d,]+)',
        r'members[\'']?\s+equity[^\d]+([\d,]+)',
        r'total\s+equity\s+and\s+reserves[^\d]+([\d,]+)',
        r'shareholders[\'"]?\s+equity[^\d]+([\d,]+)',
    ],
    'net_income': [
        r'net\s+(?:income|earnings|surplus|profit)[^\d-]+([\d,]+)',
        r'net\s+income\s+(?:after\s+tax|for\s+the\s+year)[^\d]+([\d,]+)',
        r'surplus\s+for\s+the\s+year[^\d]+([\d,]+)',
        r'net\s+earnings\s+for\s+the\s+year[^\d]+([\d,]+)',
    ],
}


def parse_number(text: str) -> int | None:
    """Parse a number string like '1,234,567' → 1234567. Returns None if invalid."""
    clean = re.sub(r'[,\s]', '', text.strip())
    if not clean or not re.match(r'^\d+$', clean):
        return None
    return int(clean)


def extract_financials_from_text(text: str) -> dict:
    """Extract financial values from PDF text using regex patterns."""
    text_lower = text.lower()
    results = {}

    for field, patterns in EXTRACTION_PATTERNS.items():
        for pat in patterns:
            m = re.search(pat, text_lower, re.IGNORECASE | re.MULTILINE)
            if m:
                val = parse_number(m.group(1))
                if val and val > 1000:  # Sanity check: at least 1M CAD in thousands
                    results[field] = val * 1000  # Convert thousands to actual CAD
                    break

    return results


def find_pdf_link(page_url: str, pdf_pattern: str) -> str | None:
    """Scrape a page to find a PDF download link matching pattern."""
    try:
        resp = requests.get(
            page_url,
            headers={'User-Agent': 'Mozilla/5.0 (compatible; FinTechCommons/1.0)'},
            timeout=15,
            allow_redirects=True,
        )
        if resp.status_code != 200:
            return None

        # Find all href links ending in .pdf
        hrefs = re.findall(r'href=["\']([^"\']*\.pdf[^"\']*)["\']', resp.text, re.IGNORECASE)
        pattern = re.compile(pdf_pattern, re.IGNORECASE)
        for href in hrefs:
            if pattern.search(href):
                # Make absolute URL
                if href.startswith('http'):
                    return href
                elif href.startswith('/'):
                    from urllib.parse import urlparse
                    parsed = urlparse(page_url)
                    return f'{parsed.scheme}://{parsed.netloc}{href}'
                else:
                    return page_url.rsplit('/', 1)[0] + '/' + href

        # If no pattern match, return first PDF found
        if hrefs:
            href = hrefs[0]
            if href.startswith('http'):
                return href
            elif href.startswith('/'):
                from urllib.parse import urlparse
                parsed = urlparse(page_url)
                return f'{parsed.scheme}://{parsed.netloc}{href}'

    except Exception as e:
        print(f'  Error fetching {page_url}: {e}')
    return None


def download_pdf(url: str) -> str | None:
    """Download PDF to temp file. Returns path or None."""
    try:
        resp = requests.get(
            url,
            headers={'User-Agent': 'Mozilla/5.0 (compatible; FinTechCommons/1.0)'},
            timeout=60,
            stream=True,
        )
        if resp.status_code != 200:
            return None
        suffix = '.pdf'
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)
            return f.name
    except Exception as e:
        print(f'  Download error: {e}')
    return None


def extract_from_pdf(pdf_path: str) -> dict:
    """Extract financial data from PDF using pdfplumber."""
    if not HAS_PDF:
        return {}
    try:
        with pdfplumber.open(pdf_path) as pdf:
            all_text = ''
            # Focus on financial statement pages (usually in latter half)
            pages = pdf.pages
            # First pass: find the balance sheet page
            for page in pages:
                text = page.extract_text() or ''
                if any(kw in text.lower() for kw in [
                    'statement of financial position',
                    'consolidated balance sheet',
                    'total assets',
                ]):
                    all_text += text + '\n'

            if not all_text:
                # Second pass: scan all pages
                for page in pages:
                    all_text += (page.extract_text() or '') + '\n'

        return extract_financials_from_text(all_text)
    except Exception as e:
        print(f'  PDF extraction error: {e}')
        return {}


def update_institution(cert_number: int, data: dict) -> bool:
    resp = requests.patch(
        f'{SUPABASE_URL}/rest/v1/institutions',
        headers=HEADERS_W,
        params={'cert_number': f'eq.{cert_number}'},
        json=data,
        timeout=30,
    )
    return resp.status_code in (200, 204)


def insert_financial_history(cert_number: int, data: dict, data_as_of: str) -> bool:
    # First get the institution id
    resp = requests.get(
        f'{SUPABASE_URL}/rest/v1/institutions',
        headers=HEADERS_R,
        params={'cert_number': f'eq.{cert_number}', 'select': 'id'},
        timeout=30,
    )
    if resp.status_code != 200 or not resp.json():
        return False
    entity_id = resp.json()[0]['id']

    record = {
        'entity_id': entity_id,
        'period_end_date': data_as_of,
        'period_type': 'annual',
        'total_assets': data.get('total_assets'),
        'total_deposits': data.get('total_deposits'),
        'total_loans': data.get('total_loans'),
        'equity_capital': data.get('equity_capital'),
        'net_income': data.get('net_income'),
        'data_source': 'annual_report_pdf',
    }
    record = {k: v for k, v in record.items() if v is not None}

    resp2 = requests.post(
        f'{SUPABASE_URL}/rest/v1/financial_history',
        headers={**HEADERS_W, 'Prefer': 'resolution=merge-duplicates,return=minimal'},
        json=record,
        timeout=30,
    )
    return resp2.status_code in (200, 201)


def process_cu(target: dict) -> dict:
    """Process one CU. Returns result dict with status and extracted data."""
    cert = target['cert_number']
    name = target['name']
    print(f'\n[{cert}] {name} ({target["province"]})')

    # Step 1: Find PDF
    print(f'  Searching: {target["report_page"]}')
    pdf_url = find_pdf_link(target['report_page'], target['pdf_pattern'])
    if not pdf_url:
        print(f'  MISS: No PDF found at report page')
        return {'cert_number': cert, 'name': name, 'status': 'no_pdf'}

    print(f'  Found PDF: {pdf_url}')
    if DRY_RUN:
        return {'cert_number': cert, 'name': name, 'status': 'dry_run', 'pdf_url': pdf_url}

    # Step 2: Download
    pdf_path = download_pdf(pdf_url)
    if not pdf_path:
        print(f'  FAIL: Could not download PDF')
        return {'cert_number': cert, 'name': name, 'status': 'download_failed'}

    # Step 3: Extract
    financials = extract_from_pdf(pdf_path)

    # Step 4: Clean up PDF
    try:
        os.unlink(pdf_path)
    except Exception:
        pass

    if not financials:
        print(f'  FAIL: No financial data extracted from PDF')
        return {'cert_number': cert, 'name': name, 'status': 'extraction_failed'}

    # Step 5: Validate
    total_assets = financials.get('total_assets', 0)
    total_deposits = financials.get('total_deposits', 0)
    equity = financials.get('equity_capital', 0)
    if total_assets > 0 and total_deposits > total_assets:
        print(f'  WARN: deposits ({total_deposits:,}) > assets ({total_assets:,}) — check units')

    # Step 6: Calculate ROA
    net_income = financials.get('net_income', 0)
    if total_assets > 0 and net_income:
        financials['roa'] = round((net_income / total_assets) * 100, 4)

    print(f'  Extracted: assets={total_assets:,} deposits={financials.get("total_deposits","?"):,} roa={financials.get("roa", "—")}')

    # Step 7: Write to DB
    institution_update = {
        **financials,
        'data_as_of': target['data_as_of'],
        'last_synced_at': datetime.utcnow().isoformat() + 'Z',
        'data_confidence': 'medium',
        'data_provenance': 'annual_report_pdf',
    }
    ok1 = update_institution(cert, institution_update)
    ok2 = insert_financial_history(cert, financials, target['data_as_of'])

    status = 'ok' if (ok1 and ok2) else 'partial'
    print(f'  DB write: institutions={ok1} financial_history={ok2}')
    return {'cert_number': cert, 'name': name, 'status': status, 'data': financials}


def main():
    print('=== agent_scraper_ca.py — Canadian CU Annual Report Scraper ===')
    print(f'Mode: {"DRY RUN" if DRY_RUN else "LIVE"}')
    if not HAS_PDF and not DRY_RUN:
        print('ERROR: pdfplumber required. Run: pip install pdfplumber')
        sys.exit(1)
    print()

    targets = CA_CU_TARGETS
    if TARGET_CERT:
        targets = [t for t in targets if t['cert_number'] == TARGET_CERT]
        if not targets:
            print(f'No target found for cert_number {TARGET_CERT}')
            sys.exit(1)

    print(f'Targets: {len(targets)} Canadian CUs to scrape')
    print()

    results = []
    for target in targets:
        result = process_cu(target)
        results.append(result)
        time.sleep(1)  # Be polite to CU servers

    print('\n=== Summary ===')
    ok = [r for r in results if r['status'] == 'ok']
    partial = [r for r in results if r['status'] == 'partial']
    no_pdf = [r for r in results if r['status'] == 'no_pdf']
    failed = [r for r in results if r['status'] in ('download_failed', 'extraction_failed')]

    print(f'Total targeted : {len(results)}')
    print(f'Successful     : {len(ok)}')
    print(f'Partial        : {len(partial)}')
    print(f'No PDF found   : {len(no_pdf)}')
    print(f'Failed         : {len(failed)}')

    if no_pdf or failed:
        print('\nManual follow-up needed:')
        for r in no_pdf + failed:
            print(f'  [{r["cert_number"]}] {r["name"]} — {r["status"]}')

    if DRY_RUN:
        print('\n(DRY RUN — no writes made)')
        if results:
            print('PDF URLs found:')
            for r in results:
                if r.get('pdf_url'):
                    print(f'  [{r["cert_number"]}] {r["name"]}: {r["pdf_url"]}')


if __name__ == '__main__':
    main()
