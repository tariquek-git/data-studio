#!/usr/bin/env python3
"""
agent_relationships.py — Populate entity_relationships from:
  1. holding_company field (~3,672 FDIC institutions) → subsidiary_of
  2. Sibling detection for institutions sharing a holding_company_id → sibling_of
  3. charter_events table (mergers skipped — no counterparty cert in FDIC data)
  4. Known cross-border links (US subsidiaries of Canadian/foreign parents)
  5. Regulator links (every institution → regulated_by)
  6. BaaS/sponsor bank relationships (bank_capabilities.baas_platform = true)

Writes to entity_relationships table. Idempotent via upsert logic.

Run: python scripts/agent_relationships.py [--dry-run]
"""
import sys
import uuid
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from _db import check_write_access, SUPABASE_URL, get_headers
import requests
from datetime import datetime
from itertools import combinations

DRY_RUN = '--dry-run' in sys.argv
HEADERS_R = get_headers()
HEADERS_W = {**HEADERS_R, 'Prefer': 'return=minimal'}

# ── Regulator seed data ────────────────────────────────────────────────────────
# These are upserted into ecosystem_entities before regulated_by links are built.
REGULATOR_ENTITIES = [
    {'slug': 'fdic',        'name': 'FDIC',           'entity_type': 'regulator', 'country': 'US'},
    {'slug': 'occ',         'name': 'OCC',            'entity_type': 'regulator', 'country': 'US'},
    {'slug': 'federal-reserve', 'name': 'Federal Reserve', 'entity_type': 'regulator', 'country': 'US'},
    {'slug': 'ncua',        'name': 'NCUA',           'entity_type': 'regulator', 'country': 'US'},
    {'slug': 'fincen',      'name': 'FinCEN',         'entity_type': 'regulator', 'country': 'US'},
    {'slug': 'osfi',        'name': 'OSFI',           'entity_type': 'regulator', 'country': 'CA'},
    {'slug': 'bcfsa',       'name': 'BCFSA',          'entity_type': 'regulator', 'country': 'CA'},
    {'slug': 'fsra',        'name': 'FSRA',           'entity_type': 'regulator', 'country': 'CA'},
    {'slug': 'bank-of-canada', 'name': 'Bank of Canada', 'entity_type': 'regulator', 'country': 'CA'},
    {'slug': 'fintrac',     'name': 'FINTRAC',        'entity_type': 'regulator', 'country': 'CA'},
    {'slug': 'ciro',        'name': 'CIRO',           'entity_type': 'regulator', 'country': 'CA'},
]

# Maps the regulator string stored on institutions.regulator → ecosystem_entities.slug
REGULATOR_SLUG_MAP = {
    'FDIC':             'fdic',
    'OCC':              'occ',
    'FRB':              'federal-reserve',
    'FEDERAL RESERVE':  'federal-reserve',
    'FED':              'federal-reserve',
    'NCUA':             'ncua',
    'FINCEN':           'fincen',
    'OSFI':             'osfi',
    'BCFSA':            'bcfsa',
    'FSRA':             'fsra',
    'BANK OF CANADA':   'bank-of-canada',
    'FINTRAC':          'fintrac',
    'CIRO':             'ciro',
}

# ── Known cross-border US-subsidiary → foreign-parent relationships ────────────
# Each tuple: (US name fragment, foreign/parent name fragment, rel_type, label)
CROSS_BORDER_PAIRS = [
    ('TD BANK',              'TORONTO-DOMINION',      'subsidiary_of', 'TD Bank NA → Toronto-Dominion Bank'),
    ('BMO BANK',             'BANK OF MONTREAL',      'subsidiary_of', 'BMO Bank NA → Bank of Montreal'),
    ('CIBC BANK USA',        'CANADIAN IMPERIAL',     'subsidiary_of', 'CIBC Bank USA → CIBC'),
    ('CITY NATIONAL BANK',   'ROYAL BANK OF CANADA',  'subsidiary_of', 'City National → RBC'),
    ('HSBC BANK USA',        'HSBC',                  'subsidiary_of', 'HSBC Bank USA → HSBC Holdings'),
    # Scotiabank US presence
    ('SCOTIABANK',           'BANK OF NOVA SCOTIA',   'subsidiary_of', 'Scotiabank US → Bank of Nova Scotia'),
    ('BANK OF NOVA SCOTIA',  'BANK OF NOVA SCOTIA',   'subsidiary_of', 'Bank of Nova Scotia US → BNS'),
    # National Bank of Canada
    ('NATIONAL BANK FINANCIAL', 'NATIONAL BANK OF CANADA', 'subsidiary_of',
     'National Bank Financial US → National Bank of Canada'),
    # Desjardins US presence
    ('DESJARDINS',           'DESJARDINS',            'subsidiary_of', 'Desjardins US → Desjardins Group'),
    # RBC beyond City National
    ('RBC BANK',             'ROYAL BANK OF CANADA',  'subsidiary_of', 'RBC Bank USA → Royal Bank of Canada'),
    # Barclays
    ('BARCLAYS BANK DELAWARE', 'BARCLAYS',            'subsidiary_of', 'Barclays Bank Delaware → Barclays PLC'),
    # Santander
    ('SANTANDER BANK',       'BANCO SANTANDER',       'subsidiary_of', 'Santander Bank NA → Banco Santander'),
    # MUFG
    ('MUFG UNION BANK',      'MITSUBISHI UFJ',        'subsidiary_of', 'MUFG Union Bank → Mitsubishi UFJ'),
    ('UNION BANK',           'MITSUBISHI UFJ',        'subsidiary_of', 'Union Bank → Mitsubishi UFJ'),
    # Deutsche Bank
    ('DEUTSCHE BANK TRUST',  'DEUTSCHE BANK',         'subsidiary_of', 'Deutsche Bank Trust → Deutsche Bank AG'),
    # BNP Paribas
    ('BANK OF THE WEST',     'BNP PARIBAS',           'subsidiary_of', 'Bank of the West → BNP Paribas'),
    # Rabobank
    ('RABOBANK',             'RABOBANK',              'subsidiary_of', 'Rabobank NA → Rabobank Nederland'),
]


def fetch_all(endpoint, params):
    rows = []
    limit = 1000
    offset = 0
    while True:
        resp = requests.get(
            f'{SUPABASE_URL}/rest/v1/{endpoint}',
            headers=HEADERS_R,
            params={**params, 'limit': limit, 'offset': offset},
            timeout=60,
        )
        resp.raise_for_status()
        batch = resp.json()
        rows.extend(batch)
        if len(batch) < limit:
            break
        offset += limit
    return rows


def insert_batch(table, rows, conflict_header='resolution=ignore-duplicates,return=minimal'):
    if DRY_RUN or not rows:
        return
    resp = requests.post(
        f'{SUPABASE_URL}/rest/v1/{table}',
        headers={**HEADERS_W, 'Prefer': conflict_header},
        json=rows,
        timeout=120,
    )
    if resp.status_code not in (200, 201):
        print(f'  WARN insert into {table}: {resp.status_code} {resp.text[:300]}')


def upsert_batch(table, rows, on_conflict):
    """Upsert rows using ON CONFLICT DO UPDATE via PostgREST."""
    if DRY_RUN or not rows:
        return
    resp = requests.post(
        f'{SUPABASE_URL}/rest/v1/{table}',
        headers={
            **HEADERS_W,
            'Prefer': f'resolution=merge-duplicates,return=minimal',
        },
        json=rows,
        timeout=120,
    )
    if resp.status_code not in (200, 201):
        print(f'  WARN upsert into {table}: {resp.status_code} {resp.text[:300]}')


def make_rel(from_table, from_id, to_table, to_id, rel_type, label,
             source_kind='computed', confidence=0.9, notes=None):
    now = datetime.utcnow().isoformat()
    return {
        'id': str(uuid.uuid4()),
        'from_entity_table': from_table,
        'from_entity_id': str(from_id),
        'to_entity_table': to_table,
        'to_entity_id': str(to_id),
        'relationship_type': rel_type,
        'relationship_label': label,
        'active': True,
        'source_kind': source_kind,
        'confidence_score': confidence,
        'notes': notes,
        'created_at': now,
        'updated_at': now,
    }


def inst_rel(from_id, to_id, rel_type, label, source_kind='computed', confidence=0.9, notes=None):
    """Shorthand for institution → institution relationship."""
    return make_rel('institutions', from_id, 'institutions', to_id,
                    rel_type, label, source_kind, confidence, notes)


def main():
    if not DRY_RUN:
        check_write_access()

    print(f'\n{"="*60}')
    print('  AGENT: agent_relationships')
    print(f'  Mode: {"DRY RUN" if DRY_RUN else "LIVE WRITE"}')
    print(f'  Run:  {datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")}')
    print(f'{"="*60}\n')

    # ── Load institutions once ─────────────────────────────────────────────────
    print('Loading institutions...')
    institutions = fetch_all('institutions', {
        'select': 'id,cert_number,name,source,holding_company,holding_company_id,regulator,total_assets'
    })
    print(f'  Loaded {len(institutions):,} institutions')

    by_cert       = {r['cert_number']: r for r in institutions if r.get('cert_number')}
    by_hcid       = {r['holding_company_id']: r for r in institutions if r.get('holding_company_id')}
    by_name_upper = {}
    for r in institutions:
        key = (r['name'] or '').upper().strip()
        by_name_upper[key] = r

    # ── Counters ───────────────────────────────────────────────────────────────
    cnt_subsidiary  = 0
    cnt_sibling     = 0
    cnt_regulated   = 0
    cnt_sponsor     = 0
    cnt_crossborder = 0

    # ══════════════════════════════════════════════════════════════════════════
    # Phase 1: subsidiary_of — holding company relationships
    # ══════════════════════════════════════════════════════════════════════════
    print('\nPhase 1: Holding company → subsidiary_of')
    rels = []
    matched_hc   = 0
    unmatched_hc = 0

    for inst in institutions:
        hc_name = inst.get('holding_company')
        hc_id   = inst.get('holding_company_id')
        if not hc_name:
            continue
        parent = None
        if hc_id and hc_id in by_hcid:
            parent = by_hcid[hc_id]
        elif hc_name.upper().strip() in by_name_upper:
            parent = by_name_upper[hc_name.upper().strip()]
        if parent and parent['id'] != inst['id']:
            rels.append(inst_rel(
                inst['id'], parent['id'],
                'subsidiary_of',
                f'{inst["name"]} is subsidiary of {parent["name"]}',
                source_kind='official', confidence=0.95,
            ))
            matched_hc += 1
        else:
            unmatched_hc += 1

    print(f'  Matched: {matched_hc:,}  Unmatched (parent not in DB): {unmatched_hc:,}')
    for i in range(0, len(rels), 500):
        insert_batch('entity_relationships', rels[i:i+500])
    print(f'  {"[DRY RUN] Would insert" if DRY_RUN else "Inserted"} {len(rels):,} subsidiary_of relationships')
    cnt_subsidiary = len(rels)
    rels = []

    # ══════════════════════════════════════════════════════════════════════════
    # Phase 2: sibling_of — institutions sharing the same holding_company_id
    # Threshold lowered to $0 (all institutions) from the previous $1B floor.
    # ══════════════════════════════════════════════════════════════════════════
    print('\nPhase 2: Sibling detection (shared holding_company_id)')

    # Group by holding_company_id — include ALL sizes (removed $1B threshold)
    hcid_groups: dict[str, list] = {}
    for inst in institutions:
        hcid = inst.get('holding_company_id')
        if not hcid:
            continue
        hcid_groups.setdefault(hcid, []).append(inst)

    sibling_rels = []
    for hcid, members in hcid_groups.items():
        if len(members) < 2:
            continue
        # Create one sibling_of edge per ordered pair (A→B and B→A for undirected graph)
        for a, b in combinations(members, 2):
            label = f'{a["name"]} and {b["name"]} are siblings under same holding company'
            sibling_rels.append(inst_rel(
                a['id'], b['id'], 'sibling_of', label,
                source_kind='official', confidence=0.9,
            ))
            sibling_rels.append(inst_rel(
                b['id'], a['id'], 'sibling_of', label,
                source_kind='official', confidence=0.9,
            ))

    print(f'  Generated {len(sibling_rels):,} sibling_of relationships across {len(hcid_groups):,} holding companies')
    for i in range(0, len(sibling_rels), 500):
        insert_batch('entity_relationships', sibling_rels[i:i+500])
    print(f'  {"[DRY RUN] Would insert" if DRY_RUN else "Inserted"} {len(sibling_rels):,} sibling_of relationships')
    cnt_sibling = len(sibling_rels)

    # ══════════════════════════════════════════════════════════════════════════
    # Phase 3: Charter events → merged_into (skipped — no counterparty cert)
    # ══════════════════════════════════════════════════════════════════════════
    print('\nPhase 3: Charter events → merged_into')
    print('  Skipped: charter_events stores events per institution without counterparty cert.')
    print('  To add merger relationships, use FFIEC NIC data (agent_ffiec.py).')

    # ══════════════════════════════════════════════════════════════════════════
    # Phase 4: regulated_by — seed regulator nodes, then link every institution
    # ══════════════════════════════════════════════════════════════════════════
    print('\nPhase 4: regulated_by relationships')

    # 4a. Seed regulator ecosystem_entities
    now = datetime.utcnow().isoformat()
    regulator_rows = []
    for reg in REGULATOR_ENTITIES:
        regulator_rows.append({
            'id': str(uuid.uuid4()),
            'slug': reg['slug'],
            'name': reg['name'],
            'entity_type': reg['entity_type'],
            'country': reg['country'],
            'active': True,
            'source_kind': 'official',
            'created_at': now,
            'updated_at': now,
        })

    if not DRY_RUN:
        upsert_batch('ecosystem_entities', regulator_rows, on_conflict='slug')
        print(f'  Upserted {len(regulator_rows)} regulator nodes into ecosystem_entities')
    else:
        print(f'  [DRY RUN] Would upsert {len(regulator_rows)} regulator nodes')

    # 4b. Fetch ecosystem_entities so we have their real UUIDs
    eco_entities = fetch_all('ecosystem_entities', {'select': 'id,slug,entity_type'})
    eco_by_slug = {e['slug']: e for e in eco_entities}

    # 4c. Build regulated_by edges
    reg_rels = []
    missing_regulators: set[str] = set()
    for inst in institutions:
        raw = (inst.get('regulator') or '').upper().strip()
        if not raw:
            continue
        slug = REGULATOR_SLUG_MAP.get(raw)
        if not slug:
            missing_regulators.add(raw)
            continue
        eco = eco_by_slug.get(slug)
        if not eco:
            # Node wasn't seeded or fetch happened before upsert committed — skip
            missing_regulators.add(raw)
            continue
        reg_rels.append(make_rel(
            'institutions', inst['id'],
            'ecosystem_entities', eco['id'],
            'regulated_by',
            f'{inst["name"]} regulated by {eco_by_slug[slug]["slug"].upper()}',
            source_kind='official', confidence=0.9,
        ))

    if missing_regulators:
        print(f'  Unmapped regulator strings (add to REGULATOR_SLUG_MAP if needed): {missing_regulators}')

    for i in range(0, len(reg_rels), 500):
        insert_batch('entity_relationships', reg_rels[i:i+500])
    print(f'  {"[DRY RUN] Would insert" if DRY_RUN else "Inserted"} {len(reg_rels):,} regulated_by relationships')
    cnt_regulated = len(reg_rels)

    # ══════════════════════════════════════════════════════════════════════════
    # Phase 5: BaaS/sponsor bank relationships
    # ══════════════════════════════════════════════════════════════════════════
    print('\nPhase 5: BaaS sponsor bank relationships')

    # Fetch bank_capabilities for BaaS platforms
    try:
        baas_caps = fetch_all('bank_capabilities', {
            'select': 'institution_id,baas_platform,baas_partners',
            'baas_platform': 'eq.true',
        })
    except Exception as exc:
        print(f'  WARN: Could not fetch bank_capabilities: {exc}')
        baas_caps = []

    sponsor_rels = []
    for cap in baas_caps:
        sponsor_id = cap.get('institution_id')
        partners   = cap.get('baas_partners') or []
        if not sponsor_id or not partners:
            continue
        sponsor_inst = next((r for r in institutions if r['id'] == sponsor_id), None)
        if not sponsor_inst:
            continue
        for partner_name in partners:
            if not partner_name:
                continue
            key = partner_name.upper().strip()
            partner_inst = by_name_upper.get(key)
            # Fuzzy fallback: substring match
            if not partner_inst:
                partner_inst = next(
                    (r for r in institutions if key in (r['name'] or '').upper()), None
                )
            if partner_inst and partner_inst['id'] != sponsor_id:
                sponsor_rels.append(inst_rel(
                    sponsor_id, partner_inst['id'],
                    'sponsor_bank_for',
                    f'{sponsor_inst["name"]} is sponsor bank for {partner_inst["name"]}',
                    source_kind='curated', confidence=0.7,
                ))

    for i in range(0, len(sponsor_rels), 500):
        insert_batch('entity_relationships', sponsor_rels[i:i+500])
    print(f'  {"[DRY RUN] Would insert" if DRY_RUN else "Inserted"} {len(sponsor_rels):,} sponsor_bank_for relationships')
    cnt_sponsor = len(sponsor_rels)

    # ══════════════════════════════════════════════════════════════════════════
    # Phase 6: Known cross-border parent links (expanded)
    # ══════════════════════════════════════════════════════════════════════════
    print('\nPhase 6: Known cross-border parent links')
    cb_rels = []
    seen_cb_pairs: set[tuple] = set()

    for us_frag, ca_frag, rel_type, label in CROSS_BORDER_PAIRS:
        us_inst = next((r for r in institutions if us_frag in (r['name'] or '').upper()), None)
        ca_inst = next((r for r in institutions if ca_frag in (r['name'] or '').upper()), None)
        if not us_inst or not ca_inst:
            continue
        if us_inst['id'] == ca_inst['id']:
            continue
        pair = (us_inst['id'], ca_inst['id'])
        if pair in seen_cb_pairs:
            continue
        seen_cb_pairs.add(pair)
        cb_rels.append(inst_rel(
            us_inst['id'], ca_inst['id'], rel_type, label,
            source_kind='curated', confidence=0.98,
        ))
        print(f'  Linked: {us_inst["name"][:40]} → {ca_inst["name"][:40]}')

    insert_batch('entity_relationships', cb_rels)
    print(f'  {"[DRY RUN] Would insert" if DRY_RUN else "Inserted"} {len(cb_rels)} cross-border relationships')
    cnt_crossborder = len(cb_rels)

    # ══════════════════════════════════════════════════════════════════════════
    # Summary
    # ══════════════════════════════════════════════════════════════════════════
    total = cnt_subsidiary + cnt_sibling + cnt_regulated + cnt_sponsor + cnt_crossborder
    print(f'\n{"="*60}')
    print('  SUMMARY')
    verb = 'to insert' if DRY_RUN else 'inserted'
    print(f'  Created {cnt_subsidiary:,} subsidiary_of, {cnt_sibling:,} sibling_of, '
          f'{cnt_regulated:,} regulated_by, {cnt_sponsor:,} sponsor_bank_for relationships. '
          f'Total: {total:,}')
    print(f'')
    print(f'  subsidiary_of  (holding company):  {cnt_subsidiary:,}')
    print(f'  sibling_of     (shared HC):        {cnt_sibling:,}')
    print(f'  regulated_by   (official):         {cnt_regulated:,}')
    print(f'  sponsor_bank_for (BaaS):           {cnt_sponsor:,}')
    print(f'  cross-border   (curated):          {cnt_crossborder:,}')
    print(f'  ─────────────────────────────────────')
    print(f'  Total relationships {verb}:     {total:,}')
    print(f'  Mode: {"DRY RUN — no changes written" if DRY_RUN else "LIVE — database updated"}')
    print(f'{"="*60}\n')


if __name__ == '__main__':
    main()
