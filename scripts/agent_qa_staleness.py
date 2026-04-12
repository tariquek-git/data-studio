#!/usr/bin/env python3
"""
agent_qa_staleness.py — Flag stale data_as_of dates and missing date coverage.
Read-only.

Run: python scripts/agent_qa_staleness.py
"""
import sys
from datetime import datetime, date
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from _db import SUPABASE_URL, get_headers
import requests

HEADERS = get_headers()
STALE_MONTHS = 18
TODAY = date.today()

def fetch_all():
    rows = []
    limit = 1000
    offset = 0
    while True:
        resp = requests.get(
            f'{SUPABASE_URL}/rest/v1/institutions',
            headers=HEADERS,
            params={
                'select': 'cert_number,source,name,total_assets,data_as_of,last_synced_at',
                'limit': limit,
                'offset': offset,
            },
            timeout=60,
        )
        resp.raise_for_status()
        batch = resp.json()
        rows.extend(batch)
        if len(batch) < limit:
            break
        offset += limit
    return rows

def months_ago(d_str) -> float | None:
    if not d_str:
        return None
    try:
        d = date.fromisoformat(d_str[:10])
        return (TODAY - d).days / 30.44
    except Exception:
        return None

def main():
    print(f'\n{"="*60}')
    print('  AGENT: agent_qa_staleness — Data Freshness Check')
    print(f'  Run: {datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")}')
    print(f'  Stale threshold: {STALE_MONTHS} months')
    print(f'{"="*60}\n')

    rows = fetch_all()
    total = len(rows)
    print(f'Checking {total:,} institutions...\n')

    stale = []
    missing_date = []
    by_source = {}

    for r in rows:
        src = r['source']
        m = months_ago(r.get('data_as_of'))
        if m is None:
            if r.get('total_assets'):
                missing_date.append(r)
        elif m > STALE_MONTHS:
            stale.append((m, r))
        by_source.setdefault(src, {'count': 0, 'stale': 0, 'missing': 0, 'latest': None})
        by_source[src]['count'] += 1
        if m is None and r.get('total_assets'):
            by_source[src]['missing'] += 1
        elif m is not None and m > STALE_MONTHS:
            by_source[src]['stale'] += 1
        if r.get('data_as_of') and (by_source[src]['latest'] is None or r['data_as_of'] > by_source[src]['latest']):
            by_source[src]['latest'] = r['data_as_of']

    print(f'PER-SOURCE FRESHNESS')
    print(f'  {"Source":<12} {"Count":>6}  {"Latest data_as_of":>18}  {"Stale":>6}  {"No date+assets":>14}')
    print(f'  {"-"*12} {"-"*6}  {"-"*18}  {"-"*6}  {"-"*14}')
    for src, s in sorted(by_source.items(), key=lambda x: -(x[1].get('count',0))):
        print(f'  {src:<12} {s["count"]:>6,}  {(s["latest"] or "N/A"):>18}  {s["stale"]:>6,}  {s["missing"]:>14,}')

    if stale:
        print(f'\nSTALE RECORDS (>{STALE_MONTHS} months, {len(stale)} total):')
        for m, r in sorted(stale, key=lambda x: -x[0])[:20]:
            print(f'  {r["source"]:<8} {r["name"][:35]:<35}  {r.get("data_as_of","N/A")}  ({m:.0f} months ago)')

    if missing_date:
        print(f'\nMISSING data_as_of (have assets, no date, {len(missing_date)} total):')
        for r in missing_date[:10]:
            print(f'  {r["source"]:<8} {r["name"][:40]}')

    print(f'\n{"="*60}')
    print(f'  Total stale (>{STALE_MONTHS}mo): {len(stale):,}')
    print(f'  Missing date+assets:      {len(missing_date):,}')
    print(f'{"="*60}\n')

if __name__ == '__main__':
    main()
