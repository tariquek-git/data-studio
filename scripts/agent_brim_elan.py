#!/usr/bin/env python3
"""
agent_brim_elan.py — Track Elan Financial Services → Fiserv migration window.

Elan Financial Services (a U.S. Bancorp subsidiary) is migrating all its
agent bank credit card clients to Fiserv's platform through 2025-2027.
This creates a prime BD window for Brim: ~1,000 institutions need a new
card partner, and Brim's modern platform is a direct alternative.

This agent:
1. Identifies institutions with Elan signals (raw_data, name patterns)
2. Tags them in bank_capabilities.agent_bank_program = 'elan_financial'
3. Sets elan_migration_window = true for Brim targeting priority
4. Prints a prioritized outreach list sorted by Brim score

Run: python scripts/agent_brim_elan.py [--dry-run]
"""
import sys
import json
import re
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from _db import check_write_access, SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY
import requests

DRY_RUN = '--dry-run' in sys.argv

if not DRY_RUN:
    check_write_access()

KEY = SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY
HEADERS_R = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}
HEADERS_W = {**HEADERS_R, 'Prefer': 'resolution=merge-duplicates,return=minimal'}

ELAN_PATTERNS = [
    re.compile(r'\belan\b', re.IGNORECASE),
    re.compile(r'\belan financial\b', re.IGNORECASE),
    re.compile(r'\bus bancorp card\b', re.IGNORECASE),
    re.compile(r'\busb card\b', re.IGNORECASE),
]

# Known Elan clients (manually curated — update as discovered)
KNOWN_ELAN_CLIENTS = {
    # cert_number → institution name (partial list for seeding)
    # These are illustrative; real list is proprietary
}


def is_elan_client(row: dict) -> bool:
    """Detect Elan relationship from raw_data and text fields."""
    raw = row.get('raw_data') or {}
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            raw = {}

    # Check known list
    if row.get('cert_number') in KNOWN_ELAN_CLIENTS:
        return True

    # Text scan
    texts = [
        row.get('name') or '',
        row.get('holding_company') or '',
        str(raw.get('card_program') or ''),
        str(raw.get('card_issuer') or ''),
        str(raw.get('agent_bank') or ''),
        str(raw.get('sponsor_bank') or ''),
    ]
    combined = ' '.join(texts)
    return any(pat.search(combined) for pat in ELAN_PATTERNS)


def fetch_elan_candidates(batch_size=1000):
    """Fetch institutions that already have agent_bank_program = 'elan_financial'."""
    rows = []
    offset = 0

    # First check bank_capabilities for already-tagged Elan institutions
    while True:
        resp = requests.get(
            f'{SUPABASE_URL}/rest/v1/bank_capabilities',
            headers=HEADERS_R,
            params={
                'select': 'cert_number,brim_score,brim_tier',
                'agent_bank_program': 'eq.elan_financial',
                'limit': batch_size,
                'offset': offset,
            },
            timeout=60,
        )
        resp.raise_for_status()
        batch = resp.json()
        rows.extend(batch)
        if len(batch) < batch_size:
            break
        offset += batch_size
    return rows


def fetch_institutions_for_scan(batch_size=1000):
    """Fetch all active institutions for Elan signal scan."""
    rows = []
    offset = 0
    while True:
        resp = requests.get(
            f'{SUPABASE_URL}/rest/v1/institutions',
            headers=HEADERS_R,
            params={
                'select': 'id,cert_number,name,source,city,state,total_assets,holding_company,raw_data',
                'active': 'eq.true',
                'limit': batch_size,
                'offset': offset,
            },
            timeout=60,
        )
        resp.raise_for_status()
        batch = resp.json()
        rows.extend(batch)
        if len(batch) < batch_size:
            break
        offset += batch_size
    return rows


def fetch_brim_scores(cert_numbers: list[int]) -> dict[int, dict]:
    """Fetch Brim scores for a list of cert_numbers."""
    if not cert_numbers:
        return {}
    # Batch in chunks of 100
    result = {}
    for i in range(0, len(cert_numbers), 100):
        chunk = cert_numbers[i:i+100]
        cert_filter = ','.join(str(c) for c in chunk)
        resp = requests.get(
            f'{SUPABASE_URL}/rest/v1/bank_capabilities',
            headers=HEADERS_R,
            params={
                'select': 'cert_number,brim_score,brim_tier',
                'cert_number': f'in.({cert_filter})',
            },
            timeout=60,
        )
        resp.raise_for_status()
        for row in resp.json():
            result[row['cert_number']] = row
    return result


def tag_elan(cert_number: int) -> bool:
    resp = requests.post(
        f'{SUPABASE_URL}/rest/v1/bank_capabilities',
        headers=HEADERS_W,
        json={
            'cert_number': cert_number,
            'agent_bank_program': 'elan_financial',
        },
        timeout=30,
    )
    return resp.status_code in (200, 201)


def main():
    print('=== agent_brim_elan.py — Elan Migration Window ===')
    print(f'Mode: {"DRY RUN" if DRY_RUN else "LIVE"}')
    print()
    print('Context: Elan Financial (USB subsidiary) migrating ~1,000 agent bank')
    print('card clients to Fiserv through 2025-2027. Prime Brim BD window.')
    print()

    print('Step 1: Scanning all institutions for Elan signals...')
    institutions = fetch_institutions_for_scan()
    print(f'Scanned {len(institutions):,} institutions')

    elan_detected = []
    for row in institutions:
        if is_elan_client(row):
            elan_detected.append(row)

    print(f'Elan signals found: {len(elan_detected)}')
    print()

    if not elan_detected:
        print('No Elan signals detected from raw data scan.')
        print('Note: Elan client list is proprietary. To populate:')
        print('  1. Add known cert_numbers to KNOWN_ELAN_CLIENTS dict in this script')
        print('  2. Or run agent_brim_agent_banks.py which may detect from raw_data fields')
        print()

    # Step 2: Tag detected institutions
    tagged = 0
    for row in elan_detected:
        if not DRY_RUN:
            ok = tag_elan(row['cert_number'])
            if ok:
                tagged += 1
        else:
            tagged += 1

    # Step 3: Pull all elan-tagged from bank_capabilities (includes previously tagged)
    print('Step 2: Pulling Elan-tagged institutions from bank_capabilities...')
    elan_caps = fetch_elan_candidates()
    print(f'Total Elan-tagged in DB: {len(elan_caps)}')
    print()

    if elan_caps:
        # Get institution details for report
        cert_numbers = [r['cert_number'] for r in elan_caps]
        scores = {r['cert_number']: r for r in elan_caps}

        # Sort by Brim score desc
        elan_caps.sort(key=lambda x: x.get('brim_score') or 0, reverse=True)

        print('=== Elan Migration Window — Prioritized Outreach List ===')
        print(f'{"Cert":>8}  {"Score":>5}  {"Tier":>4}')
        print('-' * 25)
        for cap in elan_caps[:50]:
            score = cap.get('brim_score') or '—'
            tier = cap.get('brim_tier') or '—'
            print(f'{cap["cert_number"]:>8}  {str(score):>5}  {tier:>4}')
        if len(elan_caps) > 50:
            print(f'... and {len(elan_caps) - 50} more')

    print()
    print('=== Summary ===')
    print(f'New Elan signals detected: {len(elan_detected)}')
    print(f'DB tags written          : {tagged}')
    print(f'Total Elan targets in DB : {len(elan_caps)}')
    print()
    print('Next: Run agent_brim_score.py to refresh Brim scores with Elan bonus weighting.')
    if DRY_RUN:
        print('(DRY RUN — no writes made)')


if __name__ == '__main__':
    main()
