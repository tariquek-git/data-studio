# Brim Financial Public-Surface and Local Workspace Audit

> Superseded by [brim_audit_consolidated_2026-03-28.md](/Users/tarique/Documents/New project/brim_audit_consolidated_2026-03-28.md).
> Use the consolidated report for the corrected RPAA interpretation, the color-coded severity model, the privacy deep dive, and the technology replacement matrix.

Date: 2026-03-28

## Executive Summary

This was a passive audit of `brimfinancial.com` plus a security review of the local workspace at `/Users/tarique/Documents/New project`.

No critical remote exploit was validated. The strongest issues found were governance and compliance-oriented:

1. The live site appears to load analytics and set at least one analytics cookie before any visible consent control on the homepage.
2. The legal hub still links to stale 2018 privacy and website-terms PDFs, while the HTML privacy page says it was last updated on November 14, 2025.
3. The public homepage currently fails multiple accessibility checks, including duplicate IDs and missing/ineffective alternative text in linked images.

The public technical posture is otherwise stronger than average for a marketing site: valid TLS, HSTS, CSP, COOP, `X-Frame-Options`, and `nosniff` are all present. The local workspace is only a small static dashboard, not Brim's application codebase, so code-level coverage is limited.

## Scope And Limits

- Passive checks only. No intrusive scanning, credentialed access, exploit attempts, fuzzing, or rate-heavy probing.
- Public sources only for website/compliance review.
- Local code review covered only the files present in this workspace:
  - `/Users/tarique/Documents/New project/dashboard.html`
  - `/Users/tarique/Documents/New project/dashboard.js`
  - `/Users/tarique/Documents/New project/dashboard.css`
- This workspace is not a git repo and does not contain backend code, infrastructure-as-code, CI, secrets management, server configs, or the production Brim application.

## Methods Used

- HTTP/TLS/header checks with `curl`, `openssl`, and `dig`
- Public legal/privacy/security page review
- Wayback CDX lookups for historical snapshots
- Browser validation with Playwright
- Accessibility scan with `pa11y`
- Local static code review and secret-pattern grep

## Findings

### F-01: Likely consent gap for analytics on the homepage

- Severity: Medium
- Confidence: High
- What it means: The homepage appears to load analytics and set at least one analytics cookie before any visible cookie-choice control is present. For a Canadian financial-services site, that creates a meaningful privacy/compliance risk unless Brim has a lawful basis and classification showing the cookie is strictly necessary.
- Evidence:
  - Homepage source includes Statcounter and tracking variables:
    - `session_id` and `ip_address` appear inline at lines 85-87 of the fetched homepage HTML.
    - `statcounter` appears at lines 2512-2519 of the fetched homepage HTML.
  - Playwright on first anonymous visit showed cookies including:
    - `sc_is_visitor_unique=...`
    - `PHPSESSID=...`
  - Playwright evaluation on the rendered homepage returned `{ "exists": false }` for `#cookie_popup`, so the consent widget was not present in the live DOM.
  - Homepage markup contains `<!-- Cookie popup disabled -->` and a commented-out consent block at lines 939-952 of the fetched homepage HTML.
  - The privacy page says Brim seeks additional cookie consent "where required by law" and offers cookie-related choices.
- Evidence commands:

```text
curl -sS https://brimfinancial.com/ | nl -ba | sed -n '78,95p'
curl -sS https://brimfinancial.com/ | nl -ba | sed -n '936,952p'
curl -sS https://brimfinancial.com/ | nl -ba | rg -n 'statcounter|sc_project|sc_security|counter.js'
"$PWCLI" cookie-list
"$PWCLI" eval "() => { const el = document.querySelector('#cookie_popup'); ... }"
```

- Inference boundary: I did not classify each cookie under Brim's internal consent taxonomy. The conclusion is that a non-essential analytics signal is very likely active pre-consent, not that a regulator has already deemed it unlawful.

### F-02: Legal hub links stale privacy and website-terms documents

- Severity: Medium
- Confidence: High
- What it means: The legal page currently links a privacy PDF named `brim-privacy-policy-2018-06-01.pdf` and a website terms PDF dated April 1, 2018, while the live HTML privacy page states `Last Updated: November 14, 2025`. That creates a real disclosure/version-control problem for customers, auditors, and complaints handling.
- Evidence:
  - Current legal page links:
    - privacy PDF: line 1170
    - website terms PDF: line 1156
  - Current privacy HTML page:
    - `Last Updated: November 14, 2025` at line 1025
  - Downloaded PDF metadata:
    - privacy PDF creation date: June 27, 2018
    - website terms PDF date in body: April 1, 2018
  - Wayback shows the legal hub existed in 2019 and 2022 with the same general document-hub pattern, which suggests this stale-document risk has persisted over time.
- Evidence commands:

```text
curl -sS https://brimfinancial.com/legal | rg -n 'Website-terms-of-use|brim-privacy-policy-2018-06-01'
curl -sS https://brimfinancial.com/privacy | nl -ba | sed -n '1020,1026p'
pdfinfo tmp/audit/privacy_2018.pdf
pdftotext tmp/audit/terms.pdf -
curl -sS 'https://web.archive.org/cdx/search/cdx?url=brimfinancial.com/legal&output=json&...'
```

### F-03: Homepage accessibility issues are publicly reproducible

- Severity: Medium
- Confidence: High
- What it means: The homepage currently fails a number of WCAG-oriented checks. For a financial-services site, that is operational and compliance-relevant, especially for user onboarding and support journeys.
- Evidence:
  - `pa11y https://brimfinancial.com` returned 46 errors.
  - Confirmed examples:
    - duplicate `id="navbar"`
    - duplicate `menu-item-*` IDs
    - missing/ineffective alt text for linked images
    - a form without a submit button
    - insufficient contrast on at least one control
  - There is no public accessibility page at `https://brimfinancial.com/accessibility` (HTTP 404).
- Evidence commands:

```text
npx -y pa11y https://brimfinancial.com
curl -sSIL https://brimfinancial.com/accessibility
```

- Note: This is not a full manual WCAG audit, but the failures above are concrete and reproducible.

### F-04: No public vulnerability-disclosure channel was found

- Severity: Low
- Confidence: High
- What it means: The site has a security page, but no public `security.txt`, security contact, responsible-disclosure page, or bug-bounty reference was found. That increases friction for external researchers trying to report a real issue safely.
- Evidence:
  - `https://brimfinancial.com/.well-known/security.txt` returns HTTP 404.
  - Site searches found `support@brimfinancial.com` and `privacy@brimfinancial.com`, but no `security@brimfinancial.com`, `responsible disclosure`, or `bug bounty`.
- Evidence commands:

```text
curl -sSIL https://brimfinancial.com/.well-known/security.txt
curl -sS https://brimfinancial.com/security | rg -n -i 'security@|responsible disclosure|bug bounty|vulnerability disclosure'
```

### F-05: Visitor IP and session-tracking values are exposed in client-side HTML

- Severity: Low
- Confidence: High
- What it means: The homepage writes a visitor IP address and session-like identifier into inline JavaScript. This is poor data-minimization hygiene and expands the number of scripts that can read those values.
- Evidence:
  - Homepage lines 85-87 expose:
    - `const API_URL = "https://cookietracker.brim.ca/cookie_tracking/endpoint.php";`
    - `const session_id = "...";`
    - `const ip_address = "...";`
- Caveat: The user's browser already knows its own IP in the network sense, so this is not equivalent to a server-side secret leak. The issue is unnecessary client exposure of tracking-related data.

### F-06: Security and trust claims are stronger than the public proof made available

- Severity: Low
- Confidence: Medium
- What it means: The current security page claims SOC 2 Type 2, PCI DSS 4.0 compliance, ISO 27001 certification, and RPAA PSP registration. Those may all be true, but the public page does not provide verifiable trust artifacts, report request workflow, certificate identifiers, or a direct official registry confirmation.
- Evidence:
  - Current security page claims:
    - SOC 2 Type 2 at lines 1022-1031
    - PCI DSS 4.0 at lines 1057-1066
    - ISO 27001 at lines 1097-1109
    - RPAA PSP registration at lines 1125-1133
  - Independent confirmation:
    - The Bank of Canada states it maintains lists of applicants and registered PSPs.
    - Brim's homepage links a Newswire item about admission to Payments Canada and payment-service-provider messaging.
- Inference boundary: I did not obtain a definitive regulator-side listing for Brim from the Bank of Canada registry endpoint during this audit. Treat this as an evidentiary gap, not proof the claims are false.

### F-07: Low-grade site hygiene issues remain

- Severity: Low
- Confidence: High
- Examples:
  - `https://www.brimfinancial.com` redirects to `http://brimfinancial.com/` before returning to HTTPS. That is unnecessary redirect complexity.
  - The homepage ships invalid structured-data dates such as `2018-07-39`.
  - The current `robots.txt` blocks `ia_archiver`, which can reduce future Wayback visibility.
- Evidence:
  - `curl -sSIL https://www.brimfinancial.com`
  - homepage lines 97, 121, 145, 169, 193, 217, 241 contain invalid `uploadDate` values
  - `curl -sS https://brimfinancial.com/robots.txt`

## Positive Signals

- TLS certificate is valid and current:
  - wildcard `*.brimfinancial.com`
  - valid through August 14, 2026
- Security headers are materially better than average:
  - CSP present
  - HSTS with `includeSubDomains; preload`
  - `X-Frame-Options: SAMEORIGIN`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Cross-Origin-Opener-Policy: same-origin`
- The legal hub does provide a wide set of consumer-facing artifacts, including Quebec-specific variants and product summaries.

## Wayback And Historical Notes

- Wayback CDX shows:
  - homepage captures dating back to March 2018
  - `/security` captures dating back to July 2019
  - `/legal` captures dating back to March 2019
- Historical comparison:
  - 2019 and 2022 `/security` snapshots emphasized PCI-DSS and SSL.
  - The current 2026 `/security` page adds SOC 2 Type 2, ISO 27001, and RPAA registration claims.
  - The legal/document-hub pattern has existed for years, and the site still serves 2018-era privacy and terms PDFs in 2026.
- Current `robots.txt` disallows `ia_archiver`, which stands out given the request for historical verification.

## Local Workspace Review

### Coverage

The local workspace is a static dashboard, not Brim's production codebase. No backend, auth, API, deployment, logging, or secrets-management code is present.

### Local Findings

#### L-01: No high-impact code vulnerability found in the local workspace

- Confidence: Medium
- Reason: The local files are static HTML/CSS/JS with no live data ingestion, no credentials, and no server behavior.

#### L-02: Source-provenance claim is overstated

- Severity: Low
- Confidence: High
- What it means: The dashboard says it is "Built from official or company-published sources only," but at least one cited source is a Newswire press release and others are vendor pricing pages.
- Evidence:
  - `/Users/tarique/Documents/New project/dashboard.html:81`
  - `/Users/tarique/Documents/New project/dashboard.js:109`
  - `/Users/tarique/Documents/New project/dashboard.js:321`

#### L-03: `innerHTML` is used safely now, but would become XSS-prone if the data source changes

- Severity: Informational
- Confidence: High
- What it means: `dashboard.js` renders cards and buttons with `innerHTML`, but the values currently come only from static checked-in arrays. As implemented, this is not a present exploit. If these structures are later fed from user input or remote JSON, sanitization will be required.
- Evidence:
  - `/Users/tarique/Documents/New project/dashboard.js:367`
  - `/Users/tarique/Documents/New project/dashboard.js:437`
  - `/Users/tarique/Documents/New project/dashboard.js:454`

## Confidence Summary

- High confidence:
  - analytics/cookie-consent mismatch on homepage
  - stale legal/privacy document links
  - accessibility failures
  - absence of `security.txt`
  - positive header/TLS posture
- Medium confidence:
  - public-proof gap for compliance/security marketing claims
  - local workspace conclusions, because the real codebase is not present

## Recommended Actions

1. Put cookie governance under immediate review:
   - classify Statcounter and any other trackers as essential or non-essential
   - if non-essential, block them until consent
   - make the consent UI visible and testable on every relevant page
2. Reconcile the legal hub:
   - replace or remove stale 2018 privacy/terms PDFs
   - ensure the legal hub points to the current authoritative privacy and terms versions
   - add version numbers and effective dates consistently
3. Fix the public accessibility defects:
   - remove duplicate IDs
   - fix linked-image alt text
   - correct invalid form structure
   - rerun `pa11y` or an equivalent WCAG workflow
4. Publish a vulnerability-reporting route:
   - add `/.well-known/security.txt`
   - add a security contact or disclosure page
5. Tighten public-site hygiene:
   - remove inline IP/session exposure if not strictly required
   - fix the `www` redirect chain
   - correct invalid structured data dates
6. For a real codebase audit, provide the production repo or a full application checkout. The current local workspace is not sufficient for backend, infra, or SDLC assurance.

## Key Sources

- [Brim homepage](https://brimfinancial.com/)
- [Brim privacy page](https://brimfinancial.com/privacy)
- [Brim security page](https://brimfinancial.com/security)
- [Brim legal page](https://brimfinancial.com/legal)
- [Brim contact page](https://brimfinancial.com/contact-us)
- [Bank of Canada RPAA registration framework](https://www.bankofcanada.ca/core-functions/retail-payments-supervision/supervisory-framework-registration/)
- [Bank of Canada PSP registry page](https://www.bankofcanada.ca/core-functions/retail-payments-supervision/psp-registry/)
- [Wayback CDX API](https://web.archive.org/cdx/search/cdx)
> Consolidated with broader external and governance findings in [brim_audit_consolidated_2026-03-28.md](/Users/tarique/Documents/New project/brim_audit_consolidated_2026-03-28.md).
> Use the consolidated report as the primary deliverable for this audit.
