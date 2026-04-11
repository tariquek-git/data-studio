#!/usr/bin/env python3
"""
agent_qa_balance.py — Balance sheet identity checks.
Flags institutions where financials violate basic accounting identities.
Read-only. Safe to run anytime.

Run: python scripts/agent_qa_balance.py
"""
import sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from _db import SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY
import requests
from datetime import datetime

KEY = SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY
HEADERS = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}

def fetch_all_financials():
    rows = []
    limit = 1000
    offset = 0
    while True:
        resp = requests.get(
            f'{SUPABASE_URL}/rest/v1/institutions',
            headers=HEADERS,
            params={
                'select': 'cert_number,source,name,total_assets,total_deposits,equity_capital,net_income,roa',
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

def main():
    print(f'\n{"="*60}')
    print('  AGENT: agent_qa_balance — Balance Sheet Checks')
    print(f'  Run: {datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")}')
    print(f'{"="*60}\n')

    rows = fetch_all_financials()
    print(f'Checking {len(rows):,} institutions with financial data...\n')

    critical = []
    warnings = []

    for r in rows:
        ta = r.get('total_assets') or 0
        td = r.get('total_deposits') or 0
        ec = r.get('equity_capital') or 0
        ni = r.get('net_income')
        roa = r.get('roa')
        name = r['name'][:40]
        cert = r['cert_number']
        src = r['source']
        tag = f'[{src}] cert={cert} {name}'

        # CRITICAL: impossible values
        if ta < 0:
            critical.append(f'[C001] Negative total_assets: {tag}  assets={ta:,}')
        if td < 0:
            critical.append(f'[C002] Negative total_deposits: {tag}  deposits={td:,}')
        if ec < 0:
            critical.append(f'[C003] Negative equity_capital: {tag}  equity={ec:,}')
        if ni is not None and ta > 0 and abs(ni) > ta:
            critical.append(f'[C004] Net income > total_assets: {tag}  ni={ni:,} assets={ta:,}')
        if td > 0 and ta > 0 and td > ta:
            critical.append(f'[C005] Deposits > total_assets: {tag}  dep={td:,} assets={ta:,}')

        # WARNINGS: suspicious but possible
        if td > 0 and ec > 0 and ta > 0 and (td + ec * 0.5) > ta:
            warnings.append(f'[W001] Deposits+0.5*equity suspiciously close to assets: {tag}')
        if roa is not None and abs(roa) > 5:
            warnings.append(f'[W002] ROA outside ±5%: {tag}  roa={roa:.3f}%')
        if roa is not None and abs(roa) > 10:
            critical.append(f'[C006] ROA outside ±10% (likely error): {tag}  roa={roa:.3f}%')

    # Print results
    if critical:
        print(f'CRITICAL ({len(critical)} issues):')
        for c in critical[:50]:
            print(f'  {c}')
        if len(critical) > 50:
            print(f'  ... and {len(critical)-50} more')
    else:
        print('CRITICAL: None ✓')

    print()
    if warnings:
        print(f'WARNINGS ({len(warnings)} issues):')
        for w in warnings[:30]:
            print(f'  {w}')
        if len(warnings) > 30:
            print(f'  ... and {len(warnings)-30} more')
    else:
        print('WARNINGS: None ✓')

    print(f'\n{"="*60}')
    print('  SUMMARY')
    print(f'  Institutions checked: {len(rows):,}')
    print(f'  Critical issues:      {len(critical)}')
    print(f'  Warnings:             {len(warnings)}')
    print(f'{"="*60}\n')

if __name__ == '__main__':
    main()
