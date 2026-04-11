#!/usr/bin/env python3
"""
agent_brim_cards.py — Backfill bank_capabilities with card portfolio data from institutions.
Copies credit_card_loans → card_portfolio_size for all 698 FDIC institutions that have it.
Also sets issues_credit_cards = true, card_portfolio_source = 'fdic_call_report'.

Writes to bank_capabilities table. Idempotent (upsert on cert_number).

Run: python scripts/agent_brim_cards.py [--dry-run]
"""
import sys
import uuid
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from _db import check_write_access, SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY
import requests
from datetime import datetime

DRY_RUN = '--dry-run' in sys.argv
KEY = SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY
HEADERS_R = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}
HEADERS_W = {**HEADERS_R, 'Prefer': 'resolution=merge-duplicates,return=minimal'}

def fetch_card_institutions():
    rows = []
    limit = 1000
    offset = 0
    while True:
        resp = requests.get(
            f'{SUPABASE_URL}/rest/v1/institutions',
            headers=HEADERS_R,
            params={
                'select': 'id,cert_number,name,source,credit_card_loans,credit_card_charge_offs,total_assets,roa',
                'credit_card_loans': 'not.is.null',
                'credit_card_loans': 'gt.0',
                'source': 'eq.fdic',
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

def upsert_capabilities(rows_to_upsert):
    if DRY_RUN or not rows_to_upsert:
        return
    resp = requests.post(
        f'{SUPABASE_URL}/rest/v1/bank_capabilities',
        headers=HEADERS_W,
        json=rows_to_upsert,
        timeout=120,
    )
    if resp.status_code not in (200, 201):
        print(f'  WARN upsert: {resp.status_code} {resp.text[:200]}')

def tier_label(loans: int) -> str:
    if loans >= 5_000_000_000:  return 'mega (>$5B)'
    if loans >= 1_000_000_000:  return 'large ($1-5B)'
    if loans >= 500_000_000:    return 'mid ($500M-1B)'
    if loans >= 100_000_000:    return 'community ($100-500M)'
    if loans >= 10_000_000:     return 'small ($10-100M)'
    return 'micro (<$10M)'

def main():
    if not DRY_RUN:
        check_write_access()

    print(f'\n{"="*60}')
    print('  AGENT: agent_brim_cards')
    print(f'  Mode: {"DRY RUN" if DRY_RUN else "LIVE WRITE"}')
    print(f'  Run:  {datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")}')
    print(f'{"="*60}\n')

    institutions = fetch_card_institutions()
    print(f'Found {len(institutions):,} FDIC institutions with credit_card_loans > 0\n')

    if not institutions:
        print('Nothing to do.')
        return

    # Build upsert records
    to_upsert = []
    tier_counts = {}
    for inst in institutions:
        loans = inst['credit_card_loans']
        tier = tier_label(loans)
        tier_counts[tier] = tier_counts.get(tier, 0) + 1

        rec = {
            'cert_number': inst['cert_number'],
            'issues_credit_cards': True,
            'card_portfolio_size': loans,
            'card_portfolio_source': 'fdic_call_report',
            'data_source': 'fdic',
            'confidence': 'high',
            'verified_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat(),
        }
        # Infer charge-off data
        if inst.get('credit_card_charge_offs') and inst['credit_card_charge_offs'] > 0:
            rec['notes'] = f'Charge-offs: ${inst["credit_card_charge_offs"]:,}'

        to_upsert.append(rec)

    if DRY_RUN:
        print('Sample records (first 5):')
        for r in to_upsert[:5]:
            print(f'  cert={r["cert_number"]:6d}  portfolio=${r["card_portfolio_size"]:>14,}  tier={tier_label(r["card_portfolio_size"])}')

    # Tier distribution
    print('\nCard portfolio tier distribution:')
    for tier, count in sorted(tier_counts.items(), key=lambda x: -x[1]):
        print(f'  {tier:<30} {count:>5,}')

    # Upsert in batches
    batch_size = 500
    inserted = 0
    for i in range(0, len(to_upsert), batch_size):
        batch = to_upsert[i:i+batch_size]
        upsert_capabilities(batch)
        inserted += len(batch)
        if not DRY_RUN and inserted % 500 == 0:
            print(f'  ... {inserted:,} upserted')

    print(f'\n{"="*60}')
    print('  SUMMARY')
    print(f'  Records {"to upsert" if DRY_RUN else "upserted"}: {len(to_upsert):,}')
    print(f'  Table: bank_capabilities (cert_number key)')
    print(f'  Mode: {"DRY RUN — no changes written" if DRY_RUN else "LIVE — database updated"}')
    print(f'{"="*60}\n')

if __name__ == '__main__':
    main()
