#!/usr/bin/env node
/**
 * Seed sponsor-bank / BaaS ecosystem data into the local warehouse.
 *
 * Uses the curated sponsor-bank seed list that already powers the Fed master
 * account capability sync and turns it into:
 * - bank_capabilities rows
 * - sponsor_bank institution tags/facts
 * - ecosystem_entities for fintech/program partners
 * - entity_relationships linking sponsor banks to partners
 */

import pg from 'pg';
import { getEnvValue, loadEnvLocal, stableUuid } from './_sync-utils.mjs';
import {
  FED_MASTER_ACCOUNT_PAGE_URL,
  FED_MASTER_ACCOUNT_URL,
  SPONSOR_BANK_SEEDS,
} from './_sponsor-bank-seeds.mjs';

const { Client } = pg;
const env = loadEnvLocal();
const SOURCE_NOTE = 'Curated sponsor-bank and embedded-finance ecosystem seed';
const SOURCE_AUTHORITY = 'Curated Sponsor Bank Research';
const SOURCE_URLS = [FED_MASTER_ACCOUNT_URL, FED_MASTER_ACCOUNT_PAGE_URL];

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
    .replace(/\b(national association|n a|na|bank|credit union|trust company|trust co|federal savings bank|fsb|inc|corp|corporation|llc|ltd)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function ecosystemEntityId(name) {
  return stableUuid(`ecosystem:curated:${name.toLowerCase()}`);
}

function relationshipId(fromId, toId, type) {
  return stableUuid(`relationship:${fromId}:${toId}:${type}`);
}

function tagId(entityTable, entityId, tagKey, tagValue) {
  return stableUuid(`tag:${entityTable}:${entityId}:${tagKey}:${tagValue}`);
}

function factId(entityTable, entityId, factType, factKey, factValueText) {
  return stableUuid(`fact:${entityTable}:${entityId}:${factType}:${factKey}:${factValueText ?? ''}`);
}

function buildInstitutionMatcher(institutions) {
  const byCert = new Map();
  const byNormalizedName = new Map();

  for (const institution of institutions) {
    byCert.set(Number(institution.cert_number), institution);
    const normalized = normalizeName(institution.name);
    if (!byNormalizedName.has(normalized)) {
      byNormalizedName.set(normalized, institution);
    }
  }

  return {
    byCert,
    byNormalizedName,
    find(seed) {
      if (seed.cert && byCert.has(seed.cert)) return byCert.get(seed.cert);

      const normalized = normalizeName(seed.name);
      const exact = byNormalizedName.get(normalized);
      if (exact) return exact;

      return institutions.find((institution) => {
        const candidate = normalizeName(institution.name);
        return candidate.includes(normalized) || normalized.includes(candidate);
      }) ?? null;
    },
  };
}

async function upsertBankCapability(client, certNumber, seed, nowIso) {
  await client.query(
    `
      INSERT INTO bank_capabilities (
        cert_number,
        fed_master_account,
        fedwire_participant,
        nacha_odfi,
        nacha_rdfi,
        swift_member,
        visa_principal,
        mastercard_principal,
        amex_issuer,
        issues_credit_cards,
        issues_debit_cards,
        issues_prepaid,
        issues_commercial_cards,
        baas_platform,
        baas_partners,
        card_program_manager,
        treasury_management,
        sweep_accounts,
        lockbox_services,
        data_source,
        confidence,
        notes,
        source_urls,
        verified_at,
        updated_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
      )
      ON CONFLICT (cert_number) DO UPDATE SET
        fed_master_account = EXCLUDED.fed_master_account,
        fedwire_participant = EXCLUDED.fedwire_participant,
        nacha_odfi = EXCLUDED.nacha_odfi,
        nacha_rdfi = EXCLUDED.nacha_rdfi,
        swift_member = EXCLUDED.swift_member,
        visa_principal = EXCLUDED.visa_principal,
        mastercard_principal = EXCLUDED.mastercard_principal,
        amex_issuer = EXCLUDED.amex_issuer,
        issues_credit_cards = EXCLUDED.issues_credit_cards,
        issues_debit_cards = EXCLUDED.issues_debit_cards,
        issues_prepaid = EXCLUDED.issues_prepaid,
        issues_commercial_cards = EXCLUDED.issues_commercial_cards,
        baas_platform = EXCLUDED.baas_platform,
        baas_partners = EXCLUDED.baas_partners,
        card_program_manager = EXCLUDED.card_program_manager,
        treasury_management = EXCLUDED.treasury_management,
        sweep_accounts = EXCLUDED.sweep_accounts,
        lockbox_services = EXCLUDED.lockbox_services,
        data_source = EXCLUDED.data_source,
        confidence = EXCLUDED.confidence,
        notes = EXCLUDED.notes,
        source_urls = EXCLUDED.source_urls,
        verified_at = EXCLUDED.verified_at,
        updated_at = EXCLUDED.updated_at
    `,
    [
      certNumber,
      seed.fed_master_account ?? true,
      seed.fedwire_participant ?? null,
      seed.nacha_odfi ?? null,
      true,
      seed.swift_member ?? null,
      seed.visa_principal ?? null,
      seed.mastercard_principal ?? null,
      seed.amex_issuer ?? null,
      seed.issues_credit_cards ?? null,
      seed.issues_debit_cards ?? null,
      seed.issues_prepaid ?? null,
      seed.issues_commercial_cards ?? null,
      seed.baas_platform ?? null,
      seed.baas_partners ?? null,
      seed.card_program_manager ?? null,
      null,
      null,
      null,
      'manual',
      'medium',
      seed.notes ?? null,
      SOURCE_URLS,
      nowIso,
      nowIso,
    ]
  );
}

async function upsertTag(client, row) {
  await client.query(
    `
      INSERT INTO entity_tags (
        id, entity_table, entity_id, tag_key, tag_value, source_kind, source_url,
        confidence_score, effective_start, effective_end, notes
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (id) DO UPDATE SET
        tag_value = EXCLUDED.tag_value,
        source_kind = EXCLUDED.source_kind,
        source_url = EXCLUDED.source_url,
        confidence_score = EXCLUDED.confidence_score,
        effective_start = EXCLUDED.effective_start,
        effective_end = EXCLUDED.effective_end,
        notes = EXCLUDED.notes
    `,
    [
      row.id,
      row.entity_table,
      row.entity_id,
      row.tag_key,
      row.tag_value,
      row.source_kind,
      row.source_url,
      row.confidence_score,
      row.effective_start,
      row.effective_end,
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

async function upsertEcosystemEntity(client, row) {
  await client.query(
    `
      INSERT INTO ecosystem_entities (
        id, source_key, source_authority, name, legal_name, entity_type,
        business_model, active, status, country, city, state, website,
        description, parent_name, confidence_score, raw_data, data_as_of,
        last_synced_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      ON CONFLICT (id) DO UPDATE SET
        source_key = EXCLUDED.source_key,
        source_authority = EXCLUDED.source_authority,
        name = EXCLUDED.name,
        legal_name = EXCLUDED.legal_name,
        entity_type = EXCLUDED.entity_type,
        business_model = EXCLUDED.business_model,
        active = EXCLUDED.active,
        status = EXCLUDED.status,
        country = EXCLUDED.country,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        website = EXCLUDED.website,
        description = EXCLUDED.description,
        parent_name = EXCLUDED.parent_name,
        confidence_score = EXCLUDED.confidence_score,
        raw_data = EXCLUDED.raw_data,
        data_as_of = EXCLUDED.data_as_of,
        last_synced_at = EXCLUDED.last_synced_at
    `,
    [
      row.id,
      row.source_key,
      row.source_authority,
      row.name,
      row.legal_name,
      row.entity_type,
      row.business_model,
      row.active,
      row.status,
      row.country,
      row.city,
      row.state,
      row.website,
      row.description,
      row.parent_name,
      row.confidence_score,
      row.raw_data,
      row.data_as_of,
      row.last_synced_at,
    ]
  );
}

async function upsertRelationship(client, row) {
  await client.query(
    `
      INSERT INTO entity_relationships (
        id, from_entity_table, from_entity_id, to_entity_table, to_entity_id,
        relationship_type, relationship_label, active, effective_start,
        effective_end, source_kind, source_url, confidence_score, notes, raw_data
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (id) DO UPDATE SET
        relationship_label = EXCLUDED.relationship_label,
        active = EXCLUDED.active,
        effective_start = EXCLUDED.effective_start,
        effective_end = EXCLUDED.effective_end,
        source_kind = EXCLUDED.source_kind,
        source_url = EXCLUDED.source_url,
        confidence_score = EXCLUDED.confidence_score,
        notes = EXCLUDED.notes,
        raw_data = EXCLUDED.raw_data
    `,
    [
      row.id,
      row.from_entity_table,
      row.from_entity_id,
      row.to_entity_table,
      row.to_entity_id,
      row.relationship_type,
      row.relationship_label,
      row.active,
      row.effective_start,
      row.effective_end,
      row.source_kind,
      row.source_url,
      row.confidence_score,
      row.notes,
      row.raw_data,
    ]
  );
}

async function main() {
  const client = new Client(connectionConfig());
  const nowIso = new Date().toISOString();

  await client.connect();

  try {
    const { rows: institutions } = await client.query(`
      SELECT id, cert_number, name, state
      FROM institutions
      WHERE active IS DISTINCT FROM false
    `);

    const matcher = buildInstitutionMatcher(institutions);
    let matchedBanks = 0;
    let skippedBanks = 0;
    let capabilityRows = 0;
    let ecosystemRows = 0;
    let relationshipRows = 0;

    for (const seed of SPONSOR_BANK_SEEDS) {
      const institution = matcher.find(seed);
      if (!institution) {
        skippedBanks += 1;
        continue;
      }

      matchedBanks += 1;
      capabilityRows += 1;

      await upsertBankCapability(client, institution.cert_number, seed, nowIso);

      await upsertTag(client, {
        id: tagId('institutions', institution.id, 'business_role', 'sponsor_bank'),
        entity_table: 'institutions',
        entity_id: institution.id,
        tag_key: 'business_role',
        tag_value: 'sponsor_bank',
        source_kind: 'curated',
        source_url: FED_MASTER_ACCOUNT_PAGE_URL,
        confidence_score: 0.75,
        effective_start: null,
        effective_end: null,
        notes: SOURCE_NOTE,
      });

      const capabilityFacts = [
        ['baas_platform', seed.baas_platform],
        ['fed_master_account', seed.fed_master_account],
        ['fedwire_participant', seed.fedwire_participant],
        ['visa_principal', seed.visa_principal],
        ['mastercard_principal', seed.mastercard_principal],
        ['issues_credit_cards', seed.issues_credit_cards],
        ['issues_debit_cards', seed.issues_debit_cards],
        ['issues_prepaid', seed.issues_prepaid],
      ];

      for (const [factKey, factValue] of capabilityFacts) {
        if (factValue == null) continue;
        await upsertFact(client, {
          id: factId('institutions', institution.id, 'capability', factKey, String(Boolean(factValue))),
          entity_table: 'institutions',
          entity_id: institution.id,
          fact_type: 'capability',
          fact_key: factKey,
          fact_value_text: String(Boolean(factValue)),
          fact_value_number: null,
          fact_value_json: null,
          fact_unit: null,
          source_kind: 'curated',
          source_url: FED_MASTER_ACCOUNT_PAGE_URL,
          observed_at: nowIso,
          confidence_score: 0.75,
          notes: SOURCE_NOTE,
        });
      }

      await upsertFact(client, {
        id: factId('institutions', institution.id, 'capability', 'baas_partners', normalizeText(seed.notes)),
        entity_table: 'institutions',
        entity_id: institution.id,
        fact_type: 'capability',
        fact_key: 'baas_partners',
        fact_value_text: String((seed.baas_partners ?? []).length),
        fact_value_number: (seed.baas_partners ?? []).length,
        fact_value_json: {
          partners: seed.baas_partners ?? [],
          note: seed.notes ?? null,
        },
        fact_unit: 'partners',
        source_kind: 'curated',
        source_url: FED_MASTER_ACCOUNT_PAGE_URL,
        observed_at: nowIso,
        confidence_score: 0.75,
        notes: SOURCE_NOTE,
      });

      for (const partner of seed.baas_partners ?? []) {
        const ecosystemId = ecosystemEntityId(partner);
        ecosystemRows += 1;
        relationshipRows += 1;

        await upsertEcosystemEntity(client, {
          id: ecosystemId,
          source_key: 'curated',
          source_authority: SOURCE_AUTHORITY,
          name: partner,
          legal_name: null,
          entity_type: 'ecosystem_company',
          business_model: 'embedded_finance_partner',
          active: true,
          status: 'active',
          country: 'US',
          city: null,
          state: null,
          website: null,
          description: `${partner} is tracked as a partner in the curated sponsor-bank seed graph.`,
          parent_name: null,
          confidence_score: 0.65,
          raw_data: {
            partner_name: partner,
            sponsor_bank: institution.name,
            source_seed_name: seed.name,
          },
          data_as_of: nowIso.slice(0, 10),
          last_synced_at: nowIso,
        });

        await upsertRelationship(client, {
          id: relationshipId(institution.id, ecosystemId, 'sponsor_bank_for'),
          from_entity_table: 'institutions',
          from_entity_id: institution.id,
          to_entity_table: 'ecosystem_entities',
          to_entity_id: ecosystemId,
          relationship_type: 'sponsor_bank_for',
          relationship_label: 'Sponsor bank for',
          active: true,
          effective_start: null,
          effective_end: null,
          source_kind: 'curated',
          source_url: FED_MASTER_ACCOUNT_PAGE_URL,
          confidence_score: 0.65,
          notes: seed.notes ?? SOURCE_NOTE,
          raw_data: {
            sponsor_bank_cert: institution.cert_number,
            sponsor_seed_name: seed.name,
          },
        });
      }
    }

    const counts = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM bank_capabilities) AS bank_capabilities,
        (SELECT COUNT(*) FROM ecosystem_entities) AS ecosystem_entities,
        (SELECT COUNT(*) FROM entity_relationships) AS entity_relationships
    `);

    console.log(`Sponsor ecosystem local sync complete.
  matched_banks: ${matchedBanks}
  skipped_banks: ${skippedBanks}
  capability_rows_written: ${capabilityRows}
  ecosystem_entity_rows_touched: ${ecosystemRows}
  relationship_rows_touched: ${relationshipRows}
  bank_capabilities_total: ${counts.rows[0].bank_capabilities}
  ecosystem_entities_total: ${counts.rows[0].ecosystem_entities}
  entity_relationships_total: ${counts.rows[0].entity_relationships}`);
  } catch (error) {
    console.error(`Sponsor ecosystem local sync failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
