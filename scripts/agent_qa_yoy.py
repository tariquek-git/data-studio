#!/usr/bin/env python3
"""
agent_qa_yoy.py — Year-over-year consistency checks in financial_history.
Flags metrics that changed >50% YoY for the same institution (excluding known mergers).
Read-only.

Run: python scripts/agent_qa_yoy.py
"""
import sys
from collections import defaultdict
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from _db import SUPABASE_URL, get_headers
import requests
from datetime import datetime

HEADERS = get_headers()

YOY_THRESHOLD = 0.50  # flag if >50% change

def fetch_history():
    rows = []
    limit = 1000
    offset = 0
    while True:
        resp = requests.get(
            f'{SUPABASE_URL}/rest/v1/financial_history',
            headers=HEADERS,
            params={
                'select': 'cert_number,period_date,total_assets,total_deposits,net_income,equity_capital',
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

def fetch_merger_certs():
    """Get cert_numbers that have merger events (expected YoY jumps)."""
    resp = requests.get(
        f'{SUPABASE_URL}/rest/v1/charter_events',
        headers=HEADERS,
        params={
            'select': 'cert_number',
            'event_type': 'in.(merger,acquired,merged_into,consolidation)',
            'limit': 10000,
        },
        timeout=60,
    )
    resp.raise_for_status()
    return {r['cert_number'] for r in resp.json()}

def main():
    print(f'\n{"="*60}')
    print('  AGENT: agent_qa_yoy — Year-over-Year Consistency')
    print(f'  Run: {datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")}')
    print(f'  Threshold: >{YOY_THRESHOLD*100:.0f}% change')
    print(f'{"="*60}\n')

    print('Loading financial history...')
    history = fetch_history()
    merger_certs = fetch_merger_certs()
    print(f'Loaded {len(history):,} annual records, {len(merger_certs):,} merger certs\n')

    # Group by cert_number and sort by period_date
    by_cert = defaultdict(list)
    for r in history:
        by_cert[r['cert_number']].append(r)
    for cert in by_cert:
        by_cert[cert].sort(key=lambda x: x.get('period_date') or '')

    flags = []
    checked_pairs = 0

    for cert, periods in by_cert.items():
        if len(periods) < 2:
            continue
        is_merger = cert in merger_certs

        for i in range(1, len(periods)):
            prev = periods[i-1]
            curr = periods[i]
            checked_pairs += 1

            for field in ('total_assets', 'total_deposits', 'equity_capital'):
                pv = prev.get(field)
                cv = curr.get(field)
                if pv is None or cv is None or pv == 0:
                    continue
                change = abs(cv - pv) / abs(pv)
                if change > YOY_THRESHOLD:
                    merger_note = ' (has merger event — expected)' if is_merger else ''
                    if not is_merger:
                        flags.append({
                            'cert': cert,
                            'field': field,
                            'change_pct': change * 100,
                            'prev_date': prev.get('period_date'),
                            'curr_date': curr.get('period_date'),
                            'prev_val': pv,
                            'curr_val': cv,
                        })

    flags.sort(key=lambda x: -x['change_pct'])

    if flags:
        print(f'FLAGS ({len(flags)} YoY anomalies, excluding merger certs):')
        print(f'  {"Cert":>8}  {"Field":<20}  {"Change":>8}  {"Prev Date":>12}  {"Curr Date":>12}')
        print(f'  {"-"*8}  {"-"*20}  {"-"*8}  {"-"*12}  {"-"*12}')
        for f in flags[:40]:
            print(f'  {f["cert"]:>8}  {f["field"]:<20}  {f["change_pct"]:>7.1f}%  {f["prev_date"] or "N/A":>12}  {f["curr_date"] or "N/A":>12}')
        if len(flags) > 40:
            print(f'  ... and {len(flags)-40} more')
    else:
        print('No YoY anomalies found ✓')

    print(f'\n{"="*60}')
    print(f'  Cert-period pairs checked: {checked_pairs:,}')
    print(f'  YoY anomalies flagged:     {len(flags)}')
    print(f'  Merger certs excluded:     {len(merger_certs):,}')
    print(f'{"="*60}\n')

if __name__ == '__main__':
    main()
