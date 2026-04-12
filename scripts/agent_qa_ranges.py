#!/usr/bin/env python3
"""
agent_qa_ranges.py — Check for out-of-range financial values.
Flags ROA, assets, employees, branches outside expected ranges.
Read-only.

Run: python scripts/agent_qa_ranges.py
"""
import sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from _db import SUPABASE_URL, get_headers
import requests
from datetime import datetime

HEADERS = get_headers()

def fetch_all():
    rows = []
    limit = 1000
    offset = 0
    while True:
        resp = requests.get(
            f'{SUPABASE_URL}/rest/v1/institutions',
            headers=HEADERS,
            params={
                'select': 'cert_number,source,name,total_assets,net_income,roa,num_branches,num_employees,equity_capital',
                'total_assets': 'not.is.null',
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

def flag(tag, field, val, lo, hi, critical=False):
    level = 'CRITICAL' if critical else 'WARNING'
    return f'[{level}] {tag}  {field}={val:,}'

def main():
    print(f'\n{"="*60}')
    print('  AGENT: agent_qa_ranges — Range Checks')
    print(f'  Run: {datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")}')
    print(f'{"="*60}\n')

    rows = fetch_all()
    print(f'Checking {len(rows):,} institutions...\n')

    criticals = []
    warnings = []

    for r in rows:
        ta = r.get('total_assets') or 0
        roa = r.get('roa')
        ni = r.get('net_income')
        branches = r.get('num_branches') or 0
        employees = r.get('num_employees') or 0
        ec = r.get('equity_capital') or 0
        name = r['name'][:35]
        cert = r['cert_number']
        src = r['source']
        tag = f'[{src}] cert={cert} {name}'

        # ROA range
        if roa is not None:
            if roa < -5 or roa > 10:
                warnings.append(f'[W001] ROA={roa:.3f}% outside -5%/+10% — {tag}')
            if abs(roa) > 20:
                criticals.append(f'[C001] ROA={roa:.3f}% outside ±20% (likely data error) — {tag}')

        # Assets
        if ta < 0:
            criticals.append(f'[C002] Negative total_assets={ta:,} — {tag}')

        # Net income > total assets (impossible)
        if ni is not None and ta > 0 and abs(ni) > ta:
            criticals.append(f'[C003] |net_income|={abs(ni):,} > total_assets={ta:,} — {tag}')

        # Branches
        if branches > 10000:
            warnings.append(f'[W002] num_branches={branches:,} suspiciously high — {tag}')
        if branches < 0:
            criticals.append(f'[C004] Negative num_branches={branches} — {tag}')

        # Employees
        if employees > 500000:
            warnings.append(f'[W003] num_employees={employees:,} suspiciously high — {tag}')
        if employees < 0:
            criticals.append(f'[C005] Negative num_employees={employees} — {tag}')

        # Equity
        if ec < 0:
            warnings.append(f'[W004] Negative equity_capital={ec:,} — {tag}')

        # Tiny assets (< $100K) for institutions claiming to be active
        if ta > 0 and ta < 100_000:
            warnings.append(f'[W005] Very small total_assets=${ta:,} — {tag}')

    if criticals:
        print(f'CRITICAL ({len(criticals)}):')
        for c in criticals[:30]:
            print(f'  {c}')
        if len(criticals) > 30:
            print(f'  ... and {len(criticals)-30} more')
    else:
        print('CRITICAL: None ✓')

    print()
    if warnings:
        print(f'WARNINGS ({len(warnings)}):')
        for w in warnings[:40]:
            print(f'  {w}')
        if len(warnings) > 40:
            print(f'  ... and {len(warnings)-40} more')
    else:
        print('WARNINGS: None ✓')

    print(f'\n{"="*60}')
    print(f'  Critical: {len(criticals)}   Warnings: {len(warnings)}')
    print(f'{"="*60}\n')

if __name__ == '__main__':
    main()
