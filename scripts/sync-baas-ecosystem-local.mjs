#!/usr/bin/env node
/**
 * Seed sponsor-bank / embedded-banking ecosystem data into the local Postgres sandbox.
 *
 * This script uses the curated sponsor-bank seed list to populate:
 * - bank_capabilities
 * - ecosystem_entities
 * - entity_relationships
 * - entity_tags
 * - entity_facts
 *
 * Run:
 *   node scripts/sync-baas-ecosystem-local.mjs
 */

import pg from 'pg';
import {
  getEnvValue,
  loadEnvLocal,
  stableUuid,
} from './_sync-utils.mjs';
import {
  FED_MASTER_ACCOUNT_PAGE_URL,
  FED_MASTER_ACCOUNT_URL,
  SPONSOR_BANK_SEEDS,
} from './_sponsor-bank-seeds.mjs';

const { Client } = pg;
const env = loadEnvLocal();
const LOCAL_NOTE = 'Curated sponsor-bank ecosystem seed';
const LOCAL_SOURCE_SCRIPT = 'sync-baas-ecosystem-local';

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
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(na|n a|national association|bank|inc|llc|corp|corporation|co|company|dba)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function inferBusinessModel(name) {
  const value = String(name).toLowerCase();

  if (['stripe', 'paypal', 'venmo', 'cash app', 'sila money'].some((token) => value.includes(token))) {
    return 'payments_fintech';
  }

  if (['coinbase'].some((token) => value.includes(token))) {
    return 'crypto_fintech';
  }

  if (['affirm', 'upstart', 'lendingclub', 'prosper', 'kabbage', 'oppfi', 'elevate', 'avant'].some((token) => value.includes(token))) {
    return 'lending_fintech';
  }

  if (['chime', 'acorns', 'step', 'stash', 'dave'].some((token) => value.includes(token))) {
    return 'consumer_fintech';
  }

  if (['finxact'].some((token) => value.includes(token))) {
    return 'banking_infrastructure';
  }

  return 'fintech';
}

function ecosystemEntityRow(partnerName, seedBanks) {
  return {
    id: stableUuid(`ecosystem:${slugify(partnerName)}`),
    source_key: 'curated',
    source_authority: 'Curated Research',
    name: partnerName,
    legal_name: null,
    entity_type: 'ecosystem_company',
    business_model: inferBusinessModel(partnerName),
    active: true,
    status: 'active',
    country: 'US',
    city: null,
    state: null,
    website: null,
    description: `Embedded-banking / sponsor-bank ecosystem company linked to ${seedBanks.join(', ')}.`,
    parent_name: null,
    confidence_score: 0.6,
    raw_data: {
      source_script: LOCAL_SOURCE_SCRIPT,
      seed_type: 'sponsor_bank_partner',
      sponsor_banks: seedBanks,
      source_urls: [FED_MASTER_ACCOUNT_URL, FED_MASTER_ACCOUNT_PAGE_URL],
    },
    data_as_of: new Date().toISOString().slice(0, 10),
    last_synced_at: new Date().toISOString(),
  };
}

function institutionSponsorTag(entityId) {
  return {
    id: stableUuid(`tag:institutions:${entityId}:business_role:sponsor_bank`),
    entity_table: 'institutions',
    entity_id: entityId,
    tag_key: 'business_role',
    tag_value: 'sponsor_bank',
    source_kind: 'curated',
    source_url: FED_MASTER_ACCOUNT_PAGE_URL,
    confidence_score: 0.7,
    effective_start: null,
    effective_end: null,
    notes: LOCAL_NOTE,
  };
}

function ecosystemPartnerTag(entityId) {
  return {
    id: stableUuid(`tag:ecosystem_entities:${entityId}:business_role:embedded_banking_partner`),
    entity_table: 'ecosystem_entities',
    entity_id: entityId,
    tag_key: 'business_role',
    tag_value: 'embedded_banking_partner',
    source_kind: 'curated',
    source_url: FED_MASTER_ACCOUNT_PAGE_URL,
    confidence_score: 0.6,
    effective_start: null,
    effective_end: null,
    notes: LOCAL_NOTE,
  };
}

function sponsorRelationship(institution, ecosystemEntity, partnerName, seedBank) {
  return {
    id: stableUuid(`relationship:${institution.id}:${ecosystemEntity.id}:sponsor_bank_for`),
    from_entity_table: 'institutions',
    from_entity_id: institution.id,
    to_entity_table: 'ecosystem_entities',
    to_entity_id: ecosystemEntity.id,
    relationship_type: 'sponsor_bank_for',
    relationship_label: 'Sponsor bank for',
    active: true,
    effective_start: null,
    effective_end: null,
    source_kind: 'curated',
    source_url: FED_MASTER_ACCOUNT_PAGE_URL,
    confidence_score: 0.6,
    notes: LOCAL_NOTE,
    raw_data: {
      source_script: LOCAL_SOURCE_SCRIPT,
      sponsor_bank_name: institution.name,
      partner_name: partnerName,
      seed_notes: seedBank.notes ?? null,
    },
  };
}

function capabilityFact(institution, seedBank) {
  return {
    id: stableUuid(`fact:institutions:${institution.id}:capability:baas_seed:${seedBank.name}`),
    entity_table: 'institutions',
    entity_id: institution.id,
    fact_type: 'capability',
    fact_key: 'baas_seed_notes',
    fact_value_text: seedBank.notes ?? 'Curated sponsor-bank seed',
    fact_value_number: null,
    fact_value_json: {
      source_script: LOCAL_SOURCE_SCRIPT,
      baas_platform: seedBank.baas_platform ?? null,
      baas_partners: seedBank.baas_partners ?? [],
      fed_master_account: seedBank.fed_master_account ?? null,
      fedwire_participant: seedBank.fedwire_participant ?? null,
    },
    fact_unit: null,
    source_kind: 'curated',
    source_url: FED_MASTER_ACCOUNT_PAGE_URL,
    observed_at: new Date().toISOString(),
    confidence_score: 0.6,
    notes: LOCAL_NOTE,
  };
}

async function upsert(client, table, rows, columns, conflictTarget, updateColumns) {
  if (rows.length === 0) return;

  const values = [];
  const placeholders = rows.map((row, rowIndex) => {
    const offset = rowIndex * columns.length;
    columns.forEach((column) => values.push(row[column] ?? null));
    const params = columns.map((_, columnIndex) => `$${offset + columnIndex + 1}`);
    return `(${params.join(', ')})`;
  });

  const quotedColumns = columns.map((column) => `"${column}"`).join(', ');
  const setClause = updateColumns
    .map((column) => `"${column}" = EXCLUDED."${column}"`)
    .join(', ');

  await client.query(
    `
      INSERT INTO "${table}" (${quotedColumns})
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (${conflictTarget})
      DO UPDATE SET ${setClause};
    `,
    values
  );
}

async function main() {
  const client = new Client(connectionConfig());
  await client.connect();

  try {
    const institutionResult = await client.query(`
      SELECT id, cert_number, name, state
      FROM institutions
      WHERE active IS DISTINCT FROM false
    `);

    const institutions = institutionResult.rows;
    const byCert = new Map(institutions.map((row) => [Number(row.cert_number), row]));
    const byNormalizedName = new Map(institutions.map((row) => [normalizeName(row.name), row]));

    const matchedBanks = [];

    for (const seed of SPONSOR_BANK_SEEDS) {
      let institution = seed.cert ? byCert.get(Number(seed.cert)) : null;
      if (!institution) institution = byNormalizedName.get(normalizeName(seed.name)) ?? null;
      if (!institution) continue;
      matchedBanks.push({ institution, seed });
    }

    const partnerToBanks = new Map();
    for (const match of matchedBanks) {
      for (const partner of match.seed.baas_partners ?? []) {
        const list = partnerToBanks.get(partner) ?? [];
        list.push(match.institution.name);
        partnerToBanks.set(partner, list);
      }
    }

    const ecosystemRows = [...partnerToBanks.entries()].map(([partner, banks]) =>
      ecosystemEntityRow(partner, banks)
    );
    const ecosystemByName = new Map(ecosystemRows.map((row) => [row.name, row]));

    const capabilityRows = matchedBanks.map(({ institution, seed }) => ({
      cert_number: institution.cert_number,
      fed_master_account: seed.fed_master_account ?? true,
      fedwire_participant: seed.fedwire_participant ?? null,
      nacha_odfi: seed.nacha_odfi ?? null,
      nacha_rdfi: true,
      swift_member: seed.swift_member ?? null,
      visa_principal: seed.visa_principal ?? null,
      mastercard_principal: seed.mastercard_principal ?? null,
      amex_issuer: seed.amex_issuer ?? null,
      issues_credit_cards: seed.issues_credit_cards ?? null,
      issues_debit_cards: seed.issues_debit_cards ?? null,
      issues_prepaid: seed.issues_prepaid ?? null,
      issues_commercial_cards: seed.issues_commercial_cards ?? null,
      baas_platform: seed.baas_platform ?? null,
      baas_partners: seed.baas_partners ?? null,
      card_program_manager: seed.card_program_manager ?? null,
      treasury_management: null,
      sweep_accounts: null,
      lockbox_services: null,
      data_source: 'manual',
      confidence: 'medium',
      notes: LOCAL_NOTE,
      source_urls: [FED_MASTER_ACCOUNT_URL, FED_MASTER_ACCOUNT_PAGE_URL],
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const institutionTagRows = matchedBanks.map(({ institution }) => institutionSponsorTag(institution.id));
    const ecosystemTagRows = ecosystemRows.map((row) => ecosystemPartnerTag(row.id));
    const relationshipRows = matchedBanks.flatMap(({ institution, seed }) =>
      (seed.baas_partners ?? []).map((partner) =>
        sponsorRelationship(institution, ecosystemByName.get(partner), partner, seed)
      )
    );
    const factRows = matchedBanks.map(({ institution, seed }) => capabilityFact(institution, seed));

    await client.query('BEGIN');

    await client.query(
      `
        DELETE FROM entity_relationships
        WHERE notes = $1
           OR (raw_data ->> 'sponsor_seed_name') IS NOT NULL
      `,
      [LOCAL_NOTE]
    );
    await client.query(`DELETE FROM entity_tags WHERE notes = $1`, [LOCAL_NOTE]);
    await client.query(`DELETE FROM entity_facts WHERE notes = $1`, [LOCAL_NOTE]);
    await client.query(
      `
        DELETE FROM ecosystem_entities
        WHERE source_key = 'curated'
          AND (
            raw_data ->> 'source_script' = $1
            OR (raw_data ->> 'source_seed_name') IS NOT NULL
          )
      `,
      [LOCAL_SOURCE_SCRIPT]
    );

    await upsert(
      client,
      'bank_capabilities',
      capabilityRows,
      [
        'cert_number',
        'fed_master_account',
        'fedwire_participant',
        'nacha_odfi',
        'nacha_rdfi',
        'swift_member',
        'visa_principal',
        'mastercard_principal',
        'amex_issuer',
        'issues_credit_cards',
        'issues_debit_cards',
        'issues_prepaid',
        'issues_commercial_cards',
        'baas_platform',
        'baas_partners',
        'card_program_manager',
        'treasury_management',
        'sweep_accounts',
        'lockbox_services',
        'data_source',
        'confidence',
        'notes',
        'source_urls',
        'verified_at',
        'updated_at',
      ],
      'cert_number',
      [
        'fed_master_account',
        'fedwire_participant',
        'nacha_odfi',
        'nacha_rdfi',
        'swift_member',
        'visa_principal',
        'mastercard_principal',
        'amex_issuer',
        'issues_credit_cards',
        'issues_debit_cards',
        'issues_prepaid',
        'issues_commercial_cards',
        'baas_platform',
        'baas_partners',
        'card_program_manager',
        'data_source',
        'confidence',
        'notes',
        'source_urls',
        'verified_at',
        'updated_at',
      ]
    );

    await upsert(
      client,
      'ecosystem_entities',
      ecosystemRows,
      [
        'id',
        'source_key',
        'source_authority',
        'name',
        'legal_name',
        'entity_type',
        'business_model',
        'active',
        'status',
        'country',
        'city',
        'state',
        'website',
        'description',
        'parent_name',
        'confidence_score',
        'raw_data',
        'data_as_of',
        'last_synced_at',
      ],
      'id',
      [
        'source_key',
        'source_authority',
        'name',
        'entity_type',
        'business_model',
        'active',
        'status',
        'country',
        'description',
        'confidence_score',
        'raw_data',
        'data_as_of',
        'last_synced_at',
      ]
    );

    await upsert(
      client,
      'entity_tags',
      [...institutionTagRows, ...ecosystemTagRows],
      [
        'id',
        'entity_table',
        'entity_id',
        'tag_key',
        'tag_value',
        'source_kind',
        'source_url',
        'confidence_score',
        'effective_start',
        'effective_end',
        'notes',
      ],
      'id',
      [
        'tag_key',
        'tag_value',
        'source_kind',
        'source_url',
        'confidence_score',
        'notes',
      ]
    );

    await upsert(
      client,
      'entity_relationships',
      relationshipRows,
      [
        'id',
        'from_entity_table',
        'from_entity_id',
        'to_entity_table',
        'to_entity_id',
        'relationship_type',
        'relationship_label',
        'active',
        'effective_start',
        'effective_end',
        'source_kind',
        'source_url',
        'confidence_score',
        'notes',
        'raw_data',
      ],
      'id',
      [
        'relationship_type',
        'relationship_label',
        'active',
        'source_kind',
        'source_url',
        'confidence_score',
        'notes',
        'raw_data',
      ]
    );

    await upsert(
      client,
      'entity_facts',
      factRows,
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
      'id',
      [
        'fact_type',
        'fact_key',
        'fact_value_text',
        'fact_value_json',
        'source_kind',
        'source_url',
        'observed_at',
        'confidence_score',
        'notes',
      ]
    );

    await client.query('COMMIT');

    console.log(`Seeded local sponsor-bank ecosystem graph.
  matched_banks: ${matchedBanks.length}
  ecosystem_entities: ${ecosystemRows.length}
  relationships: ${relationshipRows.length}
  institution_tags: ${institutionTagRows.length}
  ecosystem_tags: ${ecosystemTagRows.length}
  facts: ${factRows.length}`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`Local BaaS ecosystem sync failed: ${error.message}`);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
