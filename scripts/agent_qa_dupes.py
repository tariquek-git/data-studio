#!/usr/bin/env python3
"""
agent_qa_dupes.py — Detect duplicate institutions.
Checks for same name+state, same cert_number+source. Read-only.

Run: python scripts/agent_qa_dupes.py
"""
import sys
from collections import defaultdict
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from _db import SUPABASE_URL, get_headers
import requests
from datetime import datetime

HEADERS = get_headers()

def fetch_all_institutions():
    rows = []
    limit = 1000
    offset = 0
    while True:
        resp = requests.get(
            f'{SUPABASE_URL}/rest/v1/institutions',
            headers=HEADERS,
            params={
                'select': 'id,cert_number,source,name,city,state,total_assets',
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

def main():
    print(f'\n{"="*60}')
    print('  AGENT: agent_qa_dupes — Duplicate Detection')
    print(f'  Run: {datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")}')
    print(f'{"="*60}\n')

    rows = fetch_all_institutions()
    print(f'Scanning {len(rows):,} institutions...\n')

    # Check 1: same cert_number + same source (should be unique)
    cert_src = defaultdict(list)
    for r in rows:
        key = (r['cert_number'], r['source'])
        cert_src[key].append(r)
    cert_dupes = {k: v for k, v in cert_src.items() if len(v) > 1}

    # Check 2: same name + same state (potential dupes, different sources OK)
    name_state = defaultdict(list)
    for r in rows:
        name = (r.get('name') or '').strip().upper()
        state = (r.get('state') or '').strip().upper()
        if name and state:
            name_state[(name, state)].append(r)
    name_dupes = {k: v for k, v in name_state.items() if len(v) > 1}
    # Filter: only flag if same source (cross-source same-name is expected for cross-border)
    name_dupes_same_src = {
        k: v for k, v in name_dupes.items()
        if len(set(r['source'] for r in v)) < len(v)
    }

    # Print cert dupes (critical)
    if cert_dupes:
        print(f'CRITICAL — Same cert_number + source ({len(cert_dupes)} groups):')
        for (cert, src), grp in list(cert_dupes.items())[:20]:
            print(f'  cert={cert} source={src}: {len(grp)} records')
            for r in grp:
                print(f'    id={r["id"]}  {r["name"][:40]}')
    else:
        print('CRITICAL (cert+source dupes): None ✓')

    print()

    # Print name+state dupes (warning)
    if name_dupes_same_src:
        print(f'WARNING — Same name+state+source ({len(name_dupes_same_src)} groups):')
        for (name, state), grp in list(name_dupes_same_src.items())[:20]:
            print(f'  {name[:40]} / {state}: {len(grp)} records')
            for r in grp:
                print(f'    cert={r["cert_number"]}  source={r["source"]}  assets={r.get("total_assets")}')
    else:
        print('WARNING (name+state same-source dupes): None ✓')

    # Also show cross-source same-name (info, expected for TD Bank etc)
    cross_src_same_name = {k: v for k, v in name_dupes.items() if k not in name_dupes_same_src}
    if cross_src_same_name:
        print(f'\nINFO — Same name+state across different sources ({len(cross_src_same_name)} groups, expected for cross-border):')
        for (name, state), grp in list(cross_src_same_name.items())[:10]:
            srcs = ', '.join(sorted(set(r['source'] for r in grp)))
            print(f'  {name[:40]} / {state}  [{srcs}]')

    print(f'\n{"="*60}')
    print('  SUMMARY')
    print(f'  Cert+source duplicates (critical): {len(cert_dupes)}')
    print(f'  Name+state same-source dupes:      {len(name_dupes_same_src)}')
    print(f'  Cross-source same-name (info):     {len(cross_src_same_name)}')
    print(f'{"="*60}\n')

if __name__ == '__main__':
    main()
