#!/usr/bin/env python3
"""
agent_fill_branches.py — Sync num_branches in institutions from actual branches table count.
Compares branches.institution_id counts with institutions.num_branches and updates mismatches.

Run: python scripts/agent_fill_branches.py [--dry-run]
"""
import sys
from collections import Counter
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from _db import check_write_access, SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY
import requests
from datetime import datetime

DRY_RUN = '--dry-run' in sys.argv
KEY = SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY
HEADERS_R = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}
HEADERS_W = {**HEADERS_R, 'Prefer': 'return=minimal'}

def fetch_all(table, cols, filters=None):
    rows = []
    limit = 1000
    offset = 0
    while True:
        params = {'select': cols, 'limit': limit, 'offset': offset}
        if filters:
            params.update(filters)
        resp = requests.get(f'{SUPABASE_URL}/rest/v1/{table}', headers=HEADERS_R, params=params, timeout=60)
        resp.raise_for_status()
        batch = resp.json()
        rows.extend(batch)
        if len(batch) < limit:
            break
        offset += limit
    return rows

def main():
    if not DRY_RUN:
        check_write_access()

    print(f'\n{"="*55}')
    print('  AGENT: agent_fill_branches')
    print(f'  Mode: {"DRY RUN" if DRY_RUN else "LIVE WRITE"}')
    print(f'  Run:  {datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")}')
    print(f'{"="*55}\n')

    print('Loading branches...')
    branches = fetch_all('branches', 'cert_number')
    branch_counts = Counter(r['cert_number'] for r in branches if r.get('cert_number'))
    print(f'  {len(branches):,} branches across {len(branch_counts):,} institutions\n')

    print('Loading institutions...')
    institutions = fetch_all('institutions', 'id,cert_number,name,num_branches')
    cert_to_inst = {r['cert_number']: r for r in institutions}
    print(f'  {len(institutions):,} institutions\n')

    # Find mismatches
    to_update = []
    for cert, actual_count in branch_counts.items():
        inst = cert_to_inst.get(cert)
        if not inst:
            continue
        stored = inst.get('num_branches') or 0
        if stored != actual_count:
            to_update.append({
                'id': inst['id'],
                'cert_number': cert,
                'name': inst['name'],
                'stored': stored,
                'actual': actual_count,
            })

    # Also find institutions with num_branches set but no branches rows
    inst_with_stored = [r for r in institutions if r.get('num_branches') and r.get('num_branches', 0) > 0]
    missing_rows = [r for r in inst_with_stored if r['cert_number'] not in branch_counts]

    print(f'Found {len(to_update):,} institutions with mismatched branch counts')
    print(f'Found {len(missing_rows):,} institutions with num_branches stored but no branch rows\n')

    if to_update:
        print('Sample mismatches (first 10):')
        for u in to_update[:10]:
            print(f'  {u["name"][:40]:<40}  stored={u["stored"]:>5}  actual={u["actual"]:>5}')

    updated = 0
    for u in to_update:
        if DRY_RUN:
            updated += 1
            continue
        try:
            resp = requests.patch(
                f'{SUPABASE_URL}/rest/v1/institutions',
                headers=HEADERS_W,
                params={'id': f'eq.{u["id"]}'},
                json={'num_branches': u['actual'], 'updated_at': datetime.utcnow().isoformat()},
                timeout=30,
            )
            resp.raise_for_status()
            updated += 1
        except Exception as e:
            print(f'  ERROR: {u["cert_number"]} {e}')

    print(f'\n{"="*55}')
    print(f'  {"Would update" if DRY_RUN else "Updated"}: {updated:,} institutions')
    print(f'  Mode: {"DRY RUN" if DRY_RUN else "LIVE"}')
    print(f'{"="*55}\n')

if __name__ == '__main__':
    main()
