#!/usr/bin/env python3
"""
agent_brim_score.py — Calculate 0-100 Brim fit score for each institution.
Scores based on: card portfolio size, asset size, roa, charter type, geography,
agent bank program indicators, and data completeness.

Writes to bank_capabilities.brim_score, brim_tier, brim_score_factors.
Only scores institutions with enough data to be meaningful.

Run: python scripts/agent_brim_score.py [--dry-run] [--limit N]
"""
import sys
import json
import uuid
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from _db import check_write_access, SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY
import requests
from datetime import datetime

DRY_RUN = '--dry-run' in sys.argv
LIMIT = None
for i, arg in enumerate(sys.argv):
    if arg == '--limit' and i + 1 < len(sys.argv):
        LIMIT = int(sys.argv[i+1])

KEY = SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY
HEADERS_R = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}
HEADERS_W = {**HEADERS_R, 'Prefer': 'resolution=merge-duplicates,return=minimal'}

# Institutions NOT to target (existing Brim clients per CLAUDE.md)
EXCLUDE_NAMES = {
    'MANULIFE', 'AFFINITY CREDIT UNION', 'LAURENTIAN BANK',
    'CANADIAN WESTERN BANK', 'CWB', 'ZOLVE', 'CONTINENTAL',
    'AIR FRANCE', 'KLM', 'PAYFACTO',
}

def fetch_institutions():
    rows = []
    limit = 1000
    offset = 0
    while True:
        resp = requests.get(
            f'{SUPABASE_URL}/rest/v1/institutions',
            headers=HEADERS_R,
            params={
                'select': 'id,cert_number,name,source,charter_type,total_assets,roa,net_income,num_branches,state,city,holding_company,credit_card_loans,data_confidence',
                'active': 'eq.true',
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

def fetch_existing_capabilities():
    rows = []
    limit = 1000
    offset = 0
    while True:
        resp = requests.get(
            f'{SUPABASE_URL}/rest/v1/bank_capabilities',
            headers=HEADERS_R,
            params={
                'select': 'cert_number,issues_credit_cards,card_portfolio_size,agent_bank_program,core_processor',
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
    return {r['cert_number']: r for r in rows}

def score_institution(inst, caps):
    """
    Score 0-100. Higher = better Brim fit.
    Scoring dimensions:
      1. Card portfolio (0-30): Is there an active card program? What size?
      2. Asset size (0-20): Sweet spot $500M-$20B
      3. Financial health (0-15): Positive ROA
      4. Charter type (0-10): Credit union or community bank preferred
      5. Geography (0-10): US preferred, Canada possible
      6. Agent bank signal (0-10): Known Elan/PSCU relationship = migration opportunity
      7. Data quality (0-5): High confidence data
    """
    score = 0
    factors = {}
    cert = inst['cert_number']
    cap = caps.get(cert) or {}

    # 1. Card portfolio (0-30)
    cc_loans = inst.get('credit_card_loans') or cap.get('card_portfolio_size') or 0
    has_cards = cap.get('issues_credit_cards') or (cc_loans > 0)
    if has_cards:
        score += 10
        factors['has_card_program'] = 10
        if cc_loans > 0:
            if cc_loans >= 1_000_000_000:       card_pts = 20
            elif cc_loans >= 500_000_000:        card_pts = 18
            elif cc_loans >= 100_000_000:        card_pts = 15
            elif cc_loans >= 50_000_000:         card_pts = 12
            elif cc_loans >= 10_000_000:         card_pts = 8
            elif cc_loans >= 1_000_000:          card_pts = 5
            else:                                 card_pts = 2
            score += card_pts
            factors['card_portfolio_size'] = card_pts
    else:
        score += 0
        factors['no_card_program'] = 0

    # 2. Asset size (0-20): sweet spot $500M-$20B
    ta = inst.get('total_assets') or 0
    if 500_000_000 <= ta <= 20_000_000_000:     asset_pts = 20
    elif 200_000_000 <= ta < 500_000_000:        asset_pts = 15
    elif 20_000_000_000 < ta <= 100_000_000_000: asset_pts = 12  # large, can still work
    elif 100_000_000 <= ta < 200_000_000:        asset_pts = 8
    elif ta > 100_000_000_000:                   asset_pts = 5   # mega banks
    else:                                         asset_pts = 3
    score += asset_pts
    factors['asset_size'] = asset_pts

    # 3. Financial health (0-15)
    roa = inst.get('roa')
    if roa is not None:
        if roa >= 1.0:          health_pts = 15
        elif roa >= 0.5:        health_pts = 12
        elif roa >= 0.0:        health_pts = 8
        elif roa >= -0.5:       health_pts = 4
        else:                   health_pts = 0
        score += health_pts
        factors['financial_health'] = health_pts

    # 4. Charter type (0-10)
    charter = (inst.get('charter_type') or '').lower()
    if 'credit_union' in charter or 'credit union' in charter:
        score += 10
        factors['charter_credit_union'] = 10
    elif 'commercial' in charter or 'savings' in charter:
        score += 7
        factors['charter_bank'] = 7
    else:
        score += 4
        factors['charter_other'] = 4

    # 5. Geography (0-10)
    src = inst.get('source', '')
    if src in ('fdic', 'ncua'):
        score += 10
        factors['geography_us'] = 10
    elif src in ('bcfsa', 'fsra', 'cudgc', 'dgcm', 'cudgc_sk', 'nscudic', 'osfi'):
        score += 7
        factors['geography_canada'] = 7
    else:
        score += 3
        factors['geography_other'] = 3

    # 6. Agent bank migration signal (0-10)
    agent_program = (cap.get('agent_bank_program') or '').lower()
    core = (cap.get('core_processor') or '').lower()
    if 'elan' in agent_program:
        score += 10
        factors['elan_migration_opportunity'] = 10
    elif 'pscu' in agent_program or 'co-op' in agent_program:
        score += 7
        factors['agent_bank_program'] = 7
    elif 'fiserv' in core or 'fis' in core:
        score += 5
        factors['fiserv_core'] = 5

    # 7. Data quality (0-5)
    confidence = inst.get('data_confidence') or ''
    if confidence == 'high':
        score += 5
        factors['data_quality_high'] = 5
    elif confidence == 'medium':
        score += 3
        factors['data_quality_medium'] = 3
    else:
        score += 1
        factors['data_quality_low'] = 1

    score = min(100, score)

    # Tier
    if score >= 80:   tier = 'A'
    elif score >= 65: tier = 'B'
    elif score >= 50: tier = 'C'
    elif score >= 35: tier = 'D'
    else:             tier = 'F'

    return score, tier, factors

def is_excluded(name: str) -> bool:
    n = name.upper()
    return any(ex in n for ex in EXCLUDE_NAMES)

def main():
    if not DRY_RUN:
        check_write_access()

    print(f'\n{"="*60}')
    print('  AGENT: agent_brim_score — Brim Fit Scoring')
    print(f'  Mode: {"DRY RUN" if DRY_RUN else "LIVE WRITE"}')
    if LIMIT:
        print(f'  Limit: {LIMIT}')
    print(f'  Run:  {datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")}')
    print(f'{"="*60}\n')

    print('Loading institutions and capabilities...')
    institutions = fetch_institutions()
    capabilities = fetch_existing_capabilities()
    print(f'  {len(institutions):,} active institutions with assets')
    print(f'  {len(capabilities):,} existing capability records\n')

    if LIMIT:
        institutions = institutions[:LIMIT]

    scored = []
    excluded = 0
    tier_dist = {'A': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0}

    for inst in institutions:
        if is_excluded(inst['name']):
            excluded += 1
            continue
        score, tier, factors = score_institution(inst, capabilities)
        scored.append((score, tier, factors, inst))
        tier_dist[tier] = tier_dist.get(tier, 0) + 1

    scored.sort(key=lambda x: -x[0])

    # Print top 20
    print(f'TOP 20 BRIM FIT INSTITUTIONS:')
    print(f'  {"Score":>5}  {"Tier"}  {"Source":<8}  {"Name":<45}  {"Assets":>14}')
    print(f'  {"-"*5}  {"-"*4}  {"-"*8}  {"-"*45}  {"-"*14}')
    for score, tier, factors, inst in scored[:20]:
        ta = inst.get('total_assets') or 0
        print(f'  {score:>5}  {tier:>4}  {inst["source"]:<8}  {inst["name"][:45]:<45}  ${ta:>13,}')

    print(f'\nTIER DISTRIBUTION:')
    for tier in ('A', 'B', 'C', 'D', 'F'):
        count = tier_dist.get(tier, 0)
        bar = '█' * (count // 50)
        print(f'  Tier {tier}: {count:>5,}  {bar}')

    # Write to DB
    if not DRY_RUN:
        print('\nWriting scores to bank_capabilities...')
        to_upsert = []
        for score, tier, factors, inst in scored:
            to_upsert.append({
                'cert_number': inst['cert_number'],
                'brim_score': score,
                'brim_tier': tier,
                'brim_score_factors': factors,
                'updated_at': datetime.utcnow().isoformat(),
            })
        for i in range(0, len(to_upsert), 500):
            batch = to_upsert[i:i+500]
            resp = requests.post(
                f'{SUPABASE_URL}/rest/v1/bank_capabilities',
                headers={**HEADERS_W, 'Prefer': 'resolution=merge-duplicates,return=minimal'},
                json=batch,
                timeout=120,
            )
            if resp.status_code not in (200, 201):
                print(f'  WARN: {resp.status_code} {resp.text[:100]}')
        print(f'  Written {len(to_upsert):,} scores')

    print(f'\n{"="*60}')
    print(f'  Scored:   {len(scored):,}')
    print(f'  Excluded: {excluded} (existing Brim clients)')
    print(f'  Tier A:   {tier_dist["A"]:,}  (score 80-100)')
    print(f'  Tier B:   {tier_dist["B"]:,}  (score 65-79)')
    print(f'  Tier C:   {tier_dist["C"]:,}  (score 50-64)')
    print(f'  Mode: {"DRY RUN" if DRY_RUN else "LIVE — database updated"}')
    print(f'{"="*60}\n')

if __name__ == '__main__':
    main()
