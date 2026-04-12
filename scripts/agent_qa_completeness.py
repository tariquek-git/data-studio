#!/usr/bin/env python3
"""
agent_qa_completeness.py — Per-source data coverage scorecard.
Reads institutions table and prints coverage metrics per source.
Read-only. Safe to run anytime.

Run: python scripts/agent_qa_completeness.py
"""
import sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from _db import select, SUPABASE_URL, get_headers
import requests
from datetime import datetime

HEADERS = get_headers()

def fetch_all(table, columns='*', filters=None):
    rows = []
    limit = 1000
    offset = 0
    while True:
        params = {'select': columns, 'limit': limit, 'offset': offset}
        if filters:
            params.update(filters)
        resp = requests.get(f'{SUPABASE_URL}/rest/v1/{table}', headers=HEADERS, params=params, timeout=60)
        resp.raise_for_status()
        batch = resp.json()
        rows.extend(batch)
        if len(batch) < limit:
            break
        offset += limit
    return rows

def pct(num, denom):
    if denom == 0:
        return '  N/A'
    return f'{num/denom*100:5.1f}%'

def grade(pct_float):
    if pct_float >= 95: return 'A'
    if pct_float >= 85: return 'B+'
    if pct_float >= 75: return 'B'
    if pct_float >= 60: return 'C'
    if pct_float >= 40: return 'D'
    if pct_float > 0:   return 'F+'
    return 'F'

def main():
    print(f'\n{"="*60}')
    print('  DATA STUDIO — QA COMPLETENESS REPORT')
    print(f'  Run: {datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")}')
    print(f'{"="*60}\n')

    cols = 'source,total_assets,net_income,roa,latitude,website,holding_company,data_as_of,num_branches,credit_card_loans,active'
    rows = fetch_all('institutions', cols)

    # Overall stats
    total = len(rows)
    active = sum(1 for r in rows if r.get('active'))
    print(f'Total institutions:  {total:,}')
    print(f'Active:              {active:,}')
    print()

    # Per-field completeness (all institutions)
    fields = [
        ('total_assets',      'Total assets'),
        ('net_income',        'Net income'),
        ('roa',               'ROA'),
        ('latitude',          'Lat/lng'),
        ('website',           'Website'),
        ('holding_company',   'Holding company'),
        ('data_as_of',        'Data as-of date'),
        ('num_branches',      'Branch count'),
        ('credit_card_loans', 'Card loans'),
    ]
    print('OVERALL COVERAGE')
    print(f'  {"Field":<22} {"Count":>7} {"Pct":>7}  Grade')
    print(f'  {"-"*22} {"-"*7} {"-"*7}  -----')
    for field, label in fields:
        count = sum(1 for r in rows if r.get(field) is not None)
        p = count / total * 100 if total else 0
        print(f'  {label:<22} {count:>7,} {pct(count,total):>7}  {grade(p)}')

    # Per-source breakdown
    sources = sorted(set(r['source'] for r in rows))
    print(f'\nPER-SOURCE COVERAGE (assets / net_income / roa / coords / website)')
    print(f'  {"Source":<12} {"Count":>6}  {"Assets":>7}  {"NetInc":>7}  {"ROA":>7}  {"Coords":>7}  {"Website":>7}')
    print(f'  {"-"*12} {"-"*6}  {"-"*7}  {"-"*7}  {"-"*7}  {"-"*7}  {"-"*7}')
    for src in sources:
        src_rows = [r for r in rows if r['source'] == src]
        n = len(src_rows)
        a = sum(1 for r in src_rows if r.get('total_assets') is not None)
        ni = sum(1 for r in src_rows if r.get('net_income') is not None)
        roa = sum(1 for r in src_rows if r.get('roa') is not None)
        coords = sum(1 for r in src_rows if r.get('latitude') is not None)
        web = sum(1 for r in src_rows if r.get('website') is not None)
        print(f'  {src:<12} {n:>6,}  {pct(a,n):>7}  {pct(ni,n):>7}  {pct(roa,n):>7}  {pct(coords,n):>7}  {pct(web,n):>7}')

    # Gap analysis
    print('\nGAP ANALYSIS — Top priorities')
    no_coords = sum(1 for r in rows if r.get('latitude') is None and r.get('total_assets') is not None)
    no_website = sum(1 for r in rows if r.get('website') is None and r.get('total_assets') is not None)
    no_roa = sum(1 for r in rows if r.get('roa') is None and r.get('net_income') is not None and r.get('total_assets') is not None)
    no_relationships = '(check entity_relationships table)'
    ca_no_fin = sum(1 for r in rows if r['source'] not in ('fdic','ncua') and r.get('total_assets') is None)

    print(f'  Institutions with assets but no coords:     {no_coords:,}  → run agent_fill_coords.py')
    print(f'  Institutions with assets but no website:    {no_website:,}  → run agent_fill_websites.py')
    print(f'  Institutions calculable ROA but missing it: {no_roa:,}  → run agent_fill_roa.py')
    print(f'  Canadian/other with no financials:          {ca_no_fin:,}  → run agent_scraper_ca.py')
    print(f'  Entity relationships:                       {no_relationships}')

    print(f'\n{"="*60}')
    print('  END REPORT')
    print(f'{"="*60}\n')

if __name__ == '__main__':
    main()
