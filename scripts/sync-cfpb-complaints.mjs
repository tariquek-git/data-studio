#!/usr/bin/env node
/**
 * CFPB consumer complaint signal sync.
 *
 * This loader intentionally avoids the massive bulk export and instead uses the
 * official CFPB search and trends APIs to map complaint signals onto entities
 * we can reasonably identify from names and aliases.
 *
 * Strategy:
 * - gather a practical candidate set from institutions and ecosystem entities
 * - suggest canonical CFPB company names from entity labels
 * - fetch complaint trend aggregates for each mapped company
 * - write sourced facts into entity_facts
 *
 * Supports:
 * - WRITE_TARGET=local_pg
 * - WRITE_TARGET=supabase
 * - DRY_RUN=1
 */

import {
  chunkArray,
  createSupabaseServiceClient,
  finishSyncJob,
  getEnvValue,
  loadEnvLocal,
  stableUuid,
  startSyncJob,
  tableExists,
  updateDataSourceSnapshot,
} from './_sync-utils.mjs';
import {
  batchUpsert,
  connectLocalPg,
  finishLocalSyncJob,
  localTableExists,
  startLocalSyncJob,
  updateLocalDataSourceSnapshot,
} from './_local-pg-write.mjs';

const env = loadEnvLocal();
const SOURCE_KEY = 'cfpb_complaints';
const SOURCE_URL = 'https://www.consumerfinance.gov/data-research/consumer-complaints/';
const SEARCH_API_URL = 'https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/';
const SUGGEST_API_URL = `${SEARCH_API_URL}_suggest_company`;
const TREND_API_URL = `${SEARCH_API_URL}trends`;
const WRITE_TARGET = /^(local|local_pg)$/i.test(process.env.WRITE_TARGET ?? '') ? 'local_pg' : 'supabase';
const DRY_RUN = /^(1|true|yes)$/i.test(process.env.DRY_RUN ?? '');
const ENTITY_LIMIT = Math.max(1, Number(process.env.CFPB_ENTITY_LIMIT ?? '120'));
const INSTITUTION_LIMIT = Math.max(1, Number(process.env.CFPB_INSTITUTION_LIMIT ?? '100'));
const ECOSYSTEM_LIMIT = Math.max(1, Number(process.env.CFPB_ECOSYSTEM_LIMIT ?? '40'));
const CONCURRENCY = Math.max(1, Number(process.env.CFPB_CONCURRENCY ?? '4'));
const TREND_DEPTH = Math.max(6, Number(process.env.CFPB_TREND_DEPTH ?? '12'));
let supabaseClient = null;

function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createSupabaseServiceClient(env);
  }
  return supabaseClient;
}

function normalizeText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function normalizeComparable(value) {
  if (value == null) return '';
  return String(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(
      /\b(bank|banks|company|companies|corp|corporation|inc|incorporated|llc|ltd|limited|co|holding|holdings|group|financial|na|n a|national association|trust|trust company|federal savings bank|fsb)\b/g,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value) {
  const normalized = normalizeComparable(value);
  return normalized ? normalized.split(' ').filter(Boolean) : [];
}

function isLikelyCompanyMatch(label, company) {
  const labelNorm = normalizeComparable(label);
  const companyNorm = normalizeComparable(company);
  if (!labelNorm || !companyNorm) return false;
  if (labelNorm === companyNorm) return true;
  if (labelNorm.includes(companyNorm) || companyNorm.includes(labelNorm)) return true;

  const labelTokens = new Set(tokenize(label));
  const companyTokens = new Set(tokenize(company));
  if (labelTokens.size === 0 || companyTokens.size === 0) return false;

  let overlap = 0;
  for (const token of labelTokens) {
    if (companyTokens.has(token)) overlap += 1;
  }

  return overlap > 0 && overlap / Math.min(labelTokens.size, companyTokens.size) >= 0.6;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'DataStudio/1.0',
      ...(options.headers ?? {}),
    },
    signal: options.signal,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`CFPB request failed (${response.status}): ${body.slice(0, 400)}`);
  }

  return response.json();
}

async function fetchCompanySuggestions(label) {
  const url = `${SUGGEST_API_URL}?text=${encodeURIComponent(label)}&size=5`;
  const payload = await fetchJson(url);
  return Array.isArray(payload) ? payload : [];
}

async function fetchComplaintTrends(company) {
  const params = new URLSearchParams({
    company,
    lens: 'overview',
    trend_interval: 'month',
    trend_depth: String(TREND_DEPTH),
    size: '0',
  });
  const url = `${TREND_API_URL}?${params.toString()}`;
  const payload = await fetchJson(url);

  const buckets = payload?.aggregations?.dateRangeBrush?.dateRangeBrush?.buckets ?? [];
  const products = payload?.aggregations?.product?.product?.buckets ?? [];
  const issues = payload?.aggregations?.issue?.issue?.buckets ?? [];
  const tags = payload?.aggregations?.tags?.tags?.buckets ?? [];
  const total = Number(payload?.hits?.total?.value ?? 0);
  const recentBuckets = buckets.slice(-TREND_DEPTH);
  const recent12mTotal = recentBuckets.reduce((sum, bucket) => sum + Number(bucket?.doc_count ?? 0), 0);
  const previous12mTotal = buckets.slice(-TREND_DEPTH * 2, -TREND_DEPTH).reduce((sum, bucket) => sum + Number(bucket?.doc_count ?? 0), 0);
  const latestBucket = buckets[buckets.length - 1] ?? null;
  const previousBucket = buckets[buckets.length - 2] ?? null;
  const topProducts = products.slice(0, 3).map((bucket) => ({
    label: bucket.key,
    count: Number(bucket.doc_count ?? 0),
  }));
  const topIssues = issues.slice(0, 3).map((bucket) => ({
    label: bucket.key,
    count: Number(bucket.doc_count ?? 0),
  }));
  const topTags = tags.slice(0, 3).map((bucket) => ({
    label: bucket.key,
    count: Number(bucket.doc_count ?? 0),
  }));

  return {
    company,
    total,
    recent12mTotal,
    previous12mTotal,
    change12m: recent12mTotal - previous12mTotal,
    latestMonth: latestBucket?.key_as_string ?? null,
    latestMonthCount: Number(latestBucket?.doc_count ?? 0),
    previousMonthCount: Number(previousBucket?.doc_count ?? 0),
    monthlyBuckets: recentBuckets.map((bucket) => ({
      period: bucket.key_as_string,
      count: Number(bucket.doc_count ?? 0),
    })),
    topProducts,
    topIssues,
    topTags,
    sourceUrl: url,
  };
}

function complaintRowsForEntity(entity, companySummary, label) {
  const observedAt = new Date().toISOString();
  const baseSeed = `${entity.entity_table}:${entity.entity_id}:${companySummary.company}:${companySummary.latestMonth ?? 'unknown'}`;
  const commonJson = {
    mapped_company: companySummary.company,
    matched_label: label,
    all_time_total: companySummary.total,
    recent_12m_total: companySummary.recent12mTotal,
    previous_12m_total: companySummary.previous12mTotal,
    change_12m: companySummary.change12m,
    latest_month: companySummary.latestMonth,
    latest_month_count: companySummary.latestMonthCount,
    previous_month_count: companySummary.previousMonthCount,
    monthly_buckets: companySummary.monthlyBuckets,
    top_products: companySummary.topProducts,
    top_issues: companySummary.topIssues,
    top_tags: companySummary.topTags,
  };

  const topProduct = companySummary.topProducts[0]?.label ?? null;
  const topIssue = companySummary.topIssues[0]?.label ?? null;

  return [
    {
      id: stableUuid(`fact:${baseSeed}:total`),
      entity_table: entity.entity_table,
      entity_id: entity.entity_id,
      fact_type: 'complaint_signal',
      fact_key: 'cfpb_complaints_total',
      fact_value_text: `${companySummary.total.toLocaleString()} total CFPB complaints`,
      fact_value_number: companySummary.total,
      fact_value_json: commonJson,
      fact_unit: 'complaints',
      source_kind: 'official',
      source_url: companySummary.sourceUrl,
      observed_at: observedAt,
      confidence_score: entity.confidence_score,
      notes: `CFPB company suggestion matched from ${label}`,
    },
    {
      id: stableUuid(`fact:${baseSeed}:recent_12m`),
      entity_table: entity.entity_table,
      entity_id: entity.entity_id,
      fact_type: 'complaint_signal',
      fact_key: 'cfpb_complaints_recent_12m_total',
      fact_value_text: `${companySummary.recent12mTotal.toLocaleString()} complaints in the most recent 12 months`,
      fact_value_number: companySummary.recent12mTotal,
      fact_value_json: commonJson,
      fact_unit: 'complaints',
      source_kind: 'official',
      source_url: companySummary.sourceUrl,
      observed_at: observedAt,
      confidence_score: entity.confidence_score,
      notes: `CFPB company suggestion matched from ${label}`,
    },
    {
      id: stableUuid(`fact:${baseSeed}:summary`),
      entity_table: entity.entity_table,
      entity_id: entity.entity_id,
      fact_type: 'complaint_signal',
      fact_key: 'cfpb_complaints_summary',
      fact_value_text:
        `${companySummary.company}: ${companySummary.total.toLocaleString()} total complaints, ` +
        `${companySummary.recent12mTotal.toLocaleString()} in the recent 12 months` +
        (topIssue ? `, top issue "${topIssue}"` : '') +
        (topProduct ? `, top product "${topProduct}"` : '') +
        (companySummary.latestMonth ? `, latest month ${companySummary.latestMonth} (${companySummary.latestMonthCount.toLocaleString()})` : ''),
      fact_value_number: null,
      fact_value_json: {
        ...commonJson,
        top_product: topProduct,
        top_issue: topIssue,
      },
      fact_unit: null,
      source_kind: 'official',
      source_url: companySummary.sourceUrl,
      observed_at: observedAt,
      confidence_score: entity.confidence_score,
      notes: `CFPB company suggestion matched from ${label}`,
    },
  ];
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = [];
  let cursor = 0;

  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      results[index] = await worker(item, index);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results.filter((value) => value != null);
}

async function loadLocalCandidates(client) {
  const institutionRows = await client.query(
    `
      SELECT id, source, name, legal_name, holding_company, total_assets, active
      FROM institutions
      WHERE source IN ('fdic', 'ncua', 'osfi') AND active IS DISTINCT FROM false
      ORDER BY total_assets DESC NULLS LAST, name ASC
      LIMIT $1
    `,
    [INSTITUTION_LIMIT]
  );

  const ecosystemRows = await client.query(
    `
      SELECT id, source_key, name, legal_name, parent_name, business_model, entity_type, active, status, confidence_score
      FROM ecosystem_entities
      ORDER BY confidence_score DESC NULLS LAST, name ASC
      LIMIT $1
    `,
    [ECOSYSTEM_LIMIT]
  );

  return [
    ...institutionRows.rows.map((row) => ({
      entity_table: 'institutions',
      entity_id: row.id,
      primary_label: row.name,
      labels: [row.name, row.legal_name, row.holding_company].map(normalizeText).filter(Boolean),
      source_label: row.name,
      confidence_score: row.active === false ? 0.4 : 0.85,
    })),
    ...ecosystemRows.rows.map((row) => ({
      entity_table: 'ecosystem_entities',
      entity_id: row.id,
      primary_label: row.name,
      labels: [row.name, row.legal_name, row.parent_name].map(normalizeText).filter(Boolean),
      source_label: row.name,
      confidence_score: row.active === false ? 0.45 : Number(row.confidence_score ?? 0.7),
    })),
  ];
}

async function loadSupabaseCandidates() {
  const supabase = getSupabaseClient();
  const institutionRows = await supabase
    .from('institutions')
    .select('id, source, name, legal_name, holding_company, total_assets, active')
    .in('source', ['fdic', 'ncua', 'osfi'])
    .order('total_assets', { ascending: false })
    .order('name', { ascending: true })
    .limit(INSTITUTION_LIMIT);

  if (institutionRows.error) {
    throw new Error(`Unable to load institutions for CFPB complaints sync: ${institutionRows.error.message}`);
  }

  const ecosystemRows = await supabase
    .from('ecosystem_entities')
    .select('id, source_key, name, legal_name, parent_name, business_model, entity_type, active, status, confidence_score')
    .order('confidence_score', { ascending: false })
    .order('name', { ascending: true })
    .limit(ECOSYSTEM_LIMIT);

  if (ecosystemRows.error) {
    throw new Error(`Unable to load ecosystem entities for CFPB complaints sync: ${ecosystemRows.error.message}`);
  }

  return [
    ...((institutionRows.data ?? []).map((row) => ({
      entity_table: 'institutions',
      entity_id: row.id,
      primary_label: row.name,
      labels: [row.name, row.legal_name, row.holding_company].map(normalizeText).filter(Boolean),
      source_label: row.name,
      confidence_score: row.active === false ? 0.4 : 0.85,
    }))),
    ...((ecosystemRows.data ?? []).map((row) => ({
      entity_table: 'ecosystem_entities',
      entity_id: row.id,
      primary_label: row.name,
      labels: [row.name, row.legal_name, row.parent_name].map(normalizeText).filter(Boolean),
      source_label: row.name,
      confidence_score: row.active === false ? 0.45 : Number(row.confidence_score ?? 0.7),
    }))),
  ];
}

async function resolveComplaintMappings(candidates) {
  const suggestionCache = new Map();
  const companyToEntities = new Map();

  await mapWithConcurrency(candidates, CONCURRENCY, async (candidate) => {
    let match = null;
    let matchLabel = null;

    for (const label of candidate.labels) {
      if (!label) continue;
      const cacheKey = label.toLowerCase();
      const suggestions = suggestionCache.has(cacheKey)
        ? suggestionCache.get(cacheKey)
        : await fetchCompanySuggestions(label);

      if (!suggestionCache.has(cacheKey)) {
        suggestionCache.set(cacheKey, suggestions);
      }

      const canonical = Array.isArray(suggestions) ? suggestions.find((suggestion) => isLikelyCompanyMatch(label, suggestion)) : null;
      if (canonical) {
        match = canonical;
        matchLabel = label;
        break;
      }
    }

    if (!match) return null;

    const resolved = {
      ...candidate,
      company: match,
      matched_label: matchLabel,
    };
    const list = companyToEntities.get(match) ?? [];
    list.push(resolved);
    companyToEntities.set(match, list);
    return resolved;
  });

  return { companyToEntities };
}

async function writeLocal(client, rows, entityCount, latestAsOf) {
  let jobId = null;

  try {
    const exists = await localTableExists(client, 'entity_facts');
    if (!exists) {
      throw new Error('entity_facts table is missing in local Postgres');
    }

    jobId = await startLocalSyncJob(client, SOURCE_KEY);

    await batchUpsert(
      client,
      'entity_facts',
      [
        'id',
        'entity_table',
        'entity_id',
        'fact_type',
        'fact_key',
        'fact_value_text',
        'fact_value_number',
        'fact_value_json',
        'fact_unit',
        'source_kind',
        'source_url',
        'observed_at',
        'confidence_score',
        'notes',
      ],
      ['id'],
      rows
    );

    await updateLocalDataSourceSnapshot(client, SOURCE_KEY, {
      status: 'active',
      last_synced_at: new Date().toISOString(),
      data_as_of: latestAsOf,
      institution_count: entityCount,
      notes: 'Practical CFPB complaints trend loader using official company suggestions and monthly aggregates.',
    });

    await finishLocalSyncJob(client, jobId, {
      status: 'completed',
      records_processed: rows.length,
    });
  } catch (error) {
    await finishLocalSyncJob(client, jobId, {
      status: 'failed',
      error: error.message,
    });
    throw error;
  } finally {
    // Caller owns the local client lifecycle.
  }
}

async function writeSupabase(rows, entityCount, latestAsOf) {
  const supabase = getSupabaseClient();
  const hasFactsTable = await tableExists(supabase, 'entity_facts');
  if (!hasFactsTable) {
    throw new Error('entity_facts table is missing or not visible in Supabase');
  }

  let jobId = null;

  try {
    jobId = await startSyncJob(supabase, SOURCE_KEY);

    for (const batch of chunkArray(rows, 250)) {
      const { error } = await supabase.from('entity_facts').upsert(batch, { onConflict: 'id' });
      if (error) {
        throw new Error(`Unable to upsert CFPB complaint facts: ${error.message}`);
      }
    }

    await updateDataSourceSnapshot(supabase, SOURCE_KEY, {
      status: 'active',
      last_synced_at: new Date().toISOString(),
      data_as_of: latestAsOf,
      institution_count: entityCount,
      notes: 'Practical CFPB complaints trend loader using official company suggestions and monthly aggregates.',
    });

    await finishSyncJob(supabase, jobId, {
      status: 'completed',
      records_processed: rows.length,
    });
  } catch (error) {
    await finishSyncJob(supabase, jobId, {
      status: 'failed',
      error: error.message,
    });
    throw error;
  }
}

async function main() {
  console.log(`Starting CFPB complaints sync with target=${WRITE_TARGET}, dry_run=${DRY_RUN ? 'yes' : 'no'}...`);

  const localClient = WRITE_TARGET === 'local_pg' ? await connectLocalPg() : null;

  let candidates;
  try {
    candidates =
      WRITE_TARGET === 'local_pg'
        ? await loadLocalCandidates(localClient)
        : await loadSupabaseCandidates();

    const { companyToEntities } = await resolveComplaintMappings(candidates);
    const resolvedCompanies = [...companyToEntities.keys()].slice(0, ENTITY_LIMIT);
    const selectedEntityCount = new Set(
      resolvedCompanies.flatMap((company) =>
        (companyToEntities.get(company) ?? []).map((entity) => `${entity.entity_table}:${entity.entity_id}`)
      )
    ).size;

    if (resolvedCompanies.length === 0) {
      console.log('No company matches were found for CFPB complaint sync.');
      return;
    }

    console.log(`Resolved ${resolvedCompanies.length.toLocaleString()} complaint companies from ${selectedEntityCount.toLocaleString()} mapped entities.`);

    const companySummaries = await mapWithConcurrency(resolvedCompanies, CONCURRENCY, async (company) => {
      const summary = await fetchComplaintTrends(company);
      return summary.total > 0 ? summary : null;
    });

    const rows = [];
    let latestAsOf = null;

    for (const summary of companySummaries) {
      if (!summary) continue;
      latestAsOf = summary.latestMonth ?? latestAsOf;
      const mappedEntities = companyToEntities.get(summary.company) ?? [];

      for (const entity of mappedEntities) {
        rows.push(...complaintRowsForEntity(entity, summary, entity.matched_label ?? entity.primary_label));
      }
    }

    if (rows.length === 0) {
      console.log('CFPB trends produced no complaint facts to write.');
      return;
    }

    console.log(
      `Prepared ${rows.length.toLocaleString()} complaint fact rows for ${companySummaries.length.toLocaleString()} companies ` +
        `across ${selectedEntityCount.toLocaleString()} mapped entities.`
    );

    if (DRY_RUN) {
      console.log('Dry run enabled, skipping database writes.');
      return;
    }

    if (WRITE_TARGET === 'local_pg') {
      const exists = await localTableExists(localClient, 'entity_facts');
      if (!exists) {
        throw new Error('entity_facts table is missing in local Postgres');
      }
      await writeLocal(localClient, rows, selectedEntityCount, latestAsOf);
    } else {
      await writeSupabase(rows, selectedEntityCount, latestAsOf);
    }

    console.log(`CFPB complaints sync complete. Wrote ${rows.length.toLocaleString()} rows to ${WRITE_TARGET}. Latest as-of: ${latestAsOf ?? 'unknown'}.`);
  } finally {
    if (localClient) {
      await localClient.end();
    }
  }
}

main().catch((error) => {
  console.error(`CFPB complaints sync failed: ${error.message}`);
  process.exit(1);
});
