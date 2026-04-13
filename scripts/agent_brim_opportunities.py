#!/usr/bin/env python3
"""
agent_brim_opportunities.py — Classify institutions into Brim opportunity types.

Signals: too_big_for_agent, portfolio_acquirer, post_merger_window,
         core_conversion, outgrowing_program.

Writes to bank_capabilities.opportunity_signals, opportunity_score,
opportunity_type, opportunity_summary.

Run: python scripts/agent_brim_opportunities.py [--dry-run] [--limit N]
"""
import sys
import json
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from _db import check_write_access, SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY
import requests
from datetime import datetime, date, timedelta

DRY_RUN = '--dry-run' in sys.argv
LIMIT = None
for i, arg in enumerate(sys.argv):
    if arg == '--limit' and i + 1 < len(sys.argv):
        LIMIT = int(sys.argv[i + 1])

KEY = SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY
HEADERS_R = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}
HEADERS_W = {**HEADERS_R, 'Prefer': 'resolution=merge-duplicates,return=minimal'}

# Institutions NOT to target (existing Brim clients)
EXCLUDE_NAMES = {
    'MANULIFE', 'AFFINITY CREDIT UNION', 'LAURENTIAN BANK',
    'CANADIAN WESTERN BANK', 'CWB', 'ZOLVE', 'CONTINENTAL',
    'AIR FRANCE', 'KLM', 'PAYFACTO',
}

# Vendor family mapping for cross-vendor friction detection
VENDOR_FAMILIES: dict[str, list[str]] = {
    'fiserv':     ['fiserv', 'dna', 'premier', 'signature', 'elan'],
    'jack_henry': ['jack henry', 'symitar', 'silverlake', 'jha'],
    'fis':        ['fis', 'horizon', 'ibs'],
    'credit_union': ['pscu', 'co-op'],
}

def vendor_family(name: str) -> str | None:
    """Return the vendor family key for a processor/program name, or None."""
    n = name.lower()
    for family, members in VENDOR_FAMILIES.items():
        if any(m in n for m in members):
            return family
    return None


def fmt_assets(amount: int) -> str:
    """Format asset amount (stored as raw dollars) into readable string."""
    if amount >= 1_000_000_000:
        return f'${amount / 1_000_000_000:.1f}B'
    if amount >= 1_000_000:
        return f'${amount / 1_000_000:.0f}M'
    return f'${amount:,}'


def fmt_interchange(amount: float) -> str:
    if amount >= 1_000_000:
        return f'${amount / 1_000_000:.1f}M'
    return f'${amount:,.0f}'


def is_excluded(name: str) -> bool:
    n = name.upper()
    return any(ex in n for ex in EXCLUDE_NAMES)


# ─── Data fetchers ──────────────────────────────────────────────────────────

def fetch_institutions() -> list[dict]:
    rows: list[dict] = []
    limit = 1000
    offset = 0
    while True:
        resp = requests.get(
            f'{SUPABASE_URL}/rest/v1/institutions',
            headers=HEADERS_R,
            params={
                'select': 'id,cert_number,name,total_assets,credit_card_loans',
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


def fetch_capabilities() -> dict[int, dict]:
    rows: list[dict] = []
    limit = 1000
    offset = 0
    while True:
        resp = requests.get(
            f'{SUPABASE_URL}/rest/v1/bank_capabilities',
            headers=HEADERS_R,
            params={
                'select': 'cert_number,agent_bank_program,core_processor',
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


def fetch_charter_events_bulk() -> dict[str, list[dict]]:
    """
    Return all charter_events for institutions, keyed by entity_id (UUID string).
    We only pull events within the last 3 years to keep the payload manageable.
    """
    cutoff = (date.today() - timedelta(days=3 * 365)).isoformat()
    rows: list[dict] = []
    limit = 1000
    offset = 0
    while True:
        resp = requests.get(
            f'{SUPABASE_URL}/rest/v1/charter_events',
            headers=HEADERS_R,
            params={
                'select': 'entity_id,event_type,event_date',
                'entity_table': 'eq.institutions',
                'event_date': f'gte.{cutoff}',
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
    by_entity: dict[str, list[dict]] = {}
    for row in rows:
        eid = row['entity_id']
        by_entity.setdefault(eid, []).append(row)
    return by_entity


def fetch_financial_history_bulk() -> dict[str, list[dict]]:
    """
    Return financial_history_quarterly for institutions keyed by entity_id.
    Pull up to 10 periods per institution (2+ years of quarterly data).
    """
    rows: list[dict] = []
    limit = 1000
    offset = 0
    cutoff = (date.today() - timedelta(days=3 * 365)).isoformat()
    while True:
        resp = requests.get(
            f'{SUPABASE_URL}/rest/v1/financial_history_quarterly',
            headers=HEADERS_R,
            params={
                'select': 'entity_id,period,total_assets',
                'entity_table': 'eq.institutions',
                'period': f'gte.{cutoff}',
                'order': 'period.desc',
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
    by_entity: dict[str, list[dict]] = {}
    for row in rows:
        eid = row['entity_id']
        by_entity.setdefault(eid, []).append(row)
    return by_entity


# ─── Signal classifiers ──────────────────────────────────────────────────────

def signal_too_big_for_agent(
    inst: dict,
    cap: dict,
) -> dict | None:
    agent_program = (cap.get('agent_bank_program') or '').strip()
    if not agent_program:
        return None
    total_assets = inst.get('total_assets') or 0
    cc_loans = inst.get('credit_card_loans') or 0
    if total_assets < 5_000_000_000 and cc_loans < 50_000_000:
        return None
    estimated_interchange = cc_loans * 0.015
    summary = (
        f"{inst['name']} ({fmt_assets(total_assets)} in assets) is on "
        f"{agent_program}'s agent banking program. At this asset size, "
        f"estimated interchange revenue of {fmt_interchange(estimated_interchange)} "
        f"suggests significant cost savings from owning their card program directly."
    )
    return {'signal': 'too_big_for_agent', 'score': 30, 'summary': summary}


def signal_portfolio_acquirer(
    inst: dict,
    cap: dict,
    charter_events_for_inst: list[dict],
) -> dict | None:
    cc_loans = inst.get('credit_card_loans') or 0
    total_assets = inst.get('total_assets') or 0
    if cc_loans <= 0 or total_assets < 2_000_000_000:
        return None
    merger_keywords = ('merge', 'acquisition', 'consolidation', 'purchase')
    cutoff = date.today() - timedelta(days=2 * 365)
    has_recent_event = any(
        any(kw in (e.get('event_type') or '').lower() for kw in merger_keywords)
        and (
            datetime.strptime(e['event_date'], '%Y-%m-%d').date() >= cutoff
            if isinstance(e.get('event_date'), str)
            else False
        )
        for e in charter_events_for_inst
    )
    if not has_recent_event:
        return None
    summary = (
        f"{inst['name']} shows signs of active card portfolio growth. "
        "Recent activity suggests portfolio acquisition or aggressive organic growth "
        "in card lending."
    )
    return {'signal': 'portfolio_acquirer', 'score': 20, 'summary': summary}


def signal_post_merger_window(
    inst: dict,
    charter_events_for_inst: list[dict],
) -> dict | None:
    merger_keywords = ('merge', 'acquisition', 'consolidation', 'purchase')
    cutoff = date.today() - timedelta(days=24 * 30)  # ~24 months
    for event in charter_events_for_inst:
        event_type = (event.get('event_type') or '').lower()
        event_date_raw = event.get('event_date') or ''
        if not event_date_raw:
            continue
        try:
            event_date = datetime.strptime(event_date_raw, '%Y-%m-%d').date()
        except ValueError:
            continue
        if event_date < cutoff:
            continue
        if any(kw in event_type for kw in merger_keywords):
            formatted_date = event_date.strftime('%B %d, %Y')
            summary = (
                f"{inst['name']} underwent a {event.get('event_type', 'merger')} event "
                f"on {formatted_date}. Post-merger vendor reviews typically occur within "
                "6-18 months, creating a natural window for card program evaluation."
            )
            return {'signal': 'post_merger_window', 'score': 25, 'summary': summary}
    return None


def signal_core_conversion(
    inst: dict,
    cap: dict,
) -> dict | None:
    core = (cap.get('core_processor') or '').strip()
    agent_program = (cap.get('agent_bank_program') or '').strip()
    if not core or not agent_program:
        return None
    core_family = vendor_family(core)
    agent_family = vendor_family(agent_program)
    # If either is unknown, we can't confirm a mismatch
    if core_family is None or agent_family is None:
        return None
    if core_family == agent_family:
        return None
    summary = (
        f"{inst['name']} runs {core} as their core but uses {agent_program} for cards "
        "— a cross-vendor dependency that creates operational friction and migration incentive."
    )
    return {'signal': 'core_conversion', 'score': 15, 'summary': summary}


def signal_outgrowing_program(
    inst: dict,
    history_for_inst: list[dict],
) -> dict | None:
    cc_loans = inst.get('credit_card_loans') or 0
    if cc_loans <= 0:
        return None
    total_assets = inst.get('total_assets') or 0
    if not (2_000_000_000 <= total_assets <= 10_000_000_000):
        return None
    if len(history_for_inst) < 2:
        return None
    # history_for_inst is already sorted desc by period
    latest = history_for_inst[0]
    earliest = history_for_inst[-1]
    latest_assets = latest.get('total_assets') or 0
    earliest_assets = earliest.get('total_assets') or 0
    if earliest_assets <= 0 or latest_assets <= 0:
        return None
    growth_pct = (latest_assets - earliest_assets) / earliest_assets * 100
    if growth_pct < 15:
        return None
    summary = (
        f"{inst['name']} has grown {growth_pct:.1f}% in assets over the past 2 years "
        f"to {fmt_assets(total_assets)}. This growth trajectory suggests they will outgrow "
        "their current card program infrastructure within 1-2 years."
    )
    return {'signal': 'outgrowing_program', 'score': 20, 'summary': summary}


# ─── Priority ordering for opportunity_type ─────────────────────────────────
SIGNAL_PRIORITY = [
    'too_big_for_agent',
    'post_merger_window',
    'portfolio_acquirer',
    'core_conversion',
    'outgrowing_program',
]


def classify_institution(
    inst: dict,
    cap: dict,
    charter_events_for_inst: list[dict],
    history_for_inst: list[dict],
) -> dict:
    active_signals: list[dict] = []

    s1 = signal_too_big_for_agent(inst, cap)
    if s1:
        active_signals.append(s1)

    s2 = signal_portfolio_acquirer(inst, cap, charter_events_for_inst)
    if s2:
        active_signals.append(s2)

    s3 = signal_post_merger_window(inst, charter_events_for_inst)
    if s3:
        active_signals.append(s3)

    s4 = signal_core_conversion(inst, cap)
    if s4:
        active_signals.append(s4)

    s5 = signal_outgrowing_program(inst, history_for_inst)
    if s5:
        active_signals.append(s5)

    if not active_signals:
        return {
            'opportunity_signals': None,
            'opportunity_score': 0,
            'opportunity_type': None,
            'opportunity_summary': None,
        }

    total_score = min(100, sum(s['score'] for s in active_signals))

    # Determine primary type by priority ordering
    signal_names = {s['signal'] for s in active_signals}
    primary_type: str | None = None
    for prio_signal in SIGNAL_PRIORITY:
        if prio_signal in signal_names:
            primary_type = prio_signal
            break

    # Build combined summary
    summaries = [s['summary'] for s in active_signals]
    if len(summaries) == 1:
        combined_summary = summaries[0]
    else:
        combined_summary = ' Additionally, '.join(summaries)

    return {
        'opportunity_signals': active_signals,
        'opportunity_score': total_score,
        'opportunity_type': primary_type,
        'opportunity_summary': combined_summary,
    }


# ─── Main ────────────────────────────────────────────────────────────────────

def main() -> None:
    if not DRY_RUN:
        check_write_access()

    print(f'\n{"="*60}')
    print('  AGENT: agent_brim_opportunities — Opportunity Classification')
    print(f'  Mode: {"DRY RUN" if DRY_RUN else "LIVE WRITE"}')
    if LIMIT:
        print(f'  Limit: {LIMIT}')
    print(f'  Run:  {datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")}')
    print(f'{"="*60}\n')

    print('Loading institutions, capabilities, charter events, and financial history...')
    institutions = fetch_institutions()
    capabilities = fetch_capabilities()
    charter_events_by_entity = fetch_charter_events_bulk()
    history_by_entity = fetch_financial_history_bulk()

    print(f'  {len(institutions):,} active institutions')
    print(f'  {len(capabilities):,} capability records')
    print(f'  {len(charter_events_by_entity):,} entities with charter events')
    print(f'  {len(history_by_entity):,} entities with financial history\n')

    if LIMIT:
        institutions = institutions[:LIMIT]

    results: list[tuple[dict, dict]] = []  # (classification, inst)
    excluded = 0
    signal_counts: dict[str, int] = {s: 0 for s in SIGNAL_PRIORITY}

    for inst in institutions:
        if is_excluded(inst['name']):
            excluded += 1
            continue

        inst_id = str(inst.get('id') or '')
        cap = capabilities.get(inst['cert_number']) or {}
        charter_events_for_inst = charter_events_by_entity.get(inst_id, [])
        history_for_inst = history_by_entity.get(inst_id, [])

        classification = classify_institution(inst, cap, charter_events_for_inst, history_for_inst)

        if classification['opportunity_signals']:
            for sig in classification['opportunity_signals']:
                signal_counts[sig['signal']] = signal_counts.get(sig['signal'], 0) + 1

        results.append((classification, inst))

    with_signal = sum(1 for c, _ in results if c['opportunity_type'] is not None)
    results.sort(key=lambda x: -(x[0]['opportunity_score'] or 0))

    # ─── Summary report ──────────────────────────────────────────────────────
    print(f'OPPORTUNITY CLASSIFICATION SUMMARY:')
    print(f'  Total analyzed:        {len(results):,}')
    print(f'  With at least 1 signal:{with_signal:,}')
    print(f'  Excluded (Brim clients):{excluded}')
    print()
    print('  SIGNAL BREAKDOWN:')
    for signal_name in SIGNAL_PRIORITY:
        count = signal_counts.get(signal_name, 0)
        print(f'    {signal_name:<25} {count:>5,}')

    print()
    print('  TOP 10 OPPORTUNITIES:')
    print(f'  {"Cert":>8}  {"Score":>5}  {"Type":<25}  {"Name"}')
    print(f'  {"-"*8}  {"-"*5}  {"-"*25}  {"-"*45}')
    for classification, inst in results[:10]:
        if not classification['opportunity_type']:
            continue
        print(
            f'  {inst["cert_number"]:>8}  '
            f'{classification["opportunity_score"]:>5}  '
            f'{(classification["opportunity_type"] or ""):.<25}  '
            f'{inst["name"][:45]}'
        )

    # ─── Write to DB ─────────────────────────────────────────────────────────
    if not DRY_RUN:
        print('\nWriting opportunity classifications to bank_capabilities...')
        to_upsert: list[dict] = []
        for classification, inst in results:
            to_upsert.append({
                'cert_number': inst['cert_number'],
                'opportunity_signals': json.dumps(classification['opportunity_signals']) if classification['opportunity_signals'] else None,
                'opportunity_score': classification['opportunity_score'],
                'opportunity_type': classification['opportunity_type'],
                'opportunity_summary': classification['opportunity_summary'],
                'updated_at': datetime.utcnow().isoformat(),
            })
        written = 0
        for i in range(0, len(to_upsert), 500):
            batch = to_upsert[i:i + 500]
            resp = requests.post(
                f'{SUPABASE_URL}/rest/v1/bank_capabilities',
                headers=HEADERS_W,
                json=batch,
                timeout=120,
            )
            if resp.status_code not in (200, 201):
                print(f'  WARN: {resp.status_code} {resp.text[:200]}')
            else:
                written += len(batch)
        print(f'  Written {written:,} records')

    print(f'\n{"="*60}')
    print(f'  Mode: {"DRY RUN — no writes" if DRY_RUN else "LIVE — database updated"}')
    print(f'{"="*60}\n')


if __name__ == '__main__':
    main()
