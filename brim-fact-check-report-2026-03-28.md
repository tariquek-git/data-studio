# Brim Financial Audit Fact Check

Date checked: March 28, 2026

Source document reviewed:
- `/Users/tarique/Downloads/brimfinancial-deep-audit-2026-03-28.pdf`

## Bottom line

The PDF is a mixed-quality audit.

- Across the `59` visible finding rows (`F-01` through `F-59`), `18` findings were supported as `Accurate`.
- Across the `59` visible finding rows (`F-01` through `F-59`), `37` findings were `Partly accurate`.
- Across the `59` visible finding rows (`F-01` through `F-59`), `4` findings were `False`.
- The document also has internal consistency problems:
  - It claims `66 findings`, but the visible numbered findings only cover `F-01` through `F-59`.
  - The remediation matrix refers to `F-63` for the LinkedIn issue, while the actual finding is `F-59`.
  - Findings `F-60` through `F-66` do not appear in the extracted report.

Second QA pass note:
- The status totals above were re-checked directly against the `F-01` to `F-59` finding rows in this report and confirmed as `18 Accurate`, `37 Partly accurate`, `4 False`.

The strongest supported issues are real technical and content problems:

- Webportal cookie/HSTS configuration problems
- Static CDN serving JavaScript over plain HTTP
- Public Starling configuration embedded in Brim JavaScript
- Multiple third-party trackers present in the signup page source
- Stale partner/product pages and broken links

The weakest parts of the PDF are the legal conclusions and some accessibility/security overreach:

- Several legal requirements are misstated
- Some client-side observations are used to claim server-side vulnerabilities that public evidence cannot prove
- Some accessibility findings are outdated or contradicted by the live HTML

## Highest-confidence corrections

These are the most important places where the PDF is wrong or materially overstated.

1. `F-07` is false as written.
   The report says the webportal login page has `CSP: default-src *` permitting scripts from anywhere. The live response on March 28, 2026 includes a separate `script-src` directive, so the report's description of the active policy is incorrect.

2. `F-18` is false.
   The live signup page does contain label elements for the main inputs. The claim that all signup inputs are missing labels is contradicted by the current markup.

3. `F-24` is false.
   The report says the About Us slider auto-plays with no pause mechanism. The public JavaScript shows `autoplay: false` for the relevant slider.

4. `F-39` is false.
   Quebec Law 25 does not require the privacy lead to be named as a natural person in the way the PDF states. The statute requires title and contact information; Brim publishes `Privacy Officer` and `privacy@brimfinancial.com`.

5. `F-37` is partly accurate but legally wrong on timing.
   The report says Quebec Law 25 imposes a `72-hour` breach notice rule. The sources reviewed support a prompt notification standard, not the blanket 72-hour claim used in the PDF.

6. `F-36` and `F-34` overstate Quebec Law 25.
   I did not find support for the PDF's claim that Law 25 universally requires a public standalone technology list or Global Privacy Control support.

7. `F-48` is overstated.
   The login page exposes a CodeIgniter-style CSRF field name, but repeated loads produced different CSRF hashes. The token is not proven static across sessions.

8. `F-56` is materially wrong on the merger fact.
   Canadian Western Bank did not merge with ATB in 2024. National Bank completed the acquisition in February 2025, with amalgamation set for March 1, 2025.

9. `F-57` is stale but gets the date wrong.
   Rania Llewellyn left Laurentian Bank on October 2, 2023, not in early 2024.

10. `F-55` gets the stale-page point right but the discontinuation date wrong.
    Fitbit Pay was no longer available starting January 13, 2025 in the official support source checked, not September 2023.

## Finding matrix

### JavaScript, headers, CSP, cookies

- `F-01` `Partly accurate` - Starling config is publicly shipped in `feature_animation.js`, but the wording `full config object` is broader than strictly proven.
- `F-02` `Accurate` - `document.write()` is used on `/signup` to emit DoubleClick tracking pixels.
- `F-03` `Accurate` - production JS still contains live `console.log()` statements, including one logging `resend_email`.
- `F-04` `Accurate` - signup field IDs still use the `singup` typo.
- `F-05` `Accurate` - production JS blocks developer shortcuts and logs `Source Code View Not Allowed`.
- `F-06` `Partly accurate` - invalid `VideoObject uploadDate` values are present; the claim about zero rich snippets was not independently verified.
- `F-07` `False` - the report misdescribes the active webportal CSP.
- `F-08` `Accurate` - `ci_session` is missing `Secure` on `https://webportal.brimfinancial.com/login`.
- `F-09` `Accurate` - the webportal HSTS header is quoted and malformed.
- `F-10` `Partly accurate` - the CSRF cookie lacks `Secure` and `SameSite`; the `HttpOnly` criticism is more nuanced because CSRF tokens are often intentionally script-readable.
- `F-11` `Partly accurate` - jsDelivr and cdnjs are in the CSP, but the PDF overstates the impact because the policy also uses a nonce and `strict-dynamic`.
- `F-12` `Accurate` - `http://static.brimfinancial.com/brim/js/custom.js` returns `200 OK` over HTTP.
- `F-13` `Partly accurate` - `pin.brimfinancial.com` returns `404` and remains whitelisted in CSP, but the takeover-risk conclusion is speculative without domain-control evidence.
- `F-14` `Accurate` - `style-src-attr 'unsafe-inline'` is present.
- `F-15` `Accurate` - the webportal response has no `frame-ancestors` directive.
- `F-16` `Partly accurate` - `*.trustev.com` wildcarding exists, but the report overstates the subdomain registration scenario.
- `F-17` `Accurate` - `X-XSS-Protection: 1; mode=block` is still emitted.

### Accessibility

- `F-18` `False` - the live signup form has labels.
- `F-19` `Partly accurate` - no skip link or `main-content` anchor was found on the pages checked, but the report generalizes beyond directly checked pages.
- `F-20` `Accurate` - activation OTP inputs lack labels and a `fieldset`/`legend`.
- `F-21` `Partly accurate` - the nav uses `javascript:void(0)`, but the markup also includes Bootstrap dropdown wiring and some ARIA.
- `F-22` `Partly accurate` - repeated `Read More`/`Learn More` link text exists, but not all such links are equally indistinguishable because some have added context or attributes.
- `F-23` `Partly accurate` - error containers lack `aria-live`/`role="alert"`, but the screen-reader runtime impact was not independently tested.
- `F-24` `False` - the relevant About Us slider is configured with `autoplay: false`.
- `F-25` `Partly accurate` - the modals are missing some ideal semantics such as `aria-modal`, but they do already include `role="dialog"` and accessible close labels in the live HTML.

### Privacy, tracking, legal, compliance

- `F-26` `Partly accurate` - DoubleClick pixels are present on `/signup`, but I did not verify a full consent-gating runtime trace.
- `F-27` `Partly accurate` - Dianomi is present on `/signup`, with the same consent caveat.
- `F-28` `Partly accurate` - Krux/Salesforce beacon is present on `/signup`, with the same consent caveat.
- `F-29` `Partly accurate` - the privacy policy omits vendor names for several trackers, but the claim that the law requires naming every recipient by name is overstated.
- `F-30` `Partly accurate` - `cookietracker.brim.ca` is referenced from public pages and not named in the privacy policy, but I did not trace whether it always fires before consent.
- `F-31` `Accurate` - IP address is rendered into hidden fields and re-submitted client-side.
- `F-32` `Partly accurate` - `os_type` and `browser_type` are submitted with PII, but the privacy policy does disclose browser and OS collection in general terms.
- `F-33` `Partly accurate` - StatCounter is present and cross-border, but the `before consent` claim was not fully runtime-tested.
- `F-34` `Partly accurate` - no GPC/DNT support was found, but the report overstates Quebec Law 25 by treating GPC as a statutory requirement.
- `F-35` `Partly accurate` - the `end-to-end encryption` marketing language is overly broad relative to the site's client-side tracker behavior, but the legal violation conclusion is too strong to treat as proven.
- `F-36` `Partly accurate` - the privacy notice is generic about technologies, but the report overstates the law by claiming a mandatory standalone public tech list.
- `F-37` `Partly accurate` - no explicit breach-process section was found, but the report's `72-hour` Quebec claim is wrong.
- `F-38` `Partly accurate` - policy silence does not prove no PIAs exist.
- `F-39` `False` - the named-natural-person claim is legally wrong.
- `F-40` `Accurate` - the privacy page does not clearly describe the Quebec portability right.
- `F-41` `Partly accurate` - the complaint authorities are not named, but the legal conclusion is stronger than the statutes clearly require.
- `F-42` `Partly accurate` - no `security.txt`/VDP was found, but the ISO 27001 claim is overstated.
- `F-43` `Partly accurate` - the privacy page does not explain CASL consent mechanics in detail, but the report's `3-year` point is not well-supported from the primary sources reviewed.
- `F-44` `Accurate` - the privacy page gives no category-by-category retention schedule.
- `F-45` `Partly accurate` - grouping RPAA registration alongside audited certifications may be misleading, but the report overstates the legal conclusion.

### Form security

- `F-46` `Partly accurate` - the public signup code shows no visible CSRF token, but public evidence alone cannot prove the endpoint is actually vulnerable server-side.
- `F-47` `Partly accurate` - same issue for the activation flow.
- `F-48` `Partly accurate` - the default CodeIgniter field name is visible, but the token is not proven static across requests.
- `F-49` `Partly accurate` - the public flow uses email plus last four digits with no visible CAPTCHA, but the brute-force and DoS implications depend on server-side controls not visible from markup alone.
- `F-50` `Partly accurate` - 4-digit OTP is real; brute-force feasibility remains server-side dependent.
- `F-51` `Partly accurate` - card-derived digits are passed in the PIN iframe URL, but the PDF's exact `last 8 digits` wording does not cleanly match the current public snippet.
- `F-52` `Accurate` - the security-answer field is `type="text"`.
- `F-53` `Partly accurate` - no visible CAPTCHA/challenge on login, but public evidence cannot prove server-side stuffing defenses are absent.
- `F-54` `Accurate` - the email validation regex still limits TLD length in a way that rejects modern long TLDs.

### Stale content, partner references, dead links

- `F-55` `Partly accurate` - the Fitbit Pay page is still live and stale, but the report's discontinuation date is wrong.
- `F-56` `Partly accurate` - the CWB page is stale, but the report's ATB merger claim is wrong.
- `F-57` `Partly accurate` - the Laurentian attribution is stale, but the departure date is wrong.
- `F-58` `Accurate` - `/manulife-platform` returns `404` and is still linked in navigation.
- `F-59` `Accurate` - the non-`/company/` LinkedIn URL is broken in Brim's structured data/source, though several visible page links now use the corrected `/company/` form.

## What the PDF gets right

- It identifies a real cluster of webportal cookie/header issues.
- It correctly spots that Brim still ships a Starling-branded config object in public JS.
- It correctly finds multiple live third-party tracker references on `/signup`.
- It correctly finds the HTTP-served static CDN problem.
- It correctly finds real stale/dead-link issues, even where the dates/explanations are wrong.

## What the PDF gets wrong most often

- It treats client-side evidence as proof of server-side exploitability.
- It states legal conclusions too confidently from incomplete statutory support.
- It contains factual date/company errors in partner-history findings.
- It fails to distinguish between a real issue and a speculative downstream risk.

## Primary sources used

- Brim pages:
  - `https://brimfinancial.com/`
  - `https://brimfinancial.com/signup`
  - `https://brimfinancial.com/activation`
  - `https://brimfinancial.com/about-us`
  - `https://brimfinancial.com/privacy`
  - `https://brimfinancial.com/security`
  - `https://brimfinancial.com/legal`
  - `https://webportal.brimfinancial.com/login`
  - `https://static.brimfinancial.com/brim/js/custom.js`
  - `https://static.brimfinancial.com/brim/js/feature_animation.js`

- Official/legal/vendor sources:
  - `https://www.legisquebec.gouv.qc.ca/en/document/cs/p-39.1`
  - `https://www.legisquebec.gouv.qc.ca/en/document/cr/R-22.1%2C%20r.%202`
  - `https://laws-lois.justice.gc.ca/eng/acts/P-8.6/section-10.1.html`
  - `https://laws-lois.justice.gc.ca/eng/acts/C-34/section-74.1.html`
  - `https://laws-lois.justice.gc.ca/eng/annualstatutes/2010_23/fulltext.html`
  - `https://www.bankofcanada.ca/core-functions/retail-payments-supervision/psp-registry/`
  - `https://support.google.com/fitbit/answer/14236521`
  - `https://www.nbc.ca/about-us/news-media/press-release/2025/20250203-nbc-concludes-acquisition-cwb.html`
  - `https://www.cwb.com/en/coming-together-with-national-bank`
  - `https://news.laurentianbank.ca/2023-10-02-Laurentian-Bank-Appoints-Eric-Provost-as-President-and-Chief-Executive-Officer-and-Michael-Boychuk-as-Chair`
  - `https://statcounter.com/about/contact/`
  - `https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-XSS-Protection`
  - `https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src`
  - `https://www.rfc-editor.org/rfc/rfc6797`
