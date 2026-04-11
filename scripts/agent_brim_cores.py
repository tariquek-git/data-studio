#!/usr/bin/env python3
"""
agent_brim_cores.py — Detect core banking processor from raw_data and known signals.

Scans institution raw_data, name, and holding_company for core processor indicators.
Updates bank_capabilities.core_processor.

Core processors covered:
  Fiserv, FIS, Jack Henry (Symitar, Banno, SilverLake, etc.),
  Temenos, NCR Voyix, Finastra, Q2, Corelation, D+H, CSI, DNA

Run: python scripts/agent_brim_cores.py [--dry-run] [--limit N]
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

# Core processor patterns (ordered by specificity to avoid mis-matches)
CORE_PATTERNS: list[tuple[str, str]] = [
    # Jack Henry family (most specific first)
    (r'\bsymitar\b', 'jack_henry'),           # CU-focused JH product
    (r'\bbanno\b', 'jack_henry'),             # Digital banking layer
    (r'\bprofitstar\b', 'jack_henry'),
    (r'\bsilverlake\b', 'jack_henry'),
    (r'\bjack henry\b', 'jack_henry'),
    (r'\bjackhenry\b', 'jack_henry'),
    # Fiserv family
    (r'\bcoral\b', 'fiserv'),                 # Fiserv core
    (r'\bpremier\b', 'fiserv'),               # Fiserv Premier
    (r'\bportico\b', 'fiserv'),               # Fiserv Portico (CUs)
    (r'\bsigma\b', 'fiserv'),
    (r'\bfiserv\b', 'fiserv'),
    (r'\bopen solutions\b', 'fiserv'),
    (r'\bunifi\b', 'fiserv'),
    # FIS family
    (r'\bmiser\b', 'fis'),                    # FIS MISER (CUs)
    (r'\bprofit stars\b', 'fis'),
    (r'\bmetavante\b', 'fis'),
    (r'\bseifried\b', 'fis'),
    (r'\bbancware\b', 'fis'),
    (r'\bfis core\b', 'fis'),
    (r'\bfidelity national information\b', 'fis'),
    # Temenos
    (r'\btemenos\b', 'temenos'),
    (r'\bt24\b', 'temenos'),
    # NCR Voyix / D3
    (r'\bncr voyix\b', 'ncr_voyix'),
    (r'\bd3 banking\b', 'ncr_voyix'),
    (r'\bncr\b', 'ncr_voyix'),
    # Finastra
    (r'\bfinastra\b', 'finastra'),
    (r'\bmeridian link\b', 'finastra'),
    (r'\btransact\b', 'finastra'),
    (r'\bphoenix\b', 'finastra'),
    # Q2
    (r'\bq2 banking\b', 'q2'),
    (r'\bq2 holdings\b', 'q2'),
    # Corelation (CU-focused)
    (r'\bcorelation\b', 'corelation'),
    (r'\bkeystone\b', 'corelation'),
    # CSI (Community Bankers)
    (r'\bcsi nucleos\b', 'csi'),
    (r'\bnucleos\b', 'csi'),
    # DNA (Fiserv)
    (r'\bdna\b', 'dna'),
    # EPL (Canadian)
    (r'\bepl\b', 'epl'),
    (r'\bdiamond\b', 'epl'),
]

# FDIC raw_data processor fields
FDIC_CORE_FIELDS = ['COREPROC', 'COREPROCESSOR', 'CORE_SYSTEM', 'CORESYSTEM']
# NCUA raw_data fields
NCUA_CORE_FIELDS = ['core_processor', 'core_system', 'data_processor', 'software_vendor']


def compile_patterns():
    return [(re.compile(pat, re.IGNORECASE), label) for pat, label in CORE_PATTERNS]


def detect_core(row: dict, patterns) -> str | None:
    """Return detected core_processor label, or None."""
    raw = row.get('raw_data') or {}
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            raw = {}

    # Direct field lookups
    for field in FDIC_CORE_FIELDS + NCUA_CORE_FIELDS:
        val = str(raw.get(field) or '').strip()
        if val and val not in ('0', '', 'null', 'None'):
            for pat, label in patterns:
                if pat.search(val):
                    return label

    # Scan text fields
    texts = [
        str(raw.get('core_processor') or ''),
        str(raw.get('system_vendor') or ''),
        str(raw.get('technology_vendor') or ''),
    ]
    combined = ' '.join(texts)
    if combined.strip():
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
                'select': 'id,cert_number,name,source,raw_data',
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


def upsert_core(cert_number: int, core: str) -> bool:
    resp = requests.post(
        f'{SUPABASE_URL}/rest/v1/bank_capabilities',
        headers=HEADERS_W,
        json={'cert_number': cert_number, 'core_processor': core},
        timeout=30,
    )
    return resp.status_code in (200, 201)


def main():
    print('=== agent_brim_cores.py ===')
    print(f'Mode: {"DRY RUN" if DRY_RUN else "LIVE"}')
    print()

    patterns = compile_patterns()

    print('Fetching institutions...')
    rows = fetch_institutions()
    print(f'Loaded {len(rows):,} institutions')
    print()

    detected: dict[str, int] = {}
    updates = 0

    for row in rows:
        core = detect_core(row, patterns)
        if core:
            detected[core] = detected.get(core, 0) + 1
            if not DRY_RUN:
                ok = upsert_core(row['cert_number'], core)
                if ok:
                    updates += 1
            else:
                updates += 1

    print('=== Core Processor Distribution ===')
    for core, count in sorted(detected.items(), key=lambda x: -x[1]):
        print(f'  {core:<20} {count:>5}')
    print()
    print(f'Total detected  : {sum(detected.values()):,}')
    print(f'DB updates      : {updates:,}')
    if DRY_RUN:
        print('(DRY RUN — no writes made)')


if __name__ == '__main__':
    main()
