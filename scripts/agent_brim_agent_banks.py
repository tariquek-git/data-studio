#!/usr/bin/env python3
"""
agent_brim_agent_banks.py — Detect agent bank program signals from raw_data.

Scans institution raw_data JSONB, name, and holding_company fields for signals
indicating an agent bank relationship (Elan, PSCU, Co-Op, FiServ Debit, etc.)
Updates bank_capabilities.agent_bank_program.

Signal sources:
  - FDIC raw_data fields: AGENTPROC, AGENTBANK fields (if present)
  - NCUA raw_data: agent_bank, sponsor_bank fields
  - Name/holding_company keywords: Elan, PSCU, Co-Op, Vantiv, FIS, Visa, NYCE

Run: python scripts/agent_brim_agent_banks.py [--dry-run] [--limit N]
"""
import sys
import json
import re
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from _db import check_write_access, SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY
import requests

DRY_RUN = '--dry-run' in sys.argv
LIMIT = None
for i, arg in enumerate(sys.argv):
    if arg == '--limit' and i + 1 < len(sys.argv):
        LIMIT = int(sys.argv[i + 1])

if not DRY_RUN:
    check_write_access()

KEY = SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY
HEADERS_R = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}
HEADERS_W = {**HEADERS_R, 'Prefer': 'resolution=merge-duplicates,return=minimal'}

# Agent bank detection patterns (ordered by specificity)
AGENT_BANK_SIGNALS: list[tuple[str, str]] = [
    # Elan Financial — migrating to Fiserv, prime Brim target window
    (r'\belan\b', 'elan_financial'),
    (r'\belan financial\b', 'elan_financial'),
    # PSCU — credit union card processor
    (r'\bpscu\b', 'pscu'),
    # Co-Op Financial — credit union network
    (r'\bco-op\b', 'coop_financial'),
    (r'\bcoop financial\b', 'coop_financial'),
    (r'\bco_op financial\b', 'coop_financial'),
    # CUNA Mutual
    (r'\bcuna mutual\b', 'cuna_mutual'),
    # Visa DPS
    (r'\bvisa dps\b', 'visa_dps'),
    (r'\bvisa debit\b', 'visa_dps'),
    # FIS (card processing)
    (r'\bfis card\b', 'fis'),
    (r'\bfis payment\b', 'fis'),
    # Vantiv / Worldpay
    (r'\bvantiv\b', 'vantiv_worldpay'),
    (r'\bworldpay\b', 'vantiv_worldpay'),
    # NYCE / Conduent
    (r'\bnyce\b', 'nyce'),
    # Star Network
    (r'\bstar network\b', 'star_network'),
    # SHAZAM
    (r'\bshazam\b', 'shazam'),
    # Generic agent bank
    (r'\bagent bank\b', 'agent_bank'),
]

# FDIC raw_data field keys that indicate agent bank
FDIC_AGENT_FIELDS = ['AGENTPROC', 'AGNTPROC', 'AGENTBANK', 'AGNTBANK']

# NCUA raw_data field keys
NCUA_AGENT_FIELDS = ['agent_bank', 'sponsor_bank', 'card_processor', 'card_network']


def compile_patterns():
    return [(re.compile(pat, re.IGNORECASE), label) for pat, label in AGENT_BANK_SIGNALS]


def detect_agent_bank(row: dict, patterns) -> str | None:
    """Return detected agent_bank_program label, or None."""
    raw = row.get('raw_data') or {}
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            raw = {}

    # Check FDIC-specific fields
    for field in FDIC_AGENT_FIELDS:
        val = str(raw.get(field) or '').strip()
        if val and val not in ('0', 'N', 'No', 'null', ''):
            return 'fdic_agent_bank'

    # Check NCUA-specific fields
    for field in NCUA_AGENT_FIELDS:
        val = str(raw.get(field) or '').strip().lower()
        for pat, label in patterns:
            if pat.search(val):
                return label

    # Text scan across name, holding_company, and key raw_data string values
    texts = [
        row.get('name') or '',
        row.get('holding_company') or '',
        str(raw.get('card_program') or ''),
        str(raw.get('card_issuer') or ''),
        str(raw.get('processor') or ''),
    ]
    combined = ' '.join(texts)
    for pat, label in patterns:
        if pat.search(combined):
            return label

    return None


def fetch_institutions(batch_size=1000):
    rows = []
    offset = 0
    while True:
        resp = requests.get(
            f'{SUPABASE_URL}/rest/v1/institutions',
            headers=HEADERS_R,
            params={
                'select': 'id,cert_number,name,source,holding_company,raw_data',
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
        if LIMIT and len(rows) >= LIMIT:
            rows = rows[:LIMIT]
            break
    return rows


def upsert_bank_capability(cert_number: int, agent_bank: str) -> bool:
    resp = requests.post(
        f'{SUPABASE_URL}/rest/v1/bank_capabilities',
        headers=HEADERS_W,
        json={'cert_number': cert_number, 'agent_bank_program': agent_bank},
        timeout=30,
    )
    return resp.status_code in (200, 201)


def main():
    print('=== agent_brim_agent_banks.py ===')
    print(f'Mode: {"DRY RUN" if DRY_RUN else "LIVE"}')
    print()

    patterns = compile_patterns()

    print('Fetching institutions...')
    rows = fetch_institutions()
    print(f'Loaded {len(rows):,} institutions')
    print()

    detected: dict[str, list[str]] = {}  # label → list of names
    updates = 0

    for row in rows:
        label = detect_agent_bank(row, patterns)
        if label:
            detected.setdefault(label, []).append(row['name'])
            if not DRY_RUN:
                ok = upsert_bank_capability(row['cert_number'], label)
                if ok:
                    updates += 1
            else:
                updates += 1

    print('=== Detection Results ===')
    total_detected = sum(len(v) for v in detected.values())
    for label, names in sorted(detected.items(), key=lambda x: -len(x[1])):
        print(f'  {label:<25} {len(names):>4} institutions')
        for name in names[:3]:
            print(f'    - {name}')
        if len(names) > 3:
            print(f'    ... and {len(names)-3} more')
    print()
    print(f'Total detected  : {total_detected:,}')
    print(f'DB updates      : {updates:,}')
    if DRY_RUN:
        print('(DRY RUN — no writes made)')


if __name__ == '__main__':
    main()
