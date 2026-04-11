> **HISTORICAL — do not edit. See `/STATE.md` for current status.**
> Archived 2026-04-12 during Phase 0 standardization.

---

# Data Studio — Unified Handoff

## Architecture

**One repo. One database. One deployment.**

| Layer | What | Where |
|-------|------|-------|
| Code | Vite + TypeScript frontend + API routes | github.com/tariquek-git/data-studio |
| Database | Supabase cloud Postgres | Project: bvznhycwkgouwmaufdpe |
| Hosting | Vercel (auto-deploy on push) | data-studio-mu.vercel.app |
| Team | Vercel team: team_STzWxd5CFWZJluy9ayRxCorw |

## Roles

**Claude** (this file's author): Strategy, schema design, data source research, regulatory mapping, prompt engineering, quality review. Talks to Supabase and Vercel directly via MCP tools.

**Cursor** (this file's reader): All code execution. Scraper development, frontend iteration, deployment fixes, bug fixes, testing. Works in the tariquek-git/data-studio repo.

## Database Inventory (as of April 11, 2026)

### Tables with Data
| Table | Rows | Description |
|-------|------|-------------|
| branches | 74,750 | Physical branch locations (US banks + CUs) |
| financial_history | 38,118 | Annual financial snapshots |
| financial_history_quarterly | 35,220 | Quarterly financial snapshots |
| charter_events | 29,642 | Mergers, closures, charter changes |
| entity_external_ids | 26,191 | Cross-reference IDs across systems |
| entity_tags | 21,197 | Classification tags per entity |
| institutions | 10,112 | Master institution list (US + CA) |
| branch_history_annual | 4,336 | Branch network changes over time |
| failure_events | 3,626 | Bank/CU failure records |
| entity_facts | 1,046 | Key facts per entity |
| registry_entities | 1,033 | Non-bank FI entities (fintechs, MSBs) |
| sync_jobs | 33 | Data pipeline job tracking |
| data_sources | 26 | Configured data sources |

### Tables Ready (Schema Exists, No Data Yet)
| Table | Purpose | Priority |
|-------|---------|----------|
| entity_relationships | Palantir-style graph: who owns whom, who services whom | HIGH |
| ecosystem_entities | Non-institution entities (vendors, regulators, associations) | MEDIUM |
| ai_summaries | LLM-generated summaries per institution | LOW (Phase 2) |
| bank_capabilities | Product/service capability matrix per institution | MEDIUM |
| saved_searches | User-saved search queries | LOW |
| macro_series | Macro economic time series (rates, GDP, CPI) | MEDIUM |

### Data Sources (26 registered)

**Active with data:**
| Source | Display Name | Country | Institutions | Notes |
|--------|-------------|---------|-------------|-------|
| fdic | FDIC BankFind Suite | US | 4,408 | Full financials, quarterly |
| ncua | NCUA Call Report Data | US | 4,287 | Full financials, quarterly |
| rpaa | Bank of Canada RPAA Registry | CA | 936 | Payment service providers, no financials |
| osfi | OSFI Who We Regulate | CA | 357 | Banks, insurance, trust cos. No financials yet |
| fintrac | FINTRAC MSB Registry | CA | 54 | Money service businesses |
| fincen | FinCEN MSB Registry | US | 23 | Money service businesses |
| ciro | CIRO Member Registry | CA | 20 | Investment dealers |
| bcfsa | BC Financial Services Authority | CA | 9 | BC credit unions. Only Vancity has financials |
| fsra | FSRA (Ontario) | CA | 8 | Ontario credit unions. No financials yet |
| dgcm | DGCM (Manitoba) | CA | 4 | Manitoba credit unions. No financials yet |
| cudgc_sk | CUDGC (Saskatchewan) | CA | 3 | SK credit unions. No financials yet |
| cudgc | CUDGC (Alberta) | CA | 2 | AB credit unions. No financials yet |
| nscudic | NSCUDIC (Nova Scotia) | CA | 1 | NS credit unions. No financials yet |
| ccua | Canadian Credit Union Association | CA | 0 | Aggregate sector data source |

**Configured but pending:**
ffiec_cdr, ffiec_nic, ffiec_hmda, ffiec_census, ffiec_cra, occ, frb_routing, sec_edgar, cfpb_complaints, nmls, cmhc, boc

### institutions table schema
id (uuid), cert_number (int, NOT NULL), source (text, check constraint), name, legal_name, charter_type, active, city, state, zip, county, latitude, longitude, website, established_date, regulator, holding_company, holding_company_id, total_assets (bigint), total_deposits (bigint), total_loans (bigint), num_branches (int), num_employees (int), roi (float), roa (float), equity_capital (bigint), net_income (bigint), credit_card_loans (bigint), credit_card_charge_offs (bigint), data_as_of (date), last_synced_at, raw_data (jsonb), created_at, updated_at

**source check constraint:** fdic, ncua, osfi, rpaa, ciro, fintrac, fincen, fintech_ca, bcfsa, fsra, cudgc, dgcm, cudgc_sk, nbcudic, nscudic, ccua

**cert_number convention:** FDIC/NCUA use real cert numbers. Canadian CUs use 900001+ to avoid collision.

### Existing Frontend Features (Vite app)
Based on commit history, the existing app already has:
- Institution screener with filters
- Watchlist functionality
- Discovery/exploration views
- Anomaly detection
- Failure analytics with terminal dashboards
- Rate sensitivity analysis
- Entity warehouse with enrichment pipeline
- Context-aware institution profiles
- API routes for data syncing

### Security Notes
- 2 tables missing RLS: data_sources, ai_summaries (non-sensitive, but should fix)
- 3 functions with mutable search_path: set_updated_at, institution_stats, update_updated_at
- pg_trgm extension in public schema (acceptable)

---

## Cursor TODO List

### Phase 1: Fill Canadian CU Financial Gaps (THIS WEEK)

**1.1 Scrape annual report financials for top Canadian CUs**

These 29 institutions need financial data. Priority order (largest first):

| Institution | Province | Source | Annual Report Location |
|------------|----------|--------|----------------------|
| Coast Capital Savings | BC | osfi | coastcapitalsavings.com |
| Meridian Credit Union | ON | fsra | meridiancu.ca |
| Servus Credit Union | AB | cudgc | servus.ca |
| First West Credit Union | BC | bcfsa | firstwestcu.ca |
| Conexus Credit Union | SK | cudgc_sk | conexus.ca |
| Affinity Credit Union | SK | cudgc_sk | affinitycu.ca |
| Access Credit Union | MB | dgcm | accesscu.ca |
| Alterna Savings | ON | fsra | alterna.ca |
| FirstOntario | ON | fsra | firstontario.com |
| DUCA | ON | fsra | dfrcu.com |

For each CU:
1. Find annual report PDF on their website
2. Download it
3. Extract key metrics with pdfplumber: total_assets, total_deposits, total_loans, net_income, equity_capital
4. Reports are in thousands of CAD. Multiply by 1000 before storing
5. UPDATE the existing institutions row (don't insert new)
6. INSERT into financial_history table
7. Delete the PDF

SQL to update an institution:
```sql
UPDATE institutions SET
  total_assets = [value],
  total_deposits = [value],
  total_loans = [value],
  net_income = [value],
  equity_capital = [value],
  data_as_of = '[YYYY-MM-DD]',
  last_synced_at = now()
WHERE cert_number = [900XXX];
```

**1.2 Add validation script**

Create scripts/validate.py that checks:
- total_assets > total_deposits (should always be true)
- total_assets > equity_capital (should always be true)
- If net_income exists, ROA = net_income / total_assets (calculate and update roa field)
- Flag any institution where total_assets changed >30% from financial_history

**1.3 Populate entity_relationships**

The holding company data is already in the institutions table (holding_company field). Use it to populate entity_relationships:
```sql
INSERT INTO entity_relationships (from_entity_table, from_entity_id, to_entity_table, to_entity_id, relationship_type, relationship_label, active)
-- For each institution with a holding_company, create a "subsidiary_of" relationship
```

Canadian examples to add manually:
- TD Bank NA → TORONTO-DOMINION BANK (already in holding_company)
- BMO Bank NA → BANK OF MONTREAL (already in holding_company)
- CIBC Bank USA → CANADIAN IMPERIAL BANK OF COMMERCE (already in holding_company)
- Coast Capital Savings → federally regulated by OSFI
- Vancity → provincially regulated by BCFSA

### Phase 2: Frontend Improvements

**2.1 Add Canadian CU view**

Add a dedicated Canadian view that shows:
- All CUs by province with data completeness indicators
- Provincial regulator badges (BCFSA, FSRA, CUDGC, DGCM)
- Canadian flag markers on Canadian institutions
- Data gap dashboard (which CUs still need financials)

**2.2 Connect entity_relationships to the UI**

The Relationships view should query entity_relationships and show:
- Holding company tree (expand/collapse)
- Cross-border connections (Canadian parent → US subsidiary)
- Regulatory relationship mapping

**2.3 Improve search**

Add full-text search using the pg_trgm extension (already installed):
```sql
SELECT * FROM institutions 
WHERE name ILIKE '%' || $1 || '%' 
   OR city ILIKE '%' || $1 || '%'
   OR holding_company ILIKE '%' || $1 || '%'
ORDER BY total_assets DESC NULLS LAST
LIMIT 50;
```

### Phase 3: Expand Data Collection

**3.1 Complete Canadian CU registry**

Scrape BCFSA and FSRA public lists to get ALL credit unions (not just the 30 we seeded). Target: 200 Canadian CUs in the institutions table.

**3.2 Populate bank_capabilities**

For the top 50 institutions, populate the bank_capabilities table with:
- Card issuing (Visa, Mastercard, both)
- Mobile banking (yes/no)
- Open banking (yes/no)
- Wealth management
- Insurance
- Mortgage lending
- Commercial lending

**3.3 Populate macro_series**

Ingest Bank of Canada overnight rate, CPI, GDP data from the Bank of Canada Valet API (boc data source already registered).

---

## Rules for Cursor

1. Never create a new repo. Everything goes in tariquek-git/data-studio
2. Never use the word "engine" in code or comments
3. Canadian CU reports are in thousands of CAD. Always multiply by 1000
4. cert_number for Canadian CUs: 900001+
5. source field must match the check constraint (lowercase)
6. Don't add Claude API calls. Phase 1 uses pdfplumber only
7. Don't store PDFs. Extract, store data, delete file
8. Push to main branch. Vercel auto-deploys on push
9. When in doubt about schema changes, add a question below

## Questions for Claude
(Cursor: write questions here. Claude answers next session.)

