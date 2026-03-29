#!/usr/bin/env node
/**
 * Backfill entity warehouse tables from the existing legacy institution tables.
 *
 * This bridges the new warehouse layer before all external source loaders are
 * fully live. It seeds:
 * - registry_entities from legacy registry-like institution sources
 * - entity_external_ids for institutions + registry entities
 * - entity_tags for charter families and business roles
 * - entity_facts for registry registration status
 * - financial_history_quarterly from financial_history
 * - branch_history_annual from branches
 */

import {
  chunkArray,
  createSupabaseServiceClient,
  finishSyncJob,
  loadEnvLocal,
  stableUuid,
  startSyncJob,
  tableExists,
} from './_sync-utils.mjs';

const env = loadEnvLocal();
const supabase = createSupabaseServiceClient(env);

const SOURCE = 'entity_warehouse_backfill';
const BACKFILL_NOTE = 'Backfilled from legacy warehouse activation';
const REGISTRY_SOURCES = new Set(['rpaa', 'ciro', 'fintrac', 'fincen']);
const FDIC_SOD_URL = 'https://api.fdic.gov/banks/sod';

const REGISTRY_META = {
  rpaa: {
    subtype: 'payment_service_provider',
    business_role: 'payment_service_provider',
    id_type: 'rpaa_id',
    registration_field: 'boc_id',
  },
  ciro: {
    subtype: 'dealer_firm',
    business_role: 'dealer_firm',
    id_type: 'ciro_id',
    registration_field: null,
  },
  fintrac: {
    subtype: 'money_services_business',
    business_role: 'money_services_business',
    id_type: 'fintrac_id',
    registration_field: 'registration_number',
  },
  fincen: {
    subtype: 'money_services_business',
    business_role: 'money_services_business',
    id_type: 'fincen_id',
    registration_field: 'registration_number',
  },
};

function normalizeText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function toIsoDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, month, day, year] = slash;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return text;
}

async function resolveLatestSodYear() {
  const override = process.env.FDIC_SOD_YEAR ? Number(process.env.FDIC_SOD_YEAR) : null;
  if (override != null && Number.isFinite(override)) return override;

  const url =
    `${FDIC_SOD_URL}` +
    '?fields=YEAR' +
    '&limit=1' +
    '&sort_by=YEAR' +
    '&sort_order=DESC';

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to resolve latest FDIC SOD year: HTTP ${response.status}`);
  }

  const payload = await response.json();
  const year = Number(payload.data?.[0]?.data?.YEAR);
  if (!Number.isFinite(year)) {
    throw new Error('Unable to resolve latest FDIC SOD year from FDIC response');
  }

  return year;
}

async function fetchAllRows(table, columns, pageSize = 1000) {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Unable to query ${table}: ${error.message}`);
    if (!data || data.length === 0) break;

    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function ensureWarehouseTables() {
  const required = [
    'registry_entities',
    'entity_external_ids',
    'entity_tags',
    'entity_facts',
    'financial_history_quarterly',
    'branch_history_annual',
  ];

  for (const table of required) {
    const exists = await tableExists(supabase, table);
    if (!exists) {
      throw new Error(`Required warehouse table ${table} is missing`);
    }
  }
}

function legacyRegistrationNumber(row) {
  const raw = row.raw_data ?? {};
  const meta = REGISTRY_META[row.source];
  const explicitField = meta?.registration_field ? normalizeText(raw[meta.registration_field]) : null;

  return (
    explicitField ??
    normalizeText(raw.registration_number) ??
    normalizeText(raw.boc_id) ??
    normalizeText(raw.nmls_id) ??
    String(row.cert_number)
  );
}

function institutionExternalIds(row) {
  const raw = row.raw_data ?? {};
  const ids = [
    {
      entity_table: 'institutions',
      entity_id: row.id,
      id_type: 'legacy_cert_number',
      id_value: String(row.cert_number),
      is_primary: true,
      source_url: null,
      notes: BACKFILL_NOTE,
    },
  ];

  if (row.source === 'fdic') {
    ids.push({
      entity_table: 'institutions',
      entity_id: row.id,
      id_type: 'fdic_cert',
      id_value: String(raw.CERT ?? row.cert_number),
      is_primary: true,
      source_url: null,
      notes: BACKFILL_NOTE,
    });
  }

  if (row.source === 'ncua') {
    ids.push({
      entity_table: 'institutions',
      entity_id: row.id,
      id_type: 'ncua_charter',
      id_value: String(raw.CU_NUMBER ?? raw.CREDIT_UNION_NUMBER ?? row.cert_number),
      is_primary: true,
      source_url: null,
      notes: BACKFILL_NOTE,
    });
  }

  const optionalIds = [
    ['rssd_id', raw.RSSD ?? raw.ID_RSSD],
    ['lei', raw.LEI ?? raw.id_lei],
    ['routing_number', raw.RTNUM ?? raw.ABA ?? raw.ROUTING_NUMBER ?? raw.PrimaryABARoutNumber],
    ['rpaa_id', raw.boc_id],
    ['fincen_id', raw.registration_number],
    ['nmls_id', raw.nmls_id],
  ];

  for (const [idType, idValue] of optionalIds) {
    const text = normalizeText(idValue);
    if (!text) continue;
    ids.push({
      entity_table: 'institutions',
      entity_id: row.id,
      id_type: idType,
      id_value: text,
      is_primary: false,
      source_url: null,
      notes: BACKFILL_NOTE,
    });
  }

  return ids;
}

function institutionTags(row) {
  const tags = [];

  if (row.charter_type) {
    tags.push({
      entity_table: 'institutions',
      entity_id: row.id,
      tag_key: 'charter_family',
      tag_value: row.charter_type,
      source_kind: 'curated',
      source_url: null,
      confidence_score: 0.7,
      effective_start: null,
      effective_end: null,
      notes: BACKFILL_NOTE,
    });
  }

  const role =
    row.source === 'ncua'
      ? 'credit_union'
      : row.source === 'osfi'
        ? 'regulated_institution'
        : row.source === 'fdic'
          ? 'regulated_institution'
          : null;

  if (role) {
    tags.push({
      entity_table: 'institutions',
      entity_id: row.id,
      tag_key: 'business_role',
      tag_value: role,
      source_kind: 'curated',
      source_url: null,
      confidence_score: 0.6,
      effective_start: null,
      effective_end: null,
      notes: BACKFILL_NOTE,
    });
  }

  return tags;
}

function registryPayloadFromInstitution(row) {
  const raw = row.raw_data ?? {};
  const registrationNumber = legacyRegistrationNumber(row);
  const meta = REGISTRY_META[row.source];
  const legalName =
    normalizeText(row.legal_name) ??
    normalizeText(raw.en_legal_name) ??
    normalizeText(raw.legal_name) ??
    row.name;

  return {
    id: stableUuid(`registry:${row.source}:${row.cert_number}`),
    source_key: row.source,
    name: row.name,
    legal_name: legalName,
    entity_subtype: meta?.subtype ?? row.charter_type ?? 'registry_entity',
    active: row.active !== false,
    status: normalizeText(raw.status) ?? (row.active === false ? 'inactive' : 'active'),
    country: row.source === 'fincen' ? 'US' : 'CA',
    city: row.city,
    state: row.state,
    website: row.website,
    regulator: row.regulator,
    registration_number: registrationNumber,
    description:
      normalizeText(raw.group_label) ??
      normalizeText(raw.note) ??
      `${meta?.subtype ?? 'registry entity'} backfilled from legacy institutions`,
    raw_data: {
      ...raw,
      legacy_institution_id: row.id,
      legacy_cert_number: row.cert_number,
    },
    data_as_of: row.data_as_of,
    last_synced_at: row.last_synced_at,
  };
}

function registryExternalIds(registryRow, legacyRow) {
  const raw = legacyRow.raw_data ?? {};
  const meta = REGISTRY_META[legacyRow.source];
  const ids = [
    {
      entity_table: 'registry_entities',
      entity_id: registryRow.id,
      id_type: 'registration_number',
      id_value: registryRow.registration_number,
      is_primary: true,
      source_url: null,
      notes: BACKFILL_NOTE,
    },
    {
      entity_table: 'registry_entities',
      entity_id: registryRow.id,
      id_type: 'legacy_cert_number',
      id_value: String(legacyRow.cert_number),
      is_primary: false,
      source_url: null,
      notes: BACKFILL_NOTE,
    },
  ];

  const preferredSourceId = normalizeText(
    meta?.registration_field ? raw[meta.registration_field] : null
  ) ?? normalizeText(raw.boc_id) ?? normalizeText(raw.nmls_id);

  if (preferredSourceId && meta?.id_type) {
    ids.push({
      entity_table: 'registry_entities',
      entity_id: registryRow.id,
      id_type: meta.id_type,
      id_value: preferredSourceId,
      is_primary: true,
      source_url: null,
      notes: BACKFILL_NOTE,
    });
  }

  return ids;
}

function registryTags(registryRow, legacyRow) {
  const meta = REGISTRY_META[legacyRow.source];
  const tags = [
    {
      entity_table: 'registry_entities',
      entity_id: registryRow.id,
      tag_key: 'business_role',
      tag_value: meta?.business_role ?? registryRow.entity_subtype,
      source_kind: 'curated',
      source_url: null,
      confidence_score: 0.8,
      effective_start: null,
      effective_end: null,
      notes: BACKFILL_NOTE,
    },
    {
      entity_table: 'registry_entities',
      entity_id: registryRow.id,
      tag_key: 'charter_family',
      tag_value: registryRow.entity_subtype,
      source_kind: 'curated',
      source_url: null,
      confidence_score: 0.7,
      effective_start: null,
      effective_end: null,
      notes: BACKFILL_NOTE,
    },
  ];

  return tags;
}

function registryFacts(registryRow, legacyRow) {
  const raw = legacyRow.raw_data ?? {};
  const status = normalizeText(raw.status) ?? registryRow.status ?? 'active';

  return [
    {
      entity_table: 'registry_entities',
      entity_id: registryRow.id,
      fact_type: 'registration',
      fact_key: 'registration_status',
      fact_value_text: status,
      fact_value_number: null,
      fact_value_json: {
        source: legacyRow.source,
        group_label: raw.group_label ?? null,
        source_strategy: raw.source_strategy ?? null,
      },
      fact_unit: null,
      source_kind: 'curated',
      source_url: null,
      observed_at: legacyRow.last_synced_at,
      confidence_score: 0.7,
      notes: BACKFILL_NOTE,
    },
  ];
}

function aggregateBranches(branchRows, institutionsByCert, reportingYear) {
  const yearly = new Map();
  const period = `${reportingYear}-06-30`;

  for (const branch of branchRows) {
    const institution = institutionsByCert.get(branch.cert_number);
    if (!institution) continue;
    const key = `${institution.id}:${reportingYear}`;
    const bucket = yearly.get(key) ?? {
      entity_table: 'institutions',
      entity_id: institution.id,
      reporting_year: reportingYear,
      period,
      branch_count: 0,
      main_office_count: 0,
      total_branch_deposits: 0,
      source_kind: 'official',
      source_url: null,
      raw_data: {
        legacy_cert_number: branch.cert_number,
      },
    };

    bucket.branch_count += 1;
    bucket.main_office_count += branch.main_office ? 1 : 0;
    bucket.total_branch_deposits += Number(branch.total_deposits ?? 0);
    yearly.set(key, bucket);
  }

  return [...yearly.values()];
}

async function main() {
  await ensureWarehouseTables();

  let jobId = null;

  try {
    console.log('Starting entity warehouse backfill...');
    jobId = await startSyncJob(supabase, SOURCE);

    const [institutions, financialHistory, branches] = await Promise.all([
      fetchAllRows(
        'institutions',
        'id, cert_number, source, name, legal_name, charter_type, active, city, state, website, regulator, holding_company, total_assets, total_deposits, total_loans, net_income, roa, roi, data_as_of, last_synced_at, raw_data'
      ),
      fetchAllRows(
        'financial_history',
        'cert_number, period, total_assets, total_deposits, total_loans, net_income, equity_capital, roa, roi, credit_card_loans, raw_data'
      ),
      fetchAllRows(
        'branches',
        'cert_number, branch_number, main_office, total_deposits'
      ),
    ]);
    const latestSodYear = await resolveLatestSodYear();

    const institutionsByCert = new Map(
      institutions.map((row) => [Number(row.cert_number), row])
    );

    const registryLegacyRows = institutions.filter((row) => REGISTRY_SOURCES.has(row.source));
    const registryRows = registryLegacyRows.map(registryPayloadFromInstitution);
    const registryRowsByLegacyCert = new Map(
      registryLegacyRows.map((row) => [row.cert_number, registryPayloadFromInstitution(row)])
    );

    for (const batch of chunkArray(registryRows, 400)) {
      const { error } = await supabase
        .from('registry_entities')
        .upsert(batch, { onConflict: 'id' });

      if (error) throw new Error(`Unable to upsert registry_entities: ${error.message}`);
    }

    const institutionExternalIdRows = institutions.flatMap(institutionExternalIds);
    const registryExternalIdRows = registryLegacyRows.flatMap((legacyRow) => {
      const registryRow = registryRowsByLegacyCert.get(legacyRow.cert_number);
      return registryRow ? registryExternalIds(registryRow, legacyRow) : [];
    });

    for (const batch of chunkArray([...institutionExternalIdRows, ...registryExternalIdRows], 500)) {
      const { error } = await supabase
        .from('entity_external_ids')
        .upsert(batch, { onConflict: 'entity_table,entity_id,id_type,id_value' });

      if (error) throw new Error(`Unable to upsert entity_external_ids: ${error.message}`);
    }

    await supabase.from('entity_tags').delete().eq('notes', BACKFILL_NOTE);
    const tagRows = [
      ...institutions.flatMap(institutionTags),
      ...registryLegacyRows.flatMap((legacyRow) => {
        const registryRow = registryRowsByLegacyCert.get(legacyRow.cert_number);
        return registryRow ? registryTags(registryRow, legacyRow) : [];
      }),
    ];

    for (const batch of chunkArray(tagRows, 500)) {
      const { error } = await supabase.from('entity_tags').insert(batch);
      if (error) throw new Error(`Unable to insert entity_tags: ${error.message}`);
    }

    await supabase.from('entity_facts').delete().eq('notes', BACKFILL_NOTE);
    const factRows = registryLegacyRows.flatMap((legacyRow) => {
      const registryRow = registryRowsByLegacyCert.get(legacyRow.cert_number);
      return registryRow ? registryFacts(registryRow, legacyRow) : [];
    });
    for (const batch of chunkArray(factRows, 400)) {
      const { error } = await supabase.from('entity_facts').insert(batch);
      if (error) throw new Error(`Unable to insert entity_facts: ${error.message}`);
    }

    const quarterlyRows = financialHistory
      .map((row) => {
        const institution = institutionsByCert.get(Number(row.cert_number));
        if (!institution) return null;
        return {
          entity_table: 'institutions',
          entity_id: institution.id,
          period: row.period,
          total_assets: row.total_assets,
          total_deposits: row.total_deposits,
          total_loans: row.total_loans,
          net_income: row.net_income,
          equity_capital: row.equity_capital,
          roa: row.roa,
          roi: row.roi,
          credit_card_loans: row.credit_card_loans,
          source_kind: 'official',
          source_url: null,
          raw_data: {
            ...(row.raw_data ?? {}),
            legacy_cert_number: row.cert_number,
          },
        };
      })
      .filter(Boolean);

    for (const batch of chunkArray(quarterlyRows, 500)) {
      const { error } = await supabase
        .from('financial_history_quarterly')
        .upsert(batch, { onConflict: 'entity_table,entity_id,period' });

      if (error) throw new Error(`Unable to upsert financial_history_quarterly: ${error.message}`);
    }

    const branchAnnualRows = aggregateBranches(branches, institutionsByCert, latestSodYear);
    for (const batch of chunkArray(branchAnnualRows, 500)) {
      const { error } = await supabase
        .from('branch_history_annual')
        .upsert(batch, { onConflict: 'entity_table,entity_id,reporting_year' });

      if (error) throw new Error(`Unable to upsert branch_history_annual: ${error.message}`);
    }

    await finishSyncJob(supabase, jobId, {
      status: 'completed',
      records_processed:
        registryRows.length +
        institutionExternalIdRows.length +
        registryExternalIdRows.length +
        tagRows.length +
        factRows.length +
        quarterlyRows.length +
        branchAnnualRows.length,
    });

    console.log(`Backfill complete.
  registry_entities: ${registryRows.length}
  entity_external_ids: ${institutionExternalIdRows.length + registryExternalIdRows.length}
  entity_tags: ${tagRows.length}
  entity_facts: ${factRows.length}
  financial_history_quarterly: ${quarterlyRows.length}
  branch_history_annual: ${branchAnnualRows.length}`);
  } catch (error) {
    console.error('Entity warehouse backfill failed:', error.message);
    await finishSyncJob(supabase, jobId, {
      status: 'failed',
      error: error.message,
    });
    process.exit(1);
  }
}

main();
