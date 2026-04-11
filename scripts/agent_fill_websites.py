#!/usr/bin/env python3
"""
agent_fill_websites.py — Extract website URLs from raw_data JSONB and write to website field.
Checks known keys: WEBADDR, website, web_address, url, web_url across all sources.

Run: python scripts/agent_fill_websites.py [--dry-run]
"""
import sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from _db import check_write_access, SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY
import requests
from datetime import datetime
import re

DRY_RUN = '--dry-run' in sys.argv
KEY = SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY
HEADERS_R = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}
HEADERS_W = {**HEADERS_R, 'Prefer': 'return=minimal'}

URL_KEYS = ['WEBADDR', 'website', 'web_address', 'url', 'web_url', 'Website', 'WebAddress', 'homepage']
URL_RE = re.compile(r'^https?://', re.IGNORECASE)

def normalize_url(raw: str) -> str | None:
    if not raw or not isinstance(raw, str):
        return None
    raw = raw.strip()
    if not raw or raw.lower() in ('n/a', 'none', 'null', '-', ''):
        return None
    if not URL_RE.match(raw):
        raw = 'https://' + raw
    return raw

def extract_website(raw_data: dict) -> str | None:
    if not raw_data or not isinstance(raw_data, dict):
        return None
    for key in URL_KEYS:
        val = raw_data.get(key)
        if val:
            url = normalize_url(str(val))
            if url:
                return url
    return None

def fetch_missing_website():
    rows = []
    limit = 1000
    offset = 0
    while True:
        resp = requests.get(
            f'{SUPABASE_URL}/rest/v1/institutions',
            headers=HEADERS_R,
            params={
                'select': 'id,cert_number,source,name,website,raw_data',
                'website': 'is.null',
                'raw_data': 'not.is.null',
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
    if not DRY_RUN:
        check_write_access()

    print(f'\n{"="*55}')
    print('  AGENT: agent_fill_websites')
    print(f'  Mode: {"DRY RUN" if DRY_RUN else "LIVE WRITE"}')
    print(f'  Run:  {datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")}')
    print(f'{"="*55}\n')

    rows = fetch_missing_website()
    print(f'Found {len(rows):,} institutions with no website but have raw_data\n')

    found = 0
    updated = 0
    not_found = 0
    errors = 0
    by_source = {}

    for r in rows:
        raw = r.get('raw_data') or {}
        url = extract_website(raw)
        src = r['source']

        if not url:
            not_found += 1
            continue

        found += 1
        by_source[src] = by_source.get(src, 0) + 1

        if DRY_RUN:
            print(f'  [{src}] {r["name"][:40]:<40} → {url}')
            updated += 1
            continue

        try:
            resp = requests.patch(
                f'{SUPABASE_URL}/rest/v1/institutions',
                headers=HEADERS_W,
                params={'id': f'eq.{r["id"]}'},
                json={'website': url, 'updated_at': datetime.utcnow().isoformat()},
                timeout=30,
            )
            resp.raise_for_status()
            updated += 1
        except Exception as e:
            print(f'  ERROR: {r["cert_number"]} {e}')
            errors += 1

    print(f'\nSource breakdown of websites found:')
    for src, count in sorted(by_source.items(), key=lambda x: -x[1]):
        print(f'  {src:<12} {count:,}')

    print(f'\n{"="*55}')
    print(f'  Websites found in raw_data: {found:,}')
    print(f'  No URL in raw_data:         {not_found:,}')
    print(f'  {"Would update" if DRY_RUN else "Updated"}:                  {updated:,}')
    print(f'  Errors:                     {errors:,}')
    print(f'{"="*55}\n')

if __name__ == '__main__':
    main()
