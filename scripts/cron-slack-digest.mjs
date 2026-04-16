#!/usr/bin/env node
/**
 * cron-slack-digest.mjs
 *
 * Weekly BD digest — posts to Slack via webhook. Summarizes:
 *   - New A/B/C tier institutions this week (upgrades from lower tiers)
 *   - Tier downgrades (anything that dropped out of A/B/C)
 *   - New enforcement actions observed in the last 7 days
 *   - New exec transitions observed in the last 7 days
 *   - Top 10 highest-scoring institutions this snapshot
 *
 * Assumes cron-snapshot-scores.mjs ran earlier today — reads the most recent
 * snapshot and compares to the previous one via detect_tier_changes().
 *
 * Required env:
 *   SLACK_WEBHOOK_URL — Slack incoming webhook URL
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — standard
 *
 * Run: node scripts/cron-slack-digest.mjs [--dry-run]
 */

import { createSupabaseServiceClient, loadEnvLocal, getEnvValue } from './_sync-utils.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const env = loadEnvLocal();
const supabase = createSupabaseServiceClient(env);
const WEBHOOK = getEnvValue(env, 'SLACK_WEBHOOK_URL');

if (!DRY_RUN && !WEBHOOK) {
  console.error('SLACK_WEBHOOK_URL not set in env. Run with --dry-run to preview.');
  process.exit(1);
}

function formatScore(tier, score) {
  const tierEmoji = { A: '🟢', B: '🔵', C: '🟡', D: '🟠', F: '🔴' }[tier] ?? '⚪';
  return `${tierEmoji} ${tier} (${score})`;
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

async function buildDigest() {
  // 1. Most recent snapshot date
  const { data: latestRows } = await supabase
    .from('score_snapshots')
    .select('snapshot_date')
    .order('snapshot_date', { ascending: false })
    .limit(1);
  const latestDate = latestRows?.[0]?.snapshot_date;
  if (!latestDate) {
    throw new Error('No snapshots found — run cron-snapshot-scores.mjs first');
  }

  // 2. Tier changes vs prior snapshot
  const { data: changes, error: chErr } = await supabase.rpc('detect_tier_changes', {
    p_current_date: latestDate,
  });
  if (chErr) throw new Error(`detect_tier_changes: ${chErr.message}`);

  const tierRank = { A: 0, B: 1, C: 2, D: 3, F: 4 };
  const upgrades = (changes ?? []).filter(
    (c) => tierRank[c.new_tier] < tierRank[c.prev_tier]
  );
  const downgrades = (changes ?? []).filter(
    (c) => tierRank[c.new_tier] > tierRank[c.prev_tier]
  );

  // 3. New enforcement / exec_transition facts in last 7 days.
  //    We fetch facts first, then join institution names in a second query —
  //    PostgREST's embedded select (`institutions!inner(...)`) requires a
  //    declared FK relationship on entity_facts → institutions, which we
  //    don't have (entity_facts is polymorphic via entity_table).
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: factRows } = await supabase
    .from('entity_facts')
    .select('fact_type, entity_id, observed_at, fact_value_text, source_url')
    .eq('entity_table', 'institutions')
    .in('fact_type', ['signal.enforcement_action', 'signal.exec_transition'])
    .gte('observed_at', cutoff)
    .order('observed_at', { ascending: false })
    .limit(30);

  const factEntityIds = [...new Set((factRows ?? []).map((f) => f.entity_id))];
  const factInstById = new Map();
  if (factEntityIds.length > 0) {
    const { data: instForFacts } = await supabase
      .from('institutions')
      .select('id, name, state')
      .in('id', factEntityIds);
    for (const i of instForFacts ?? []) factInstById.set(i.id, i);
  }
  const newFacts = (factRows ?? []).map((f) => ({
    ...f,
    institution: factInstById.get(f.entity_id) ?? { name: '(unknown)', state: '' },
  }));

  // 4. Top 10 current scorers — same two-step pattern.
  const { data: topSnaps } = await supabase
    .from('score_snapshots')
    .select('score, tier, completeness, entity_id')
    .eq('snapshot_date', latestDate)
    .order('score', { ascending: false })
    .limit(10);

  const topIds = (topSnaps ?? []).map((r) => r.entity_id);
  const topInstById = new Map();
  if (topIds.length > 0) {
    const { data: topInsts } = await supabase
      .from('institutions')
      .select('id, name, state, total_assets')
      .in('id', topIds);
    for (const i of topInsts ?? []) topInstById.set(i.id, i);
  }
  const topScorers = (topSnaps ?? []).map((r) => ({
    ...r,
    institution: topInstById.get(r.entity_id) ?? { name: '(unknown)', state: '', total_assets: null },
  }));

  // 5. Tier distribution — aggregate via COUNT RPC so we get the full 10K set
  //    without the 1000-row PostgREST cap. Using a raw RPC-free workaround:
  //    fetch tiers in pages.
  const tierCounts = {};
  let cursor = 0;
  const pageSize = 1000;
  while (true) {
    const { data: page } = await supabase
      .from('score_snapshots')
      .select('tier')
      .eq('snapshot_date', latestDate)
      .range(cursor, cursor + pageSize - 1);
    if (!page || page.length === 0) break;
    for (const r of page) tierCounts[r.tier] = (tierCounts[r.tier] ?? 0) + 1;
    if (page.length < pageSize) break;
    cursor += pageSize;
  }

  return {
    latestDate,
    upgrades: upgrades.slice(0, 15),
    downgrades: downgrades.slice(0, 10),
    newFacts: newFacts.slice(0, 15),
    topScorers,
    tierCounts,
  };
}

function renderBlocks(digest) {
  const { latestDate, upgrades, downgrades, newFacts, topScorers, tierCounts } = digest;
  const blocks = [];

  blocks.push({
    type: 'header',
    text: { type: 'plain_text', text: `Brim BD Weekly Digest — ${latestDate}` },
  });

  // Tier distribution
  const distText = ['A', 'B', 'C', 'D', 'F']
    .map((t) => `${formatScore(t, '')}: *${tierCounts[t] ?? 0}*`)
    .join('   ');
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `*Tier distribution*\n${distText}` },
  });

  // Upgrades
  if (upgrades.length > 0) {
    const lines = upgrades
      .map(
        (c) =>
          `• *${truncate(c.name, 60)}*: ${c.prev_tier} (${c.prev_score}) → ${c.new_tier} (${c.new_score})`
      )
      .join('\n');
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🎯 Tier upgrades (${upgrades.length})*\n${lines}`,
      },
    });
  }

  // Downgrades
  if (downgrades.length > 0) {
    const lines = downgrades
      .map(
        (c) =>
          `• *${truncate(c.name, 60)}*: ${c.prev_tier} (${c.prev_score}) → ${c.new_tier} (${c.new_score})`
      )
      .join('\n');
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*📉 Tier downgrades (${downgrades.length})*\n${lines}`,
      },
    });
  }

  // New signal facts this week
  if (newFacts.length > 0) {
    const lines = newFacts
      .map((f) => {
        const kind = f.fact_type.replace('signal.', '');
        const inst = f.institution || {};
        const date = (f.observed_at || '').slice(0, 10);
        return `• *${truncate(inst.name, 50)}* (${inst.state ?? ''}) — ${kind} — ${date}`;
      })
      .join('\n');
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🆕 New signals (last 7 days, ${newFacts.length})*\n${lines}`,
      },
    });
  }

  // Top scorers
  if (topScorers.length > 0) {
    const lines = topScorers
      .map((r) => {
        const inst = r.institution || {};
        const assets = inst.total_assets
          ? `$${(inst.total_assets / 1e9).toFixed(1)}B`
          : '—';
        return `• ${formatScore(r.tier, r.score)} *${truncate(inst.name, 50)}* (${inst.state ?? ''}, ${assets})`;
      })
      .join('\n');
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*🏆 Top 10 scorers*\n${lines}` },
    });
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Generated by data-studio \`cron-slack-digest.mjs\` · Snapshot ${latestDate}`,
      },
    ],
  });

  return blocks;
}

async function main() {
  console.log('=== cron-slack-digest.mjs ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

  const digest = await buildDigest();
  const blocks = renderBlocks(digest);

  console.log(`Snapshot: ${digest.latestDate}`);
  console.log(`Upgrades: ${digest.upgrades.length}, Downgrades: ${digest.downgrades.length}`);
  console.log(`New facts: ${digest.newFacts.length}, Top scorers: ${digest.topScorers.length}`);

  if (DRY_RUN) {
    console.log('\n--- Slack payload (dry run) ---');
    console.log(JSON.stringify({ blocks }, null, 2));
    return;
  }

  const resp = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Slack webhook ${resp.status}: ${body}`);
  }
  console.log('Posted to Slack.');
}

main().catch((err) => {
  console.error('cron-slack-digest failed:', err);
  process.exit(1);
});
