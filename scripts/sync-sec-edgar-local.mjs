#!/usr/bin/env node
/**
 * Seed SEC EDGAR identifiers and public-company filing context into the local
 * warehouse for FDIC institutions that match the SEC company ticker universe.
 */

import pg from 'pg';
import { getEnvValue, loadEnvLocal, stableUuid } from './_sync-utils.mjs';

const { Client } = pg;
const env = loadEnvLocal();
const SEC_DOCS_URL = 'https://www.sec.gov/edgar/sec-api-documentation';
const SEC_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const USER_AGENT = 'DataStudio contact@fintechcommons.com';
const REQUEST_DELAY_MS = 250;

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

function normalizeName(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(bank|national association|n a|na|corp|corporation|inc|bancshares|holdings|holding company|company|financial|group)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function externalIdId(entityId, idType, idValue) {
  return stableUuid(`external:${entityId}:${idType}:${idValue}`);
}

function factId(entityId, factKey, factValueText) {
  return stableUuid(`fact:institutions:${entityId}:public_company:${factKey}:${factValueText ?? ''}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

function pickMatch(row, secMap) {
  const candidates = [row.holding_company, row.name].filter(Boolean);
  for (const candidate of candidates) {
    const match = secMap.get(normalizeName(candidate));
    if (match) return { ...match, matched_name: candidate };
  }
  return null;
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
    const tickerJson = await fetchJson(SEC_TICKERS_URL);
    const secMap = new Map();
    for (const item of Object.values(tickerJson)) {
      const key = normalizeName(item.title);
      if (key && !secMap.has(key)) secMap.set(key, item);
    }

    const { rows: institutions } = await client.query(`
      SELECT id, name, holding_company
      FROM institutions
      WHERE source = 'fdic'
    `);

    const matches = institutions
      .map((row) => ({ institution: row, match: pickMatch(row, secMap) }))
      .filter((row) => row.match);

    const observedAt = new Date().toISOString();
    const submissionsCache = new Map();
    let cikUpserts = 0;
    let tickerUpserts = 0;
    let companyFacts = 0;

    for (const { institution, match } of matches) {
      const paddedCik = String(match.cik_str).padStart(10, '0');
      const cik = String(match.cik_str);

      await upsertExternalId(client, {
        id: externalIdId(institution.id, 'cik', paddedCik),
        entity_table: 'institutions',
        entity_id: institution.id,
        id_type: 'cik',
        id_value: paddedCik,
        is_primary: false,
        source_url: SEC_DOCS_URL,
        notes: `Matched against SEC company_tickers.json using ${match.matched_name}`,
      });
      cikUpserts += 1;

      if (match.ticker) {
        await upsertExternalId(client, {
          id: externalIdId(institution.id, 'ticker', match.ticker),
          entity_table: 'institutions',
          entity_id: institution.id,
          id_type: 'ticker',
          id_value: match.ticker,
          is_primary: false,
          source_url: SEC_DOCS_URL,
          notes: `Matched against SEC company_tickers.json using ${match.matched_name}`,
        });
        tickerUpserts += 1;
      }

      if (!submissionsCache.has(paddedCik)) {
        try {
          const submissions = await fetchJson(`https://data.sec.gov/submissions/CIK${paddedCik}.json`);
          submissionsCache.set(paddedCik, submissions);
        } catch {
          submissionsCache.set(paddedCik, null);
        }
        await sleep(REQUEST_DELAY_MS);
      }

      const submissions = submissionsCache.get(paddedCik);
      const recentForms = [];
      if (submissions?.filings?.recent) {
        const forms = submissions.filings.recent.form ?? [];
        const filingDates = submissions.filings.recent.filingDate ?? [];
        const accessionNumbers = submissions.filings.recent.accessionNumber ?? [];

        for (let index = 0; index < forms.length && recentForms.length < 5; index += 1) {
          if (!['10-K', '10-Q', '20-F', '40-F', '8-K'].includes(forms[index])) continue;
          recentForms.push({
            form: forms[index],
            filing_date: filingDates[index] ?? null,
            accession_number: accessionNumbers[index] ?? null,
          });
        }
      }

      await upsertFact(client, {
        id: factId(institution.id, 'sec_company', paddedCik),
        entity_table: 'institutions',
        entity_id: institution.id,
        fact_type: 'public_company',
        fact_key: 'sec_company',
        fact_value_text: match.title,
        fact_value_number: null,
        fact_value_json: {
          cik: paddedCik,
          ticker: match.ticker ?? null,
          title: match.title,
          exchange: submissions?.exchanges?.[0] ?? null,
          matched_name: match.matched_name,
          recent_filings: recentForms,
        },
        fact_unit: null,
        source_kind: 'official',
        source_url: SEC_DOCS_URL,
        observed_at: observedAt,
        confidence_score: 0.8,
        notes: 'Exact normalized name match against SEC company_tickers.json',
      });
      companyFacts += 1;
    }

    const counts = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM entity_external_ids WHERE entity_table = 'institutions' AND id_type = 'cik') AS cik_ids,
        (SELECT COUNT(*) FROM entity_external_ids WHERE entity_table = 'institutions' AND id_type = 'ticker') AS ticker_ids,
        (SELECT COUNT(*) FROM entity_facts WHERE fact_key = 'sec_company') AS sec_company_facts
    `);

    console.log(`SEC EDGAR local sync complete.
  matched_institutions: ${matches.length}
  cik_upserts: ${cikUpserts}
  ticker_upserts: ${tickerUpserts}
  sec_company_facts_written: ${companyFacts}
  cik_ids_total: ${counts.rows[0].cik_ids}
  ticker_ids_total: ${counts.rows[0].ticker_ids}
  sec_company_facts_total: ${counts.rows[0].sec_company_facts}`);
  } catch (error) {
    console.error(`SEC EDGAR local sync failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
