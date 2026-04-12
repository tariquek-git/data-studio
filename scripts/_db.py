"""
Shared Supabase connection helper for Python agents.
Loads credentials from .env.local (falls back to environment variables).
"""
import os
import sys
import requests
from pathlib import Path

def load_env():
    """Load .env.local from repo root into os.environ."""
    env_path = Path(__file__).parent.parent / '.env.local'
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, _, val = line.partition('=')
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and val and key not in os.environ:
                os.environ[key] = val

load_env()

SUPABASE_URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
SUPABASE_ANON_KEY = os.environ.get('VITE_SUPABASE_ANON_KEY', '')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')


def _headers(write=False):
    key = SUPABASE_SERVICE_KEY if write else (SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY)
    if not key:
        print('ERROR: No Supabase key found. Set SUPABASE_SERVICE_ROLE_KEY in .env.local')
        sys.exit(1)
    return {
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
    }

# Public alias — agents should import this instead of building HEADERS by hand.
def get_headers(write=False):
    """Return PostgREST auth headers. Pass write=True for INSERT/PATCH/DELETE."""
    return _headers(write)


def sql(query: str, write=False) -> list[dict]:
    """Execute raw SQL via Supabase REST RPC endpoint."""
    if not SUPABASE_URL:
        print('ERROR: SUPABASE_URL not set in .env.local')
        sys.exit(1)
    resp = requests.post(
        f'{SUPABASE_URL}/rest/v1/rpc/execute_sql',
        headers=_headers(write),
        json={'query': query},
        timeout=60,
    )
    if resp.status_code == 404:
        # Fallback: use PostgREST /query endpoint (Supabase doesn't expose raw SQL via anon)
        print('WARN: execute_sql RPC not found. Use SUPABASE_SERVICE_ROLE_KEY for raw SQL.')
        return []
    resp.raise_for_status()
    return resp.json() if resp.text else []


def select(table: str, params: dict | None = None, write=False) -> list[dict]:
    """SELECT from a Supabase table using PostgREST."""
    headers = _headers(write)
    headers['Prefer'] = 'count=exact'
    resp = requests.get(
        f'{SUPABASE_URL}/rest/v1/{table}',
        headers=headers,
        params=params or {},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


def update(table: str, match: dict, data: dict) -> requests.Response:
    """PATCH rows in a Supabase table matching `match` params."""
    headers = _headers(write=True)
    headers['Prefer'] = 'return=minimal'
    params = {k: f'eq.{v}' for k, v in match.items()}
    resp = requests.patch(
        f'{SUPABASE_URL}/rest/v1/{table}',
        headers=headers,
        params=params,
        json=data,
        timeout=60,
    )
    resp.raise_for_status()
    return resp


def insert(table: str, rows: list[dict], upsert=False) -> requests.Response:
    """INSERT (or upsert) rows into a Supabase table."""
    headers = _headers(write=True)
    if upsert:
        headers['Prefer'] = 'resolution=merge-duplicates,return=minimal'
    else:
        headers['Prefer'] = 'return=minimal'
    resp = requests.post(
        f'{SUPABASE_URL}/rest/v1/{table}',
        headers=headers,
        json=rows,
        timeout=120,
    )
    resp.raise_for_status()
    return resp


def check_write_access():
    """Exit with message if service role key is missing."""
    if not SUPABASE_SERVICE_KEY:
        print('ERROR: SUPABASE_SERVICE_ROLE_KEY required for write operations.')
        print('  Get it from: Supabase Dashboard → Project Settings → API → service_role key')
        print('  Add it to: .env.local')
        sys.exit(1)
