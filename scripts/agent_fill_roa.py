#!/usr/bin/env python3
"""
agent_fill_roa.py — Calculate ROA where net_income and total_assets exist but roa is NULL.
Formula: roa = (net_income / total_assets) * 100
Writes to institutions table. Idempotent.

Run: python scripts/agent_fill_roa.py [--dry-run]
"""
import sys
import time
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from _db import check_write_access, SUPABASE_URL, get_headers
import requests
from datetime import datetime

DRY_RUN = '--dry-run' in sys.argv
HEADERS = get_headers(write=True)

def fetch_missing_roa():
    """Fetch institutions where roa is NULL but net_income and total_assets are set."""
    rows = []
    limit = 1000
    offset = 0
    while True:
        resp = requests.get(
            f'{SUPABASE_URL}/rest/v1/institutions',
            headers=HEADERS,
            params={
                'select': 'id,cert_number,source,name,net_income,total_assets,roa',
                'roa': 'is.null',
                'net_income': 'not.is.null',
                'total_assets': 'not.is.null',
                'total_assets': 'gt.0',
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

def update_roa(inst_id: str, roa_val: float):
    resp = requests.patch(
        f'{SUPABASE_URL}/rest/v1/institutions',
        headers=HEADERS,
        params={'id': f'eq.{inst_id}'},
        json={'roa': round(roa_val, 4), 'updated_at': datetime.utcnow().isoformat()},
        timeout=30,
    )
    resp.raise_for_status()

def main():
    if not DRY_RUN:
        check_write_access()

    print(f'\n{"="*55}')
    print('  AGENT: agent_fill_roa')
    print(f'  Mode: {"DRY RUN" if DRY_RUN else "LIVE WRITE"}')
    print(f'  Run:  {datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")}')
    print(f'{"="*55}\n')

    rows = fetch_missing_roa()
    print(f'Found {len(rows):,} institutions with missing ROA (have net_income + total_assets)\n')

    if not rows:
        print('Nothing to do.')
        return

    updated = 0
    skipped = 0
    errors = 0

    for r in rows:
        ni = r.get('net_income')
        ta = r.get('total_assets')
        if not ta or ta == 0:
            skipped += 1
            continue
        roa = (ni / ta) * 100
        # Sanity check: ROA outside -20% to +20% is suspicious but we still write it
        flag = ' ⚠ suspicious' if abs(roa) > 10 else ''
        if DRY_RUN:
            print(f'  [{r["source"]}] {r["name"][:40]:<40} ROA = {roa:+.4f}%{flag}')
            updated += 1
            continue
        try:
            update_roa(r['id'], roa)
            updated += 1
            if updated % 500 == 0:
                print(f'  ... {updated:,} updated')
        except Exception as e:
            print(f'  ERROR on {r["cert_number"]} ({r["name"][:30]}): {e}')
            errors += 1

    print(f'\n{"="*55}')
    print('  SUMMARY')
    print(f'  Updated:  {updated:,}')
    print(f'  Skipped:  {skipped:,} (zero total_assets)')
    print(f'  Errors:   {errors:,}')
    print(f'  Mode:     {"DRY RUN — no changes written" if DRY_RUN else "LIVE — database updated"}')
    print(f'{"="*55}\n')

if __name__ == '__main__':
    main()
