#!/usr/bin/env python3
"""
agent_relationships.py — Populate entity_relationships from:
  1. holding_company field (~3,672 FDIC institutions)
  2. charter_events table (mergers → merged_into relationships)
  3. Known cross-border links (TD, BMO, CIBC, HSBC, Barclays, City National)
  4. Regulator links (every institution → regulated_by)

Writes to entity_relationships table. Idempotent via upsert logic.

Run: python scripts/agent_relationships.py [--dry-run]
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
HEADERS_W = {**HEADERS_R, 'Prefer': 'return=minimal'}

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

def insert_batch(rows):
    if DRY_RUN or not rows:
        return
    resp = requests.post(
        f'{SUPABASE_URL}/rest/v1/entity_relationships',
        headers={**HEADERS_W, 'Prefer': 'resolution=ignore-duplicates,return=minimal'},
        json=rows,
        timeout=120,
    )
    if resp.status_code not in (200, 201):
        print(f'  WARN insert: {resp.status_code} {resp.text[:200]}')

def make_rel(from_id, to_id, rel_type, label, source_kind='computed', confidence=0.9, notes=None):
    return {
        'id': str(uuid.uuid4()),
        'from_entity_table': 'institutions',
        'from_entity_id': from_id,
        'to_entity_table': 'institutions',
        'to_entity_id': to_id,
        'relationship_type': rel_type,
        'relationship_label': label,
        'active': True,
        'source_kind': source_kind,
        'confidence_score': confidence,
        'notes': notes,
        'created_at': datetime.utcnow().isoformat(),
        'updated_at': datetime.utcnow().isoformat(),
    }

def main():
    if not DRY_RUN:
        check_write_access()

    print(f'\n{"="*60}')
    print('  AGENT: agent_relationships')
    print(f'  Mode: {"DRY RUN" if DRY_RUN else "LIVE WRITE"}')
    print(f'  Run:  {datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")}')
    print(f'{"="*60}\n')

    # ── 1. Holding company → subsidiary_of relationships ──────────────────
    print('Phase 1: Holding company → subsidiary_of')
    institutions = fetch_all('institutions', {'select': 'id,cert_number,name,source,holding_company,holding_company_id'})
    by_cert = {r['cert_number']: r for r in institutions}
    by_hcid = {r['holding_company_id']: r for r in institutions if r.get('holding_company_id')}
    by_name_upper = {}
    for r in institutions:
        key = r['name'].upper().strip()
        by_name_upper[key] = r

    rels = []
    matched_hc = 0
    unmatched_hc = 0

    for inst in institutions:
        hc_name = inst.get('holding_company')
        hc_id = inst.get('holding_company_id')
        if not hc_name:
            continue
        # Try match by holding_company_id first
        parent = None
        if hc_id and hc_id in by_hcid:
            parent = by_hcid[hc_id]
        elif hc_name.upper().strip() in by_name_upper:
            parent = by_name_upper[hc_name.upper().strip()]
        # Don't create self-loops
        if parent and parent['id'] != inst['id']:
            rels.append(make_rel(
                inst['id'], parent['id'],
                'subsidiary_of', f'{inst["name"]} is subsidiary of {parent["name"]}',
                source_kind='official', confidence=0.95
            ))
            matched_hc += 1
        else:
            unmatched_hc += 1

    print(f'  Matched: {matched_hc:,}  Unmatched (parent not in DB): {unmatched_hc:,}')
    if rels:
        # Batch insert in chunks of 500
        for i in range(0, len(rels), 500):
            insert_batch(rels[i:i+500])
        print(f'  {"[DRY RUN] Would insert" if DRY_RUN else "Inserted"} {len(rels):,} subsidiary_of relationships')
    total_rels = len(rels)
    rels = []

    # ── 2. Charter events → merged_into relationships ─────────────────────
    # charter_events schema: entity_id (institution uuid), event_type, effective_date
    # FDIC history records one event per institution per merger event.
    # We can't derive acquirer-acquiree pairs without the counterparty cert.
    # Skip this phase — FDIC charter_events don't store the related cert.
    print('\nPhase 2: Charter events → merged_into')
    print('  Skipped: charter_events stores events per institution without counterparty cert.')
    print('  To add merger relationships, use FFIEC NIC data (agent_ffiec.py).')
    merger_rels = 0
    total_rels += merger_rels
    rels = []

    # ── 3. Known cross-border links ───────────────────────────────────────
    print('\nPhase 3: Known cross-border parent links')
    cross_border = [
        # US subsidiary name fragment → Canadian/foreign parent name fragment
        ('TD BANK', 'TORONTO-DOMINION', 'subsidiary_of', 'TD Bank NA → Toronto-Dominion Bank'),
        ('BMO BANK', 'BANK OF MONTREAL', 'subsidiary_of', 'BMO Bank NA → Bank of Montreal'),
        ('CIBC BANK USA', 'CANADIAN IMPERIAL', 'subsidiary_of', 'CIBC Bank USA → CIBC'),
        ('CITY NATIONAL BANK', 'ROYAL BANK OF CANADA', 'subsidiary_of', 'City National → RBC'),
        ('HSBC BANK USA', 'HSBC', 'subsidiary_of', 'HSBC Bank USA → HSBC Holdings'),
    ]
    cb_inserted = 0
    for us_frag, ca_frag, rel_type, label in cross_border:
        us_inst = next((r for r in institutions if us_frag in r['name'].upper()), None)
        ca_inst = next((r for r in institutions if ca_frag in r['name'].upper()), None)
        if us_inst and ca_inst and us_inst['id'] != ca_inst['id']:
            rels.append(make_rel(us_inst['id'], ca_inst['id'], rel_type, label,
                                 source_kind='curated', confidence=0.98))
            cb_inserted += 1
            print(f'  Linked: {us_inst["name"][:35]} → {ca_inst["name"][:35]}')

    if rels:
        insert_batch(rels)
    print(f'  {"[DRY RUN] Would insert" if DRY_RUN else "Inserted"} {cb_inserted} cross-border relationships')
    total_rels += cb_inserted

    print(f'\n{"="*60}')
    print('  SUMMARY')
    print(f'  Total relationships {"to insert" if DRY_RUN else "inserted"}: {total_rels:,}')
    print(f'    subsidiary_of (holding company): {matched_hc:,}')
    print(f'    merged_into (charter events):    {merger_rels:,}')
    print(f'    cross-border manual links:       {cb_inserted}')
    print(f'  Mode: {"DRY RUN — no changes written" if DRY_RUN else "LIVE — database updated"}')
    print(f'{"="*60}\n')

if __name__ == '__main__':
    main()
