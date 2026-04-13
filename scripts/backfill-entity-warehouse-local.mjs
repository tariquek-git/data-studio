#!/usr/bin/env node
/**
 * Seed the entity warehouse tables inside the local Postgres sandbox.
 *
 * This mirrors the legacy-to-warehouse transform used by
 * scripts/backfill-entity-warehouse.mjs, but targets the local Postgres
 * database created by scripts/setup-local-postgres.mjs so development can keep
 * moving without waiting on live Supabase schema/cache changes.
 *
 * Usage:
 *   node scripts/backfill-entity-warehouse-local.mjs
 *   LOCAL_PG_DB=data_studio_local BRANCH_REPORTING_YEAR=2025 node scripts/backfill-entity-warehouse-local.mjs
 */

import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import { join } from 'path';
import { stableUuid } from './_sync-utils.mjs';

const LOCAL_DB = process.env.LOCAL_PG_DB || 'data_studio_local';
const LOCAL_HOST = process.env.LOCAL_PG_HOST || 'localhost';
const LOCAL_PORT = process.env.LOCAL_PG_PORT || '5432';
const LOCAL_USER = process.env.LOCAL_PG_USER || '';
const SOURCE = 'entity_warehouse_backfill';
const BACKFILL_NOTE = 'Backfilled from local legacy sandbox';
const REGISTRY_SOURCES = new Set(['rpaa', 'ciro', 'fintrac', 'fincen']);
const DEFAULT_BRANCH_REPORTING_YEAR = 2024;
const NULL_TOKEN = '__CODEX_NULL__';
const MAX_BUFFER = 512 * 1024 * 1024;
const SOURCE_URL_BY_SOURCE = {
  fdic: 'https://banks.data.fdic.gov/api/institutions',
  ncua: 'https://www.ncua.gov/analysis/credit-union-corporate-call-report-data',
  osfi: 'https://www.osfi-bsif.gc.ca/en/supervision/who-we-regulate',
  rpaa: 'https://www.bankofcanada.ca/core-functions/funds-management/retail-payments-supervision/',
  ciro: 'https://www.ciro.ca/investors/check-your-advisor-dealer',
  fintrac: 'https://www10.fintrac-canafe.gc.ca/msb-esm/public/msb-list/',
  fincen: 'https://www.fincen.gov/msb-registrant-search',
};

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

const TARGET_TABLES = {
  registry_entities: [
    'id',
    'source_key',
    'name',
    'legal_name',
    'entity_subtype',
    'active',
    'status',
    'country',
    'city',
    'state',
    'website',
    'regulator',
    'registration_number',
    'description',
    'raw_data',
    'data_as_of',
    'last_synced_at',
  ],
  entity_external_ids: [
    'id',
    'entity_table',
    'entity_id',
    'id_type',
    'id_value',
    'is_primary',
    'source_url',
    'notes',
  ],
  entity_tags: [
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
  entity_facts: [
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
  financial_history_quarterly: [
    'id',
    'entity_table',
    'entity_id',
    'period',
    'total_assets',
    'total_deposits',
    'total_loans',
    'net_income',
    'equity_capital',
    'roa',
    'roi',
    'credit_card_loans',
    'source_kind',
    'source_url',
    'raw_data',
  ],
  branch_history_annual: [
    'id',
    'entity_table',
    'entity_id',
    'reporting_year',
    'period',
    'branch_count',
    'main_office_count',
    'total_branch_deposits',
    'source_kind',
    'source_url',
    'raw_data',
  ],
};

function psqlArgs(database = LOCAL_DB) {
  const args = ['-v', 'ON_ERROR_STOP=1', '-h', LOCAL_HOST, '-p', LOCAL_PORT];
  if (LOCAL_USER) args.push('-U', LOCAL_USER);
  args.push('-d', database);
  return args;
}

function psqlQuery(database, sql) {
  return execFileSync('psql', [...psqlArgs(database), '-AtF', '\t', '-c', sql], {
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
    stdio: ['inherit', 'pipe', 'pipe'],
  }).trim();
}

function psqlExec(database, sql, inherit = true) {
  return execFileSync('psql', [...psqlArgs(database), '-c', sql], {
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
    stdio: inherit ? 'inherit' : ['inherit', 'pipe', 'pipe'],
  });
}

function psqlJson(database, sql) {
  const wrapped = `SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)::text FROM (${sql}) t;`;
  const output = psqlQuery(database, wrapped);
  return JSON.parse(output || '[]');
}

function localTableExists(table) {
  return psqlQuery(
    LOCAL_DB,
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${table}' LIMIT 1;`
  ) === '1';
}

function localCount(table) {
  return Number(psqlQuery(LOCAL_DB, `SELECT COUNT(*) FROM "${table}";`) || '0');
}

function startLocalSyncJob(source) {
  const output = psqlQuery(
    LOCAL_DB,
    `INSERT INTO sync_jobs (source, status, started_at)
     VALUES ('${source}', 'running', now())
     RETURNING id;`
  );
  return Number(output);
}

function finishLocalSyncJob(jobId, payload) {
  if (!jobId) return;
  const assignments = [
    `status = '${String(payload.status).replace(/'/g, "''")}'`,
    `completed_at = now()`,
    `records_processed = ${payload.records_processed ?? 'NULL'}`,
    `error = ${payload.error ? `'${String(payload.error).replace(/'/g, "''")}'` : 'NULL'}`,
  ];

  psqlExec(LOCAL_DB, `UPDATE sync_jobs SET ${assignments.join(', ')} WHERE id = ${jobId};`);
}

function ensureWarehouseTables() {
  for (const table of Object.keys(TARGET_TABLES)) {
    if (!localTableExists(table)) {
      throw new Error(`Required local warehouse table ${table} is missing`);
    }
  }
}

function fetchLegacyRows() {
  return {
    institutions: psqlJson(
      LOCAL_DB,
      `SELECT id, cert_number, source, name, legal_name, charter_type, active, city, state, website,
              regulator, holding_company, total_assets, total_deposits, total_loans, net_income, roa,
              roi, data_as_of, last_synced_at, raw_data
         FROM institutions
        ORDER BY cert_number`
    ),
    financialHistory: psqlJson(
      LOCAL_DB,
      `SELECT cert_number, period, total_assets, total_deposits, total_loans, net_income, equity_capital,
              roa, roi, credit_card_loans, raw_data
         FROM financial_history
        ORDER BY cert_number, period`
    ),
    branches: psqlJson(
      LOCAL_DB,
      `SELECT cert_number, branch_number, main_office, total_deposits
         FROM branches
        ORDER BY cert_number, branch_number`
    ),
  };
}

function normalizeText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function resolveBranchReportingYear() {
  const candidates = [
    process.env.BRANCH_REPORTING_YEAR,
    process.env.FDIC_BRANCH_SOURCE_YEAR,
    process.env.FDIC_SOD_YEAR,
  ];

  for (const candidate of candidates) {
    const year = Number(candidate);
    if (Number.isFinite(year)) return year;
  }

  return DEFAULT_BRANCH_REPORTING_YEAR;
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

function tagId(entityTable, entityId, tagKey, tagValue) {
  return stableUuid(`tag:${entityTable}:${entityId}:${tagKey}:${tagValue}`);
}

function factId(entityTable, entityId, factType, factKey, factValueText, observedAt) {
  return stableUuid(
    `fact:${entityTable}:${entityId}:${factType ?? ''}:${factKey ?? ''}:${factValueText ?? ''}:${observedAt ?? ''}`
  );
}

function sourceUrlForSource(sourceKey) {
  return SOURCE_URL_BY_SOURCE[sourceKey] ?? null;
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

function institutionExternalIds(row) {
  const raw = row.raw_data ?? {};
  let primaryAssigned = false;
  const ids = [];

  const pushId = (idType, idValue, isPrimary = false) => {
    const text = normalizeText(idValue);
    if (!text) return;
    const makePrimary = Boolean(isPrimary && !primaryAssigned);
    if (makePrimary) primaryAssigned = true;
    ids.push({
      id: stableUuid(`external:${row.id}:${idType}:${text}`),
      entity_table: 'institutions',
      entity_id: row.id,
      id_type: idType,
      id_value: text,
      is_primary: makePrimary,
      source_url: sourceUrlForSource(row.source),
      notes: BACKFILL_NOTE,
    });
  };

  if (row.source === 'fdic') {
    pushId('fdic_cert', raw.CERT ?? row.cert_number, true);
  }

  if (row.source === 'ncua') {
    pushId('ncua_charter', raw.CU_NUMBER ?? raw.CREDIT_UNION_NUMBER ?? row.cert_number, true);
  }

  pushId('legacy_cert_number', row.cert_number, !primaryAssigned);

  const optionalIds = [
    ['rssd_id', raw.RSSD ?? raw.ID_RSSD],
    ['lei', raw.LEI ?? raw.id_lei],
    ['routing_number', raw.RTNUM ?? raw.ABA ?? raw.ROUTING_NUMBER ?? raw.PrimaryABARoutNumber],
    ['rpaa_id', raw.boc_id],
    ['fincen_id', raw.registration_number],
    ['nmls_id', raw.nmls_id],
  ];

  for (const [idType, idValue] of optionalIds) {
    pushId(idType, idValue, false);
  }

  return ids;
}

function registryExternalIds(registryRow, legacyRow) {
  const raw = legacyRow.raw_data ?? {};
  const meta = REGISTRY_META[legacyRow.source];
  const preferredSourceId =
    normalizeText(meta?.registration_field ? raw[meta.registration_field] : null) ??
    normalizeText(raw.boc_id) ??
    normalizeText(raw.nmls_id);
  const preferredIsDistinct = preferredSourceId && preferredSourceId !== registryRow.registration_number;
  const ids = [
    {
      id: stableUuid(`external:${registryRow.id}:registration_number:${registryRow.registration_number}`),
      entity_table: 'registry_entities',
      entity_id: registryRow.id,
      id_type: 'registration_number',
      id_value: registryRow.registration_number,
      is_primary: !preferredIsDistinct,
      source_url: sourceUrlForSource(legacyRow.source),
      notes: BACKFILL_NOTE,
    },
    {
      id: stableUuid(`external:${registryRow.id}:legacy_cert_number:${legacyRow.cert_number}`),
      entity_table: 'registry_entities',
      entity_id: registryRow.id,
      id_type: 'legacy_cert_number',
      id_value: String(legacyRow.cert_number),
      is_primary: false,
      source_url: sourceUrlForSource(legacyRow.source),
      notes: BACKFILL_NOTE,
    },
  ];

  if (preferredSourceId && meta?.id_type && preferredIsDistinct) {
    ids.push({
      id: stableUuid(`external:${registryRow.id}:${meta.id_type}:${preferredSourceId}`),
      entity_table: 'registry_entities',
      entity_id: registryRow.id,
      id_type: meta.id_type,
      id_value: preferredSourceId,
      is_primary: true,
      source_url: sourceUrlForSource(legacyRow.source),
      notes: BACKFILL_NOTE,
    });
  }

  return ids;
}

function institutionTags(row) {
  const tags = [];

  if (row.charter_type) {
    tags.push({
      id: tagId('institutions', row.id, 'charter_family', row.charter_type),
      entity_table: 'institutions',
      entity_id: row.id,
      tag_key: 'charter_family',
      tag_value: row.charter_type,
      source_kind: 'curated',
      source_url: sourceUrlForSource(row.source),
      confidence_score: 0.7,
      effective_start: null,
      effective_end: null,
      notes: BACKFILL_NOTE,
    });
  }

  const role =
    row.source === 'ncua'
      ? 'credit_union'
      : row.source === 'osfi' || row.source === 'fdic'
        ? 'regulated_institution'
        : null;

  if (role) {
    tags.push({
      id: tagId('institutions', row.id, 'business_role', role),
      entity_table: 'institutions',
      entity_id: row.id,
      tag_key: 'business_role',
      tag_value: role,
      source_kind: 'curated',
      source_url: sourceUrlForSource(row.source),
      confidence_score: 0.6,
      effective_start: null,
      effective_end: null,
      notes: BACKFILL_NOTE,
    });
  }

  return tags;
}

function registryTags(registryRow, legacyRow) {
  const meta = REGISTRY_META[legacyRow.source];
  return [
    {
      id: tagId('registry_entities', registryRow.id, 'business_role', meta?.business_role ?? registryRow.entity_subtype),
      entity_table: 'registry_entities',
      entity_id: registryRow.id,
      tag_key: 'business_role',
      tag_value: meta?.business_role ?? registryRow.entity_subtype,
      source_kind: 'curated',
      source_url: sourceUrlForSource(legacyRow.source),
      confidence_score: 0.8,
      effective_start: null,
      effective_end: null,
      notes: BACKFILL_NOTE,
    },
    {
      id: tagId('registry_entities', registryRow.id, 'charter_family', registryRow.entity_subtype),
      entity_table: 'registry_entities',
      entity_id: registryRow.id,
      tag_key: 'charter_family',
      tag_value: registryRow.entity_subtype,
      source_kind: 'curated',
      source_url: sourceUrlForSource(legacyRow.source),
      confidence_score: 0.7,
      effective_start: null,
      effective_end: null,
      notes: BACKFILL_NOTE,
    },
  ];
}

function registryFacts(registryRow, legacyRow) {
  const raw = legacyRow.raw_data ?? {};
  const status = normalizeText(raw.status) ?? registryRow.status ?? 'active';

  return [
    {
      id: factId(
        'registry_entities',
        registryRow.id,
        'registration',
        'registration_status',
        status,
        legacyRow.last_synced_at
      ),
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
      source_url: sourceUrlForSource(legacyRow.source),
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
    const institution = institutionsByCert.get(Number(branch.cert_number));
    if (!institution) continue;
    const key = `${institution.id}:${reportingYear}`;
    const bucket = yearly.get(key) ?? {
      id: stableUuid(`branch-history:${institution.id}:${reportingYear}`),
      entity_table: 'institutions',
      entity_id: institution.id,
      reporting_year: reportingYear,
      period,
      branch_count: 0,
      main_office_count: 0,
      total_branch_deposits: 0,
      source_kind: 'official',
      source_url: sourceUrlForSource('fdic'),
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

function buildBackfillPayloads({ institutions, financialHistory, branches, branchReportingYear }) {
  const institutionsByCert = new Map(institutions.map((row) => [Number(row.cert_number), row]));

  const registryLegacyRows = institutions.filter((row) => REGISTRY_SOURCES.has(row.source));
  const registryRows = registryLegacyRows.map(registryPayloadFromInstitution);
  const registryRowsByLegacyCert = new Map(
    registryLegacyRows.map((row) => [row.cert_number, registryPayloadFromInstitution(row)])
  );

  const institutionExternalIdRows = institutions.flatMap(institutionExternalIds);
  const registryExternalIdRows = registryLegacyRows.flatMap((legacyRow) => {
    const registryRow = registryRowsByLegacyCert.get(legacyRow.cert_number);
    return registryRow ? registryExternalIds(registryRow, legacyRow) : [];
  });

  const tagRows = [
    ...institutions.flatMap(institutionTags),
    ...registryLegacyRows.flatMap((legacyRow) => {
      const registryRow = registryRowsByLegacyCert.get(legacyRow.cert_number);
      return registryRow ? registryTags(registryRow, legacyRow) : [];
    }),
  ];

  const factRows = registryLegacyRows.flatMap((legacyRow) => {
    const registryRow = registryRowsByLegacyCert.get(legacyRow.cert_number);
    return registryRow ? registryFacts(registryRow, legacyRow) : [];
  });

  const quarterlyRows = financialHistory
    .map((row) => {
      const institution = institutionsByCert.get(Number(row.cert_number));
      if (!institution) return null;
      return {
        id: stableUuid(`quarterly:${institution.id}:${row.period}`),
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
        source_url: sourceUrlForSource(institution.source),
        raw_data: {
          ...(row.raw_data ?? {}),
          legacy_cert_number: row.cert_number,
        },
      };
    })
    .filter(Boolean);

  const branchAnnualRows = aggregateBranches(branches, institutionsByCert, branchReportingYear);

  return {
    registryRows,
    institutionExternalIdRows,
    registryExternalIdRows,
    tagRows,
    factRows,
    quarterlyRows,
    branchAnnualRows,
  };
}

function scalarToString(value) {
  if (value == null) return NULL_TOKEN;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value) || typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function csvEscape(value) {
  const text = scalarToString(value);
  if (text.includes('"') || text.includes(',') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function writeCsvFile(table, columns, rows, dir) {
  const file = join(dir, `${table}.csv`);
  const lines = [columns.join(',')];

  for (const row of rows) {
    lines.push(columns.map((column) => csvEscape(row[column])).join(','));
  }

  writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
  return file;
}

function truncateWarehouseTables() {
  psqlExec(
    LOCAL_DB,
    `TRUNCATE TABLE
      branch_history_annual,
      financial_history_quarterly,
      entity_facts,
      entity_tags,
      entity_external_ids,
      registry_entities
      RESTART IDENTITY CASCADE;`
  );
}

function copyCsvIntoTable(table, columns, file) {
  const columnList = columns.map((column) => `"${column}"`).join(', ');
  const sql = `\\copy "${table}" (${columnList}) FROM '${file}' WITH (FORMAT csv, HEADER true, NULL '${NULL_TOKEN}')`;
  execFileSync('psql', [...psqlArgs(LOCAL_DB), '-c', sql], {
    maxBuffer: MAX_BUFFER,
    stdio: 'inherit',
  });
}

async function main() {
  ensureWarehouseTables();
  const branchReportingYear = resolveBranchReportingYear();
  const tempDir = mkdtempSync(join(os.tmpdir(), 'data-studio-local-warehouse-'));
  let jobId = null;

  try {
    console.log(`Starting local entity warehouse backfill for ${LOCAL_DB}...`);
    jobId = startLocalSyncJob(SOURCE);

    const { institutions, financialHistory, branches } = fetchLegacyRows();
    const payload = buildBackfillPayloads({
      institutions,
      financialHistory,
      branches,
      branchReportingYear,
    });

    truncateWarehouseTables();

    const rowsByTable = {
      registry_entities: payload.registryRows,
      entity_external_ids: [...payload.institutionExternalIdRows, ...payload.registryExternalIdRows],
      entity_tags: payload.tagRows,
      entity_facts: payload.factRows,
      financial_history_quarterly: payload.quarterlyRows,
      branch_history_annual: payload.branchAnnualRows,
    };

    for (const [table, rows] of Object.entries(rowsByTable)) {
      const columns = TARGET_TABLES[table];
      const file = writeCsvFile(table, columns, rows, tempDir);
      copyCsvIntoTable(table, columns, file);
    }

    const recordsProcessed =
      payload.registryRows.length +
      payload.institutionExternalIdRows.length +
      payload.registryExternalIdRows.length +
      payload.tagRows.length +
      payload.factRows.length +
      payload.quarterlyRows.length +
      payload.branchAnnualRows.length;

    finishLocalSyncJob(jobId, {
      status: 'completed',
      records_processed: recordsProcessed,
    });

    console.log(`Local warehouse backfill complete.
  branch_reporting_year: ${branchReportingYear}
  registry_entities: ${localCount('registry_entities')}
  entity_external_ids: ${localCount('entity_external_ids')}
  entity_tags: ${localCount('entity_tags')}
  entity_facts: ${localCount('entity_facts')}
  financial_history_quarterly: ${localCount('financial_history_quarterly')}
  branch_history_annual: ${localCount('branch_history_annual')}`);
  } catch (error) {
    finishLocalSyncJob(jobId, {
      status: 'failed',
      error: error.message,
    });
    console.error(`Local warehouse backfill failed: ${error.message}`);
    process.exit(1);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main();
