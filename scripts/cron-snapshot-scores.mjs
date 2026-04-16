#!/usr/bin/env node
/**
 * cron-snapshot-scores.mjs
 *
 * Takes a weekly snapshot of Brim Fit scores for all active institutions.
 * Calls the SQL function `snapshot_all_scores()` which runs compute_brim_score()
 * for every active institution and upserts into score_snapshots.
 *
 * This enables:
 *   - Tier change detection (week-over-week comparisons)
 *   - Score volatility tracking
 *   - Weekly Slack digest of tier upgrades/downgrades
 *   - Historical audit trail
 *
 * Idempotent: re-running on the same day updates existing rows.
 *
 * Run: node scripts/cron-snapshot-scores.mjs [--date YYYY-MM-DD]
 */

import {
  createSupabaseServiceClient,
  loadEnvLocal,
  startSyncJob,
  finishSyncJob,
} from './_sync-utils.mjs';

const env = loadEnvLocal();
const supabase = createSupabaseServiceClient(env);

// Allow overriding snapshot date for backfills
const dateArg = process.argv.find((_, i, arr) => arr[i - 1] === '--date');
const snapshotDate = dateArg || new Date().toISOString().split('T')[0];

async function main() {
  console.log(`=== cron-snapshot-scores.mjs ===`);
  console.log(`Snapshot date: ${snapshotDate}`);

  const jobId = await startSyncJob(supabase, 'cron-snapshot-scores');

  try {
    // Call the SQL function that does all the heavy lifting
    const { data, error } = await supabase.rpc('snapshot_all_scores', {
      p_snapshot_date: snapshotDate,
    });

    if (error) throw new Error(`snapshot_all_scores failed: ${error.message}`);

    const count = data;
    console.log(`Snapshotted ${count} institutions`);

    // Report tier distribution for this snapshot
    const { data: dist, error: distErr } = await supabase
      .from('score_snapshots')
      .select('tier')
      .eq('snapshot_date', snapshotDate);

    if (!distErr && dist) {
      const tiers = {};
      for (const row of dist) {
        tiers[row.tier] = (tiers[row.tier] || 0) + 1;
      }
      console.log('Tier distribution:', JSON.stringify(tiers));
    }

    // Detect tier changes vs previous snapshot
    const { data: changes, error: changeErr } = await supabase.rpc('detect_tier_changes', {
      p_current_date: snapshotDate,
    });

    if (!changeErr && changes && changes.length > 0) {
      console.log(`\n${changes.length} tier changes detected:`);
      for (const c of changes.slice(0, 20)) {
        console.log(`  ${c.name}: ${c.prev_tier} → ${c.new_tier} (score ${c.prev_score} → ${c.new_score})`);
      }
      if (changes.length > 20) console.log(`  ... and ${changes.length - 20} more`);
    } else if (!changeErr) {
      console.log('No tier changes detected (or no previous snapshot to compare)');
    }

    await finishSyncJob(supabase, jobId, {
      status: 'completed',
      records_processed: count,
    });
  } catch (err) {
    console.error('Snapshot failed:', err.message);
    await finishSyncJob(supabase, jobId, {
      status: 'failed',
      error: err.message,
    });
    process.exit(1);
  }
}

main();
