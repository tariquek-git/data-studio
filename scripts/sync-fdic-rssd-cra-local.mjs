#!/usr/bin/env node
/**
 * Pull RSSD IDs and CRA ratings for FDIC institutions into the local warehouse.
 *
 * Source:
 *   FDIC BankFind institutions API
 *
 * Persists:
 * - entity_external_ids (rssd_id)
 * - entity_facts (cra_rating)
 */

import pg from 'pg';
import { getEnvValue, loadEnvLocal, stableUuid } from './_sync-utils.mjs';

const { Client } = pg;
const env = loadEnvLocal();

const FDIC_API = 'https://banks.data.fdic.gov/api';
const CRA_LABELS = {
  1: 'Outstanding',
  2: 'Satisfactory',
  3: 'Needs to Improve',
  4: 'Substantial Non-Compliance',
};

function connectionConfig() {
  const connectionString = getEnvValue(env, 'LOCAL_PG_URL');
  if (connectionString) return { connectionString };

  return {
    host: process.env.LOCAL_PG_HOST || getEnvValue(env, 'LOCAL_PG_HOST', 'localhost'),
    port: Number(process.env.LOCAL_PG_PORT || getEnvValue(env, 'LOCAL_PG_PORT', '5432')),
    database: process.env.LOCAL_PG_DB || getEnvValue(env, 'LOCAL_PG_DB', 'data_studio_local'),
    user: process.env.LOCAL_PG_USER || getEnvValue(env, 'LOCAL_PG_USER', undefined),
    password: process.env.LOCAL_PG_PASSWORD || getEnvValue(env, 'LOCAL_PG_PASSWORD', undefined),
  };
}

function formatDate(repdte) {
  if (!repdte || String(repdte).length !== 8) return String(repdte ?? '');
  const text = String(repdte);
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

function normalizeText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function externalIdId(entityId, idType, idValue) {
  return stableUuid(`external:${entityId}:${idType}:${idValue}`);
}

function factId(entityId, factKey, factValueText) {
  return stableUuid(`fact:institutions:${entityId}:regulatory:${factKey}:${factValueText ?? ''}`);
}

async function fetchLatestReportingDate() {
  const res = await fetch(
    `${FDIC_API}/financials?fields=REPDTE&sort_by=REPDTE&sort_order=DESC&limit=1`,
    { headers: { Accept: 'application/json' } }
  );
  if (!res.ok) {
    throw new Error(`Unable to fetch latest FDIC reporting date: HTTP ${res.status}`);
  }
  const json = await res.json();
  return json.data?.[0]?.data?.REPDTE ?? null;
}

async function fetchCraRows(reportingDate) {
  const fields = ['CERT', 'CRARA', 'CRADATE', 'RSSDID', 'INSTNAME', 'REPDTE'].join(',');
  const res = await fetch(
    `${FDIC_API}/financials?filters=REPDTE:${reportingDate}&fields=${fields}&limit=10000`,
    { headers: { Accept: 'application/json' } }
  );
  if (!res.ok) {
    throw new Error(`Unable to fetch FDIC CRA/RSSD data: HTTP ${res.status}`);
  }
  const json = await res.json();
  return (json.data ?? []).map((row) => row.data ?? {});
}

async function upsertExternalId(client, row) {
  await client.query(
    `
      INSERT INTO entity_external_ids (
        id, entity_table, entity_id, id_type, id_value, is_primary, source_url, notes
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (id) DO UPDATE SET
        id_value = EXCLUDED.id_value,
        is_primary = EXCLUDED.is_primary,
        source_url = EXCLUDED.source_url,
        notes = EXCLUDED.notes
    `,
    [
      row.id,
      row.entity_table,
      row.entity_id,
      row.id_type,
      row.id_value,
      row.is_primary,
      row.source_url,
      row.notes,
    ]
  );
}

async function upsertFact(client, row) {
  await client.query(
    `
      INSERT INTO entity_facts (
        id, entity_table, entity_id, fact_type, fact_key, fact_value_text,
        fact_value_number, fact_value_json, fact_unit, source_kind, source_url,
        observed_at, confidence_score, notes
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (id) DO UPDATE SET
        fact_value_text = EXCLUDED.fact_value_text,
        fact_value_number = EXCLUDED.fact_value_number,
        fact_value_json = EXCLUDED.fact_value_json,
        fact_unit = EXCLUDED.fact_unit,
        source_kind = EXCLUDED.source_kind,
        source_url = EXCLUDED.source_url,
        observed_at = EXCLUDED.observed_at,
        confidence_score = EXCLUDED.confidence_score,
        notes = EXCLUDED.notes
    `,
    [
      row.id,
      row.entity_table,
      row.entity_id,
      row.fact_type,
      row.fact_key,
      row.fact_value_text,
      row.fact_value_number,
      row.fact_value_json,
      row.fact_unit,
      row.source_kind,
      row.source_url,
      row.observed_at,
      row.confidence_score,
      row.notes,
    ]
  );
}

async function main() {
  const client = new Client(connectionConfig());
  await client.connect();

  try {
    const reportingDate = await fetchLatestReportingDate();
    if (!reportingDate) {
      throw new Error('FDIC API returned no latest reporting date');
    }

    const localInstitutions = await client.query(`
      SELECT id, cert_number
      FROM institutions
      WHERE source = 'fdic'
    `);
    const byCert = new Map(localInstitutions.rows.map((row) => [Number(row.cert_number), row]));

    const rows = await fetchCraRows(reportingDate);
    const observedAt = new Date().toISOString();
    let rssdUpserts = 0;
    let craUpserts = 0;
    let matched = 0;

    for (const row of rows) {
      const cert = Number(row.CERT);
      if (!Number.isFinite(cert)) continue;
      const institution = byCert.get(cert);
      if (!institution) continue;
      matched += 1;

      const rssdId = normalizeText(row.RSSDID);
      if (rssdId && rssdId !== '0') {
        rssdUpserts += 1;
        await upsertExternalId(client, {
          id: externalIdId(institution.id, 'rssd_id', rssdId),
          entity_table: 'institutions',
          entity_id: institution.id,
          id_type: 'rssd_id',
          id_value: rssdId,
          is_primary: false,
          source_url: 'https://banks.data.fdic.gov/api/institutions',
          notes: `FDIC institutions API ${formatDate(reportingDate)}`,
        });
      }

      const ratingCode = Number(row.CRARA);
      if (Number.isFinite(ratingCode) && ratingCode > 0) {
        craUpserts += 1;
        await upsertFact(client, {
          id: factId(institution.id, 'cra_rating', String(ratingCode)),
          entity_table: 'institutions',
          entity_id: institution.id,
          fact_type: 'regulatory',
          fact_key: 'cra_rating',
          fact_value_text: CRA_LABELS[ratingCode] ?? 'Unknown',
          fact_value_number: ratingCode,
          fact_value_json: {
            cert_number: cert,
            exam_date: normalizeText(row.CRADATE),
            reporting_period: formatDate(row.REPDTE),
          },
          fact_unit: null,
          source_kind: 'official',
          source_url: 'https://www.ffiec.gov/craratings/',
          observed_at: observedAt,
          confidence_score: 1,
          notes: `FDIC institutions API ${formatDate(reportingDate)}`,
        });
      }
    }

    const counts = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM entity_external_ids WHERE entity_table = 'institutions' AND id_type = 'rssd_id') AS rssd_ids,
        (SELECT COUNT(*) FROM entity_facts WHERE fact_key = 'cra_rating') AS cra_facts
    `);

    console.log(`FDIC RSSD/CRA local sync complete.
  reporting_date: ${formatDate(reportingDate)}
  matched_institutions: ${matched}
  rssd_upserts: ${rssdUpserts}
  cra_upserts: ${craUpserts}
  rssd_ids_total: ${counts.rows[0].rssd_ids}
  cra_facts_total: ${counts.rows[0].cra_facts}`);
  } catch (error) {
    console.error(`FDIC RSSD/CRA local sync failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
