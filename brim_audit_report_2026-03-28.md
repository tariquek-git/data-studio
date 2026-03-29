# Brim Financial Audit Report

> Superseded by [brim_audit_consolidated_2026-03-28.md](/Users/tarique/Documents/New project/brim_audit_consolidated_2026-03-28.md).
> Important correction: the Bank of Canada PSP API currently lists `Brim Financial Inc.` as `registered`, so the earlier draft concern about an RPAA / registry mismatch should not be relied on without reading the consolidated report.

Date: 2026-03-28

## Executive Summary

This audit covered two different evidence tracks:

1. The local workspace at `/Users/tarique/Documents/New project`, which is not a full Brim application repository. It contains a small static dashboard plus generated artifacts, logs, PDFs, and slide-text exports.
2. The public surface of `https://brimfinancial.com`, reviewed using passive, non-intrusive checks only.

The strongest issues are not classic application exploits in the local code. The main risk is governance and control drift across public legal/security content and local collateral:

- The live security page makes a Bank of Canada RPAA PSP-registration claim that does not reconcile cleanly with the current Bank of Canada PSP registry page, which currently shows no entries.
- The live site exposes conflicting privacy-policy versions: the HTML privacy page says `Last Updated: November 14, 2025`, while the legal hub still links to a privacy-policy PDF that says `Last Updated: June 1, 2018`.
- The public site contains several stale or low-quality content signals on security/legal pages, including invalid structured-data dates, legacy HTTP URLs, old document naming, and dated metadata.
- The local workspace contains high-stakes compliance and certification claims, but no local evidence package proving them.

The local dashboard code itself is relatively low risk. It is static, contains no secrets, no backend, and no direct network calls. Its main weakness is provenance and content-integrity risk rather than exploitation risk.

## Scope

### In Scope

- Local files in `/Users/tarique/Documents/New project`
- Passive review of `brimfinancial.com` public pages and headers
- Public legal/security/compliance pages
- Historical checks using the Internet Archive CDX index and archived snapshots

### Out of Scope

- Authenticated areas
- Internal systems, infrastructure, and source repositories not present in the workspace
- Active vulnerability scanning or intrusive testing
- Validation of claimed certifications with auditors or regulators

## Confidence Scale

- High: Directly observed and repeatable from current files/pages/headers
- Medium: Strongly supported, but may depend on page state, archive coverage, or interpretation
- Low: Plausible inference that needs confirmation from Brim or underlying systems

## Coverage Limits

- The local workspace is not a production repo and is not a git repository.
- No backend, infrastructure-as-code, dependency manifests, CI/CD config, server code, or application secrets were present.
- Because of that, codebase conclusions here should be read as a review of the provided workspace artifacts, not of Brim's actual production codebase.

## Findings

### F1. Public RPAA PSP-registration claim does not reconcile with the official Bank of Canada registry

- Severity: High
- Confidence: Medium-High
- Area: Regulatory / public compliance representations

The live security page states:

- `Brim is a registered Payment Service Provider (PSP) under the Retail Payment Activities Act (RPAA)`

However, the official Bank of Canada PSP registry page currently states `There are currently no entries.`

This does not prove Brim is not registered. It does show a public inconsistency that needs immediate validation because the current wording is specific, regulator-linked, and easy for customers, counterparties, or counsel to verify.

Evidence:

- Live security page excerpt fetched on 2026-03-28:
  - `Brim is a registered Payment Service Provider (PSP) under the Retail Payment Activities Act (RPAA)`
  - Also claims operation within a central-bank payments oversight framework.
- Bank of Canada registry page:
  - `There are currently no entries.`

What this means:

- If the claim is correct, the public registry view or search method needs explanation and the site should link to a verifiable record or add qualifying language.
- If the claim is outdated or overstated, this is a material public-compliance representation problem.

Recommended action:

- Legal/compliance should verify the exact regulatory status immediately.
- Replace categorical wording with precise, verifiable language until confirmed.
- Add evidence-backed citations or a regulator reference path.

Sources:

- [Brim security page](https://brimfinancial.com/security)
- [Bank of Canada PSP registry](https://www.bankofcanada.ca/core-functions/retail-payments-supervision/psp-registry/)

### F2. Conflicting privacy-policy versions are publicly exposed

- Severity: High
- Confidence: High
- Area: Legal / privacy governance / document control

The live HTML privacy page and the legal-hub PDF link are out of sync:

- `/privacy` states `Last Updated: November 14, 2025`
- `/legal` links to `brim-privacy-policy-2018-06-01.pdf`
- That PDF still says `Last Updated: June 1, 2018`

This is a concrete document-control failure. For privacy programs, version drift across official publication channels is a governance risk and can create disputes over which notice is operative.

Evidence:

- HTML privacy page includes `Last Updated: November 14, 2025` and `privacy@brimfinancial.com`.
- Legal page links the Privacy Policy entry to `https://static.brimfinancial.com/brim//pdf_files/brim-privacy-policy-2018-06-01.pdf`.
- Extracted text from that PDF includes `Last Updated: June 1, 2018`.

What this means:

- Users can encounter multiple "official" privacy notices with materially different update dates.
- Counsel, procurement, or privacy regulators may view this as weak publication control.

Recommended action:

- Remove or replace stale legal-hub PDFs immediately.
- Ensure one canonical privacy notice is published and linked everywhere.
- Add document owner, effective date, and version-control checks to web publishing.

Sources:

- [Brim privacy page](https://brimfinancial.com/privacy)
- [Brim legal page](https://brimfinancial.com/legal)
- [Privacy PDF currently linked from legal page](https://static.brimfinancial.com/brim//pdf_files/brim-privacy-policy-2018-06-01.pdf)

### F3. Public legal and security content shows stale metadata and inconsistent publication hygiene

- Severity: Medium
- Confidence: High
- Area: IT governance / content integrity / trust

Several direct signals indicate stale or weak publication controls:

- The security page contains JSON-LD `uploadDate` values like `2018-07-39T09:28:00+00:00`, which is an invalid date.
- The same page includes legacy `http://www.youtube.com/...` and `http://www.brimfinancial.com` URLs in structured data.
- The legal hub links the Website Terms of Use to `Website-terms-of-use-April-1-date1.pdf`, and extracted text from that PDF still ends with `April 1, 2018`.
- The legal page uses JS-driven `href="#"` links for major legal documents, with actual PDF URLs stored in custom `link=` attributes instead of standard direct anchors.

These are not exploit-grade issues by themselves, but they reduce trust in the accuracy and maintenance of high-stakes legal/security pages.

Evidence:

- Security page contains seven instances of `2018-07-39`.
- Security page contains `http://www.youtube.com/...` and `http://www.brimfinancial.com`.
- Terms PDF linked from legal page was last modified on the server in 2025, but extracted content still ends with `April 1, 2018`.

What this means:

- Security/legal content is being revised or republished without strong content QA.
- If content QA is weak on public trust pages, certification and disclosure claims deserve extra scrutiny.

Recommended action:

- Add validation checks for JSON-LD, canonical URLs, and TLS-only asset references.
- Convert legal-document links to direct accessible anchors.
- Establish content QA for security, privacy, and legal pages before release.

Sources:

- [Brim security page](https://brimfinancial.com/security)
- [Brim legal page](https://brimfinancial.com/legal)
- [Website Terms PDF linked from legal page](https://static.brimfinancial.com/brim//pdf_files/Website-terms-of-use-April-1-date1.pdf)

### F4. Historical archive evidence suggests the new compliance-heavy security language is newer than the page itself

- Severity: Medium
- Confidence: Medium
- Area: Change control / representation drift

Internet Archive CDX results show `https://brimfinancial.com/security` existed in 2020 and 2023. Archived snapshot checks from 2020-08-20 and 2023-06-20 found older PCI language, but did not show the newer RPAA/PSP, SOC 2, or ISO 27001 wording currently present.

This does not prove the current claims are false. It does show that the present security/compliance narrative is a later addition and should be backed by auditable publication evidence.

Evidence:

- 2020 snapshot matched only older PCI-focused text such as `PCI-DSS compliance and 2048 bit SSL encryption`.
- 2020 and 2023 archived versions did not match `Payment Service Provider`, `RPAA`, `SOC 2`, or `ISO 27001`.

What this means:

- The site's public assurance posture changed over time.
- Change-control evidence should exist for when these claims were added and who approved them.

Recommended action:

- Keep an internal publication log for compliance-sensitive claims.
- Tie public claims to evidence artifacts and approvals.

Sources:

- [Wayback CDX API for `/security`](https://web.archive.org/cdx/search/cdx?url=brimfinancial.com/security&output=json&fl=timestamp,original,statuscode,mimetype&filter=statuscode:200&limit=20&from=2020)
- [Archived 2020 security page snapshot](https://web.archive.org/web/20200820024452/https://brimfinancial.com/security)

### F5. `www` host performs an HTTPS-to-HTTP redirect before returning to HTTPS

- Severity: Medium
- Confidence: High
- Area: Transport security / edge configuration

Requesting `https://www.brimfinancial.com` returned:

- `301 Location: http://brimfinancial.com/`

Following that chain produced:

- `302 Location: https://brimfinancial.com/`

So the first redirect downgrades the scheme before the next hop restores HTTPS.

What this means:

- Browsers with HSTS may still reach the final HTTPS destination safely.
- Non-browser clients, automated tools, or integrations may see the downgrade hop.
- It is a transport-hygiene issue and unnecessary complexity on a financial-services domain.

Recommended action:

- Change the `www` HTTPS redirect target to `https://brimfinancial.com/` directly.
- Validate all host canonicalization rules at the CDN/WAF and origin.

Source:

- [Brim home page](https://www.brimfinancial.com)

### F6. Visitor IP address and generated session identifier are embedded directly into page source before any user interaction

- Severity: Medium
- Confidence: High
- Area: Privacy / telemetry / front-end data minimization

Public pages include inline JavaScript like:

- `const API_URL = "https://cookietracker.brim.ca/cookie_tracking/endpoint.php";`
- `const session_id = "...";`
- `const ip_address = "...";`

This happens on pages including `/security`, `/privacy`, and `/contact-us`.

The site also renders cookie-consent controls in the HTML, but the page source already contains the tracking endpoint and values before any interaction.

This does not prove unlawful tracking by itself, but it is poor privacy/data-minimization hygiene and should be reviewed against intended consent behavior and jurisdictional requirements.

Recommended action:

- Remove raw IP exposure from page source.
- Generate or resolve telemetry server-side where possible.
- Confirm non-essential tracking code does not initialize before the intended consent state.

Sources:

- [Brim privacy page](https://brimfinancial.com/privacy)
- [Brim security page](https://brimfinancial.com/security)

### F7. Public complaint-handling, ombudsman, and accessibility information is not easily discoverable on core public pages reviewed

- Severity: Medium
- Confidence: Medium
- Area: Consumer compliance / accessibility / discoverability

Across the home page, contact page, legal index, privacy page, and security page, I did not find public references to:

- `FCAC`
- `Financial Consumer Agency`
- `ADR Chambers`
- `ombudsman`
- `accessibility`
- `AODA`
- `WCAG`

This is a discoverability finding, not proof that Brim lacks these processes. Some of this information may exist in PDFs or authenticated flows. Still, for a financial-services brand, public complaint/escalation and accessibility paths are normally worth making easy to find.

Recommended action:

- Add public complaint-resolution and accessibility pages if they exist internally.
- Link them from footer/legal/contact pages.
- Verify consumer-regulatory disclosure obligations for all served jurisdictions.

Sources:

- [Brim contact page](https://brimfinancial.com/contact-us)
- [Brim legal page](https://brimfinancial.com/legal)
- [Brim privacy page](https://brimfinancial.com/privacy)

### F8. Public security page contains outdated dependencies and stale tracking markup

- Severity: Low-Medium
- Confidence: High
- Area: Front-end maintenance / defense in depth

The security page still loads:

- `jquery-migrate.js`
- StatCounter markup (`https://www.statcounter.com/counter/counter.js`)

At the same time, the CSP observed from headers does not clearly whitelist StatCounter, which suggests stale markup or incomplete policy alignment.

This is not a confirmed exploitable issue. It is a maintenance and attack-surface signal.

Recommended action:

- Remove `jquery-migrate` if no longer needed.
- Remove dead or blocked analytics tags.
- Minimize third-party scripts on security/legal pages.

Source:

- [Brim security page](https://brimfinancial.com/security)

### F9. Local dashboard uses `innerHTML`, but current exploitability is low because all rendered data is static and local

- Severity: Low
- Confidence: High
- Area: Local workspace code quality / XSS hygiene

The local dashboard uses `innerHTML` in several places:

- `dashboard.js:361`
- `dashboard.js:367`
- `dashboard.js:402`
- `dashboard.js:427`
- `dashboard.js:437`
- `dashboard.js:449`
- `dashboard.js:454`

In this workspace, the data arrays are hard-coded in the same file, so there is no immediate untrusted-input path. If this file is later adapted to ingest external JSON or user input, these patterns become XSS-prone.

Recommended action:

- Prefer DOM APIs with `textContent` for future dynamic content.
- Treat this as a secure-coding hygiene issue, not a current exploitable vulnerability.

Source:

- Local file: `dashboard.js`

### F10. Local workspace contains high-stakes compliance and security claims without supporting evidence artifacts

- Severity: Medium
- Confidence: High
- Area: Sales collateral governance / compliance substantiation

Local slide-text exports contain strong claims such as:

- `PCI DSS Level 1 · SOC 2 Type II · Tokenization · Data Residency`
- `Brim is PCI DSS v4.0.1 compliant`
- `SOC 2 Type 2`
- `ISO 27001:2022`
- `PIPEDA (CA), state/federal (US). Data residency segregation. OSFI/OCC reporting. Full audit trail.`
- `Brim eliminates 100% of PCI scope for the partner institution`

I did not find any local support package such as:

- audit letters
- certification documents
- regulator correspondence
- exception analyses
- claim-approval records

For commercial decks, these claims may be true. The control gap is that the workspace does not bundle the evidence needed to defend them.

Evidence from local artifacts:

- `tmp/slide_texts/Brim_Visual_Deck_2026.txt:69`
- `tmp/slide_texts/Brim_Pitch_Deck.txt:155-168`
- `tmp/slide_texts/Brim_Reference_Appendix.txt:471-479`
- `tmp/slide_texts/Brim_Reference_Appendix.txt:120-121`

Recommended action:

- Maintain a claims register mapping every public/commercial security claim to evidence and owner.
- Require refresh dates for certifications, audits, and regulatory-status statements.

### F11. No secrets or credentials were found in the provided local workspace

- Severity: Informational
- Confidence: High
- Area: Local workspace secrets hygiene

Pattern-based scans across the provided workspace did not find obvious API keys, private keys, bearer tokens, or passwords.

This is a positive result, with the caveat that the workspace is small and not a full application repository.

## Local Workspace Observations

- The workspace is not a git repository.
- Primary executable files are:
  - `dashboard.html`
  - `dashboard.js`
  - `dashboard.css`
- Remaining content is mostly generated artifacts:
  - slide-text exports
  - PDFs
  - images
  - Playwright logs/YAML

## Positive Signals

- Live site supports TLS 1.3 with a valid certificate for `*.brimfinancial.com` and `brimfinancial.com`.
- Main site sets HSTS, CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`.
- The local workspace does not expose obvious credentials.
- Public legal hub includes cardmember agreements, disclosure statements, and related PDFs.

## Suggested Priority Order

1. Verify and correct the RPAA/PSP registration claim.
2. Eliminate privacy-policy version drift across HTML and PDF channels.
3. Review all public security/compliance claims against a controlled evidence register.
4. Fix `www` redirect canonicalization so it stays HTTPS end to end.
5. Reduce privacy leakage and pre-consent telemetry exposure in page source.
6. Clean up stale legal/security metadata, invalid JSON-LD, old URLs, and legacy scripts.
7. Improve discoverability of complaint-handling and accessibility information.

## Commands and Methods Used

- Local file inspection with `rg`, `sed`, `nl`, and `find`
- Passive HTTP header review with `curl -I`
- Passive certificate/DNS review with Python `ssl` and `dig`
- HTML parsing with Python `requests` and `BeautifulSoup`
- PDF text extraction with `pdftotext`
- Historical checks via Internet Archive CDX and archived snapshots
