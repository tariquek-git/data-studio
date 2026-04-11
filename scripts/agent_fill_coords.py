#!/usr/bin/env python3
"""
agent_fill_coords.py — Geocode institutions using Nominatim (OpenStreetMap).

Fetches institutions where latitude IS NULL but city + state exist.
Geocodes via https://nominatim.openstreetmap.org/search at 1 req/sec.
Updates latitude, longitude in institutions table.

Idempotent — skips rows already geocoded.
Handles US states and Canadian provinces correctly.

Run: python scripts/agent_fill_coords.py [--dry-run] [--limit N] [--source fdic]
"""
import sys
import time
import json
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from _db import check_write_access, SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY
import requests
from datetime import datetime

DRY_RUN = '--dry-run' in sys.argv
LIMIT = None
SOURCE_FILTER = None
for i, arg in enumerate(sys.argv):
    if arg == '--limit' and i + 1 < len(sys.argv):
        LIMIT = int(sys.argv[i + 1])
    if arg == '--source' and i + 1 < len(sys.argv):
        SOURCE_FILTER = sys.argv[i + 1]

if not DRY_RUN:
    check_write_access()

KEY = SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY
HEADERS_R = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}
HEADERS_W = {**HEADERS_R, 'Prefer': 'return=minimal'}

NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
NOMINATIM_HEADERS = {
    'User-Agent': 'FinTechCommons-DataStudio/1.0 (data@fintechcommons.com)',
    'Accept-Language': 'en',
}

# Country code by source type
SOURCE_COUNTRY = {
    'fdic': 'US', 'ncua': 'US', 'occ': 'US', 'fincen': 'US', 'frb': 'US',
    'osfi': 'CA', 'bcfsa': 'CA', 'fsra': 'CA', 'cudgc': 'CA', 'cudgc_sk': 'CA',
    'nscudic': 'CA', 'dgcm': 'CA', 'rpaa': 'CA', 'ciro': 'CA', 'fintrac': 'CA',
}

CA_PROVINCE_NAMES = {
    'AB': 'Alberta', 'BC': 'British Columbia', 'MB': 'Manitoba', 'NB': 'New Brunswick',
    'NL': 'Newfoundland and Labrador', 'NS': 'Nova Scotia', 'NT': 'Northwest Territories',
    'NU': 'Nunavut', 'ON': 'Ontario', 'PE': 'Prince Edward Island', 'QC': 'Quebec',
    'SK': 'Saskatchewan', 'YT': 'Yukon',
}


def fetch_missing_coords(batch_size=500):
    """Fetch institutions without coordinates but with city data."""
    rows = []
    offset = 0
    while True:
        params = {
            'select': 'id,cert_number,name,city,state,source',
            'latitude': 'is.null',
            'city': 'not.is.null',
            'active': 'eq.true',
            'limit': batch_size,
            'offset': offset,
            'order': 'total_assets.desc.nullslast',
        }
        if SOURCE_FILTER:
            params['source'] = f'eq.{SOURCE_FILTER}'
        resp = requests.get(
            f'{SUPABASE_URL}/rest/v1/institutions',
            headers=HEADERS_R,
            params=params,
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


def geocode(city: str, state: str, country: str) -> tuple[float, float] | None:
    """Call Nominatim to geocode city + state. Returns (lat, lng) or None."""
    # Build query - for CA provinces use full name
    if country == 'CA' and state in CA_PROVINCE_NAMES:
        state_name = CA_PROVINCE_NAMES[state]
        q = f'{city}, {state_name}, Canada'
    elif country == 'US':
        q = f'{city}, {state}, USA'
    else:
        q = f'{city}, {state}'

    try:
        resp = requests.get(
            NOMINATIM_URL,
            headers=NOMINATIM_HEADERS,
            params={
                'q': q,
                'format': 'json',
                'limit': 1,
                'addressdetails': 0,
            },
            timeout=10,
        )
        resp.raise_for_status()
        results = resp.json()
        if results:
            return float(results[0]['lat']), float(results[0]['lon'])
    except Exception as e:
        print(f'  Nominatim error for "{q}": {e}')
    return None


def update_coords(institution_id: str, lat: float, lng: float) -> bool:
    """Update latitude/longitude for an institution."""
    resp = requests.patch(
        f'{SUPABASE_URL}/rest/v1/institutions',
        headers=HEADERS_W,
        params={'id': f'eq.{institution_id}'},
        json={'latitude': lat, 'longitude': lng},
        timeout=30,
    )
    return resp.status_code in (200, 204)


def main():
    print('=== agent_fill_coords.py ===')
    print(f'Mode: {"DRY RUN" if DRY_RUN else "LIVE"}')
    if LIMIT:
        print(f'Limit: {LIMIT}')
    if SOURCE_FILTER:
        print(f'Source filter: {SOURCE_FILTER}')
    print()

    print('Fetching institutions without coordinates...')
    rows = fetch_missing_coords()
    total = len(rows)
    print(f'Found {total:,} institutions to geocode')

    if total == 0:
        print('Nothing to do. All institutions are geocoded.')
        return

    updated = 0
    failed = 0
    skipped = 0
    cache: dict[tuple, tuple[float, float] | None] = {}  # (city, state) → coords

    for i, row in enumerate(rows):
        city = (row.get('city') or '').strip()
        state = (row.get('state') or '').strip()
        source = (row.get('source') or '').strip()
        country = SOURCE_COUNTRY.get(source, 'US')

        if not city or not state:
            skipped += 1
            continue

        key = (city.lower(), state.lower(), country)
        if key in cache:
            coords = cache[key]
        else:
            coords = geocode(city, state, country)
            cache[key] = coords
            time.sleep(1.1)  # Nominatim ToS: max 1 req/sec

        if coords:
            lat, lng = coords
            if not DRY_RUN:
                ok = update_coords(row['id'], lat, lng)
                if ok:
                    updated += 1
                else:
                    failed += 1
            else:
                updated += 1

            if (i + 1) % 100 == 0 or i == total - 1:
                pct = (i + 1) / total * 100
                print(f'  [{i+1}/{total} {pct:.1f}%] updated={updated} failed={failed} skipped={skipped}')
        else:
            failed += 1
            if failed <= 20:  # Only print first 20 failures to avoid spam
                print(f'  MISS: {row["name"]} ({city}, {state})')

    print()
    print('=== Summary ===')
    print(f'Total processed : {total:,}')
    print(f'Geocoded        : {updated:,}')
    print(f'Failed/no match : {failed:,}')
    print(f'Skipped (no city): {skipped:,}')
    print(f'Cache hits      : {len(cache)} unique city/state combos')
    if DRY_RUN:
        print('(DRY RUN — no writes made)')


if __name__ == '__main__':
    main()
