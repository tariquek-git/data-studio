# MASTER_PLAN.md — Data Studio Multi-Agent Execution Plan

> **Owner:** Claude (strategy) via claude.ai
> **Executor:** Cursor (code) via tariquek-git/data-studio
> **Database:** Supabase bvznhycwkgouwmaufdpe
> **Deploy:** Vercel auto-deploys on push to main
> **Date:** April 11, 2026

---

## The Vision

A Palantir-style mesh network for 10,000+ North American financial institutions. Pick any dimension (assets, geography, charter type, holding company, regulator, failure history, growth rate) and slice/dice/explore in real time. Every institution is a node. Every relationship is an edge. Everything is searchable, comparable, and live.

---

## Multi-Agent Architecture

Cursor can run multiple terminal tabs simultaneously. Each "agent" is an independent Python script that reads from and writes to the database without conflicting with others. They share the database but own different tables or different data slices.

### How to Run Multiple Agents in Cursor

Open 3-4 terminal tabs (Cmd+J, then the + icon):

```
Tab 1: Agent QA        → python scripts/agent_qa.py
Tab 2: Agent Scraper   → python scripts/agent_scraper_ca.py
Tab 3: Agent Relations  → python scripts/agent_relationships.py
Tab 4: Dev server      → npm run dev
```

Each agent logs to stdout and writes results to the database. They don't step on each other because they write to different tables or different cert_number ranges.

---

## Phase 1: Database Rigor (Run First)

### Agent 1: QA Validator (scripts/agent_qa.py)

Runs checks across the entire 10K institution database. Prints a report. Flags issues. Does NOT fix anything automatically.

**Checks to implement:**

```python
# 1. BALANCE SHEET IDENTITY
# For every institution with total_assets AND total_deposits AND equity_capital:
# Assert: total_assets >= total_deposits (always true)
# Assert: total_assets >= equity_capital (always true)  
# Flag: total_assets < total_deposits + equity_capital * 0.5 (suspicious)

# 2. ORPHAN CHECK
# Institutions with financial_history records but no matching cert_number
# financial_history records with NULL cert_number
# Branches with no matching institution

# 3. DUPLICATE DETECTION
# Institutions with same name + same state (potential dupes)
# Institutions with same cert_number + same source (should be unique)

# 4. STALENESS CHECK
# Institutions where data_as_of is older than 18 months
# Institutions with total_assets but no data_as_of date

# 5. RANGE CHECKS
# ROA outside -5% to +10% range (likely data error)
# Total assets negative (impossible)
# Net income > total_assets (impossible)
# Num_branches > 10000 (suspicious)
# Num_employees > 500000 (suspicious)

# 6. YOY CONSISTENCY
# Compare financial_history periods for same cert_number
# Flag any metric that changed > 50% year over year
# Exception: mergers (check charter_events for merger events)

# 7. COMPLETENESS SCORECARD
# Per source: what % of institutions have total_assets?
# Per source: what % have net_income?
# Per source: what % have branches?
# Per source: what % have lat/lng?

# 8. CANADIAN CU SPECIFIC
# All Canadian CUs (cert_number 900001+) should have website
# All Canadian CUs should have source matching provincial regulator
# If total_assets exists, should be in reasonable CAD range ($100M - $50B)
```

**Output format:**
```
=== DATA STUDIO QA REPORT ===
Run: 2026-04-11 23:45 UTC
Institutions checked: 10,112

CRITICAL (must fix):
  [C001] 3 institutions with negative total_assets
  [C002] 12 financial_history orphans (no matching institution)

WARNING (should investigate):
  [W001] 847 institutions missing lat/lng
  [W002] 23 institutions with ROA > 5%
  [W003] 156 institutions with data_as_of older than 2023

INFO (for tracking):
  [I001] Completeness: FDIC 98.2% | NCUA 94.1% | Canadian 13.3%
  [I002] 4,287 NCUA institutions missing net_income (expected, NCUA reports differently)

=== END REPORT ===
```

### Agent 2: Relationship Builder (scripts/agent_relationships.py)

Populates the empty entity_relationships table from existing data. No scraping needed. Pure SQL transforms.

```python
# 1. HOLDING COMPANY → SUBSIDIARY
# ~2,000 institutions have holding_company field populated
# For each, create relationship: institution → holding company
# relationship_type = 'subsidiary_of'
# This gives you the corporate family tree for free

# 2. CROSS-BORDER LINKS
# TD Bank NA (FDIC) → Toronto-Dominion Bank (OSFI)
# BMO Bank NA (FDIC) → Bank of Montreal (OSFI)  
# CIBC Bank USA (FDIC) → Canadian Imperial Bank of Commerce (OSFI)
# HSBC Bank USA (FDIC) → HSBC Holdings PLC (foreign)
# Barclays Bank Delaware (FDIC) → Barclays PLC (foreign)
# City National Bank (FDIC) → Royal Bank of Canada (OSFI)

# 3. MERGER RELATIONSHIPS
# charter_events table has 29,642 events including mergers
# For each merger event, create: acquired → acquirer relationship
# relationship_type = 'merged_into'
# active = false, effective_end = merger date

# 4. REGULATOR RELATIONSHIPS
# Every institution has a source field (fdic, ncua, osfi, bcfsa, etc.)
# Create: institution → regulator relationship
# relationship_type = 'regulated_by'
```

### Agent 3: Completeness Filler (scripts/agent_completeness.py)

Goes wide across the entire database, not just Canadian CUs. Fills gaps in existing US data.

```python
# 1. CALCULATE ROA WHERE MISSING
# If net_income AND total_assets exist but roa is NULL:
# roa = (net_income / total_assets) * 100
# UPDATE institutions SET roa = calculated WHERE roa IS NULL

# 2. LAT/LNG BACKFILL
# 847 institutions missing coordinates
# Use city + state to geocode (free Nominatim API, rate limited)
# Store in latitude/longitude columns
# Run slowly: 1 request per second

# 3. WEBSITE BACKFILL
# Many institutions missing website
# For FDIC banks: can construct from FDIC API
# For NCUA CUs: many have website in raw_data jsonb
# Parse raw_data and extract

# 4. BRANCH COUNT SYNC
# branches table has 74,750 rows
# Count branches per institution
# Compare with num_branches field
# Update where mismatched
```

---

## Phase 2: Go Wide — Data Expansion

### Agent 4: Canadian CU Scraper (scripts/agent_scraper_ca.py)

Already defined in HANDOFF.md. Extracts financials from annual report PDFs for the 29 Canadian CUs missing data. Separate from the US data agents.

### Agent 5: FFIEC/Call Report Sync (scripts/agent_ffiec.py)

The FDIC data is already in the database but some fields are stale. FFIEC CDR has the freshest data.

```python
# FFIEC CDR Public Web Services: https://cdr.ffiec.gov/public/
# Free bulk download of call report data
# Can get: balance sheet, income statement, off-balance sheet items
# For all FDIC-insured banks, quarterly
# 
# Steps:
# 1. Download latest bulk ZIP from CDR
# 2. Parse the fixed-width or CSV files
# 3. Map FFIEC cert numbers to our institutions table
# 4. Update financial_history_quarterly with latest quarter
# 5. Update institutions table with latest snapshot
#
# This refreshes ALL 4,408 FDIC banks in one shot
```

### Agent 6: NCUA 5300 Call Report Sync (scripts/agent_ncua.py)

```python
# NCUA 5300 Call Reports: https://www.ncua.gov/analysis/credit-union-corporate-call-report-data/quarterly-data
# Free bulk CSV downloads
# Covers all 4,287 credit unions
# Fields: assets, loans, deposits, net worth, delinquency, ROA
#
# Steps:
# 1. Download quarterly CSV
# 2. Parse and map to our schema
# 3. Insert into financial_history_quarterly
# 4. Update institutions with latest snapshot
#
# This refreshes ALL NCUA credit unions in one shot
```

---

## Phase 3: The Mesh Network UI

This is the big frontend build. The goal: type "$14B" and see every institution near that asset level. Click one. See its holding company tree. See its branches on a map. See its financial trajectory. Compare it with peers. All instant.

### Architecture

```
src/
  components/
    MeshExplorer/          ← Main container
      SearchBar.tsx        ← Universal search (name, assets, city, anything)
      FilterPanel.tsx      ← Faceted filters (source, state, asset range, charter type)
      ResultsGrid.tsx      ← Sortable data grid with virtual scroll (10K rows)
      DetailPanel.tsx      ← Right panel: institution deep dive
      CompareDrawer.tsx    ← Bottom drawer: side-by-side comparison
      
    Visualizations/
      TimeSeriesChart.tsx  ← Quarterly/annual financial trends
      AssetDistribution.tsx← Histogram of assets across all institutions
      GeoMap.tsx           ← Mapbox/Leaflet with 10K institution pins
      RelationshipGraph.tsx← D3 force-directed graph of entity_relationships
      TreeMap.tsx          ← Assets by holding company (Palantir-style)
      
    DataQuality/
      CompletenessPanel.tsx← Data coverage dashboard
      QAReport.tsx         ← Results from agent_qa.py
      SourceHealth.tsx     ← Per-source freshness and coverage
      
  lib/
    supabase.ts           ← Supabase client with anon key
    queries.ts            ← All SQL queries centralized
    formatters.ts         ← Currency, percentage, date formatting
    search.ts             ← Full-text search using pg_trgm
```

### Key UX Behaviors

**1. Universal Search Bar**
```sql
-- Uses pg_trgm (already installed) for fuzzy matching
-- Single input searches across: name, city, state, holding_company
-- Also parses special syntax:
--   "$14B" → total_assets BETWEEN 13e9 AND 15e9
--   "OH" → state = 'OH'
--   "credit union" → charter_type = 'credit_union'
--   "roa>2" → roa > 2.0

SELECT * FROM institutions
WHERE name ILIKE '%' || $1 || '%'
   OR city ILIKE '%' || $1 || '%'
   OR holding_company ILIKE '%' || $1 || '%'
ORDER BY total_assets DESC NULLS LAST
LIMIT 100;
```

**2. Faceted Filters (left panel)**
- Country: US / Canada / All
- Source: FDIC, NCUA, OSFI, BCFSA, FSRA, etc. (checkboxes)
- Charter type: commercial, savings, credit_union
- State/Province: dropdown with counts
- Asset range: slider from $0 to $4T
- Has financial data: yes/no
- Active only: toggle

**3. Results Grid (center)**
- Virtual scrolling for 10K rows (react-virtuoso or tanstack-virtual)
- Column sort on any field
- Inline sparkline for assets over time (from financial_history)
- Checkbox to add to comparison
- Click row to open detail panel

**4. Detail Panel (right, slides in)**
- Institution header (name, city, state, source badge)
- Key metrics cards (assets, deposits, ROA, branches, employees)
- Balance sheet composition bar
- Time series chart (8 quarters of assets + ROA)
- Holding company tree (from entity_relationships)
- Branch map (from branches table, plot lat/lng)
- Related entities (subsidiaries, regulators, merged institutions)
- Data quality indicator (how complete is this record?)

**5. Comparison Mode (bottom drawer)**
- Select 2-5 institutions
- Side-by-side metrics table
- Overlaid time series charts
- Relative performance (indexed to 100 at first period)

**6. Mesh/Graph View (separate tab)**
- D3 force-directed graph
- Nodes = institutions, sized by total_assets
- Edges = entity_relationships (subsidiary_of, merged_into, regulated_by)
- Click a node to center and expand its connections
- Color by source or charter type
- Filter: show only nodes above $X billion

### Performance Requirements

- Search results in < 200ms (pg_trgm index + limit 100)
- Full grid render: virtual scroll, only render visible rows
- Charts: recharts with memoization
- Map: cluster markers when zoomed out, individual pins when zoomed in
- Initial page load: fetch top 100 by assets, lazy load rest on scroll/search

### Database Views for Performance

Create SQL views that pre-compute common queries:

```sql
-- Materialized view: institution summary with latest financials
CREATE MATERIALIZED VIEW institution_summary AS
SELECT 
  i.id, i.cert_number, i.name, i.city, i.state, i.source,
  i.charter_type, i.total_assets, i.total_deposits, i.net_income,
  i.equity_capital, i.roa, i.num_branches, i.num_employees,
  i.holding_company, i.website, i.latitude, i.longitude,
  i.data_as_of, i.active,
  CASE WHEN i.source IN ('bcfsa','fsra','cudgc','dgcm','cudgc_sk','nscudic','osfi','ccua') 
       THEN 'CA' ELSE 'US' END as country,
  (SELECT COUNT(*) FROM branches b WHERE b.institution_id = i.id) as branch_count,
  (SELECT COUNT(*) FROM financial_history fh WHERE fh.cert_number = i.cert_number) as history_periods,
  (SELECT COUNT(*) FROM entity_relationships er WHERE er.from_entity_id = i.id OR er.to_entity_id = i.id) as relationship_count
FROM institutions i
WHERE i.active = true;

CREATE INDEX idx_summary_assets ON institution_summary(total_assets DESC NULLS LAST);
CREATE INDEX idx_summary_name_trgm ON institution_summary USING gin(name gin_trgm_ops);
CREATE INDEX idx_summary_source ON institution_summary(source);
CREATE INDEX idx_summary_state ON institution_summary(state);
CREATE INDEX idx_summary_country ON institution_summary(country);

-- Refresh nightly or after data updates
-- REFRESH MATERIALIZED VIEW CONCURRENTLY institution_summary;
```

---

## Phase 4: Database Hardening

### RLS Fixes (from Supabase security audit)

```sql
-- Fix: 2 tables missing RLS
ALTER TABLE data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON data_sources FOR SELECT USING (true);
CREATE POLICY "Public read" ON ai_summaries FOR SELECT USING (true);

-- Fix: RLS init plan performance (wrap auth calls in subquery)
-- For each policy using current_setting() or auth.role():
-- Replace: current_setting('request.jwt.claims', true)
-- With: (SELECT current_setting('request.jwt.claims', true))
```

### Duplicate RLS Policy Cleanup

Multiple permissive policies on same table. Consolidate to one read + one write per table.

---

## Execution Order for Cursor

### Sprint 1: Foundation (Day 1)

Run in parallel across 3 terminals:

**Terminal 1 — QA Agent:**
```bash
cd ~/Documents/GitHub/data-studio
source .venv/bin/activate
python scripts/agent_qa.py
```

**Terminal 2 — Relationship Agent:**
```bash
python scripts/agent_relationships.py
```

**Terminal 3 — Completeness Agent:**
```bash
python scripts/agent_completeness.py
```

### Sprint 2: Data Expansion (Day 2-3)

**Terminal 1 — Canadian CU Scraper:**
```bash
python scripts/agent_scraper_ca.py
```

**Terminal 2 — NCUA 5300 Bulk Sync:**
```bash
python scripts/agent_ncua.py
```

**Terminal 3 — ROA/Lat-Lng Backfill:**
```bash
python scripts/agent_completeness.py --backfill-coords --backfill-roa
```

### Sprint 3: Frontend Rebuild (Day 3-5)

Replace the existing frontend with the mesh network UI. Keep the Vite setup. Add:
- @supabase/supabase-js for real-time data
- @tanstack/react-virtual for virtual scrolling
- recharts for charts (already used)
- react-map-gl or leaflet for geographic view
- d3 for the relationship graph

### Sprint 4: Polish and Deploy (Day 5-6)

- Create materialized view
- Fix RLS policies
- Performance testing (search < 200ms)
- Push to main (auto-deploys to Vercel)

---

## Rules for All Agents

1. Never use the word "engine" in code
2. Canadian CU reports are in thousands of CAD. Multiply by 1000
3. cert_number 900001+ for Canadian CUs
4. source field must match check constraint (lowercase)
5. No Claude API / LLM calls in any agent
6. No storing PDFs
7. Every agent prints a summary report when done
8. Every agent logs errors but does NOT stop on individual failures
9. Push to main when stable. Vercel auto-deploys
10. When unsure about schema changes, add to HANDOFF.md "Questions for Claude"

## Questions for Claude
(Cursor: write questions here. Claude answers next session.)

