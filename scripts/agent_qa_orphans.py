#!/usr/bin/env python3
"""
agent_qa_orphans.py — Detect orphan records in financial_history and branches
that have no matching institution. Read-only.

Run: python scripts/agent_qa_orphans.py
"""
import sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from _db import SUPABASE_URL, get_headers
import requests
from datetime import datetime

HEADERS = get_headers()

def fetch_all(table, cols, filters=None):
    rows = []
    limit = 1000
    offset = 0
    while True:
        params = {'select': cols, 'limit': limit, 'offset': offset}
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

def main():
    print(f'\n{"="*60}')
    print('  AGENT: agent_qa_orphans — Orphan Record Detection')
    print(f'  Run: {datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")}')
    print(f'{"="*60}\n')

    # Load institution cert_numbers and ids
    institutions = fetch_all('institutions', 'id,cert_number,name')
    valid_certs = {r['cert_number'] for r in institutions}
    valid_ids = {r['id'] for r in institutions}
    cert_to_name = {r['cert_number']: r['name'] for r in institutions}
    print(f'Loaded {len(institutions):,} institutions\n')

    issues = []

    # Check financial_history orphans
    fh = fetch_all('financial_history', 'id,cert_number,period')
    null_cert_fh = [r for r in fh if r.get('cert_number') is None]
    orphan_fh = [r for r in fh if r.get('cert_number') is not None and r['cert_number'] not in valid_certs]
    print(f'financial_history: {len(fh):,} records')
    if null_cert_fh:
        issues.append(f'[C001] {len(null_cert_fh)} financial_history records with NULL cert_number')
    if orphan_fh:
        issues.append(f'[C002] {len(orphan_fh)} financial_history records with no matching institution')
        for r in orphan_fh[:5]:
            print(f'  Orphan: cert={r["cert_number"]} period={r.get("period")}')

    # Check financial_history_quarterly orphans
    # Uses warehouse schema: entity_table + entity_id (UUID), no cert_number
    fhq = fetch_all('financial_history_quarterly', 'id,entity_table,entity_id,period')
    null_eid_fhq = [r for r in fhq if r.get('entity_id') is None]
    orphan_fhq = [r for r in fhq if r.get('entity_id') is not None
                  and r.get('entity_table') == 'institutions'
                  and r['entity_id'] not in valid_ids]
    print(f'financial_history_quarterly: {len(fhq):,} records')
    if null_eid_fhq:
        issues.append(f'[C003] {len(null_eid_fhq)} financial_history_quarterly records with NULL entity_id')
    if orphan_fhq:
        issues.append(f'[C004] {len(orphan_fhq)} quarterly records with no matching institution entity_id')

    # Check branches orphans (branches table uses cert_number not institution_id)
    branches = fetch_all('branches', 'id,cert_number,branch_name')
    null_cert_br = [r for r in branches if r.get('cert_number') is None]
    orphan_br = [r for r in branches if r.get('cert_number') is not None and r['cert_number'] not in valid_certs]
    print(f'branches: {len(branches):,} records')
    if null_cert_br:
        issues.append(f'[C005] {len(null_cert_br)} branches with NULL cert_number')
    if orphan_br:
        issues.append(f'[C006] {len(orphan_br)} branches with no matching institution')

    # Check charter_events orphans
    # Uses warehouse schema: entity_table + entity_id (UUID), no cert_number
    events = fetch_all('charter_events', 'id,entity_table,entity_id,event_type')
    orphan_ev = [r for r in events if r.get('entity_id') is not None
                 and r.get('entity_table') == 'institutions'
                 and r['entity_id'] not in valid_ids]
    print(f'charter_events: {len(events):,} records')
    if orphan_ev:
        issues.append(f'[W001] {len(orphan_ev)} charter_events with no matching institution (may be historical)')

    print()
    if issues:
        print(f'ISSUES FOUND ({len(issues)}):')
        for issue in issues:
            print(f'  {issue}')
    else:
        print('No orphan issues found ✓')

    print(f'\n{"="*60}')
    print(f'  Total issues: {len(issues)}')
    print(f'{"="*60}\n')

if __name__ == '__main__':
    main()
