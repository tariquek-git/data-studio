#!/usr/bin/env node
/**
 * OCC Financial Institution Lists Sync Script
 *
 * Ingests the OCC's active institution lists for:
 * - National banks
 * - Trust banks
 * - Federal savings associations
 * - Federal branches and agencies
 *
 * Matching strategy:
 * - Match existing institutions by OCC charter number, FDIC cert, or RSSD
 * - Only create new `institutions` rows when there is no current match
 * - When the warehouse tables are available, also persist OCC external IDs and tags
 *
 * Source index:
 *   https://www.occ.treas.gov/topics/charters-and-licensing/financial-institution-lists/index-financial-institution-lists.html
 *
 * Run:
 *   node scripts/sync-occ.mjs
 *   DRY_RUN=1 node scripts/sync-occ.mjs
 */

import * as XLSX from 'xlsx';
import {
  chunkArray,
  createSupabaseServiceClient,
  finishSyncJob,
  loadEnvLocal,
  stableUuid,
  startSyncJob,
  tableExists,
  updateDataSourceSnapshot,
} from './_sync-utils.mjs';

const env = loadEnvLocal();
const supabase = createSupabaseServiceClient(env);

const SOURCE_KEY = 'occ';
const OCC_INDEX_URL =
  'https://www.occ.treas.gov/topics/charters-and-licensing/financial-institution-lists/index-financial-institution-lists.html';
const OCC_CERT_BASE = 6_000_000;
const DRY_RUN = /^(1|true|yes)$/i.test(process.env.DRY_RUN ?? '');

const SHEET_SPECS = [
  {
    key: 'national_bank',
    url: 'https://www.occ.treas.gov/topics/charters-and-licensing/financial-institution-lists/national-by-name.xlsx',
    sheetName: 'All',
    charterType: 'commercial',
    businessRole: 'regulated_institution',
  },
  {
    key: 'trust_bank',
    url: 'https://www.occ.treas.gov/topics/charters-and-licensing/financial-institution-lists/trust-by-name.xlsx',
    sheetName: 'Trust',
    charterType: 'trust',
    businessRole: 'trust_bank',
  },
  {
    key: 'federal_savings_association',
    url: 'https://www.occ.treas.gov/topics/charters-and-licensing/financial-institution-lists/thrifts-by-name.xlsx',
    sheetName: 'All',
    charterType: 'savings_association',
    businessRole: 'regulated_institution',
  },
  {
    key: 'federal_branch_agency',
    url: 'https://www.occ.treas.gov/topics/charters-and-licensing/financial-institution-lists/national-by-name.xlsx',
    sheetName: 'Fed Branches',
    charterType: 'federal_branch_agency',
    businessRole: 'foreign_bank_branch',
  },
];

const TYPE_PRIORITY = {
  national_bank: 10,
  federal_savings_association: 20,
  trust_bank: 30,
  federal_branch_agency: 40,
};

const workbookCache = new Map();

function normalizeText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function toInteger(value) {
  if (value == null || value === '') return null;
  const digits = String(value).replace(/,/g, '').trim();
  if (digits === '') return null;
  const number = Number(digits);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function toIsoDate(value) {
  const text = normalizeText(value);
  if (!text) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, month, day, year] = slash;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return text;
}

function parseActiveAsOf(label) {
  const match = String(label ?? '').match(/As of\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
  return match ? toIsoDate(match[1]) : new Date().toISOString().slice(0, 10);
}

function findHeaderRow(rows) {
  return rows.findIndex((row) => String(row?.[0] ?? '').trim().toUpperCase() === 'CHARTER NO');
}

function tagId(entityId, key, value) {
  return stableUuid(`occ-tag:${entityId}:${key}:${value}`);
}

function extractRssd(raw = {}) {
  return normalizeText(
    raw.RSSD ??
      raw.ID_RSSD ??
      raw.rssd_id ??
      raw.rssd ??
      raw.IDRSSD
  );
}

function extractOccCharter(raw = {}) {
  return normalizeText(
    raw.occ_charter_number ??
      raw.occ_charter_no ??
      raw.CHARTER_NO ??
      raw.CHARTER
  );
}

async function fetchWorkbook(url) {
  if (workbookCache.has(url)) return workbookCache.get(url);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'DataStudio/1.0 (github.com/tariquek-git/data-studio)',
    },
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch OCC workbook ${url}: HTTP ${response.status}`);
  }

  const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: 'buffer' });
  workbookCache.set(url, workbook);
  return workbook;
}

async function loadOccSheet(spec) {
  const workbook = await fetchWorkbook(spec.url);
  const sheet = workbook.Sheets[spec.sheetName];

  if (!sheet) {
    throw new Error(`Workbook ${spec.url} is missing sheet ${spec.sheetName}`);
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const headerIndex = findHeaderRow(rows);
  if (headerIndex === -1) {
    throw new Error(`Unable to find OCC header row in ${spec.sheetName}`);
  }

  const headers = rows[headerIndex].map((header) => String(header ?? '').trim().toUpperCase());
  const activeAsOf = parseActiveAsOf(rows[0]?.[0]);

  return rows
    .slice(headerIndex + 1)
    .map((row) => {
      if (!Array.isArray(row)) return null;
      const record = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? null]));

      const occCharterNumber = toInteger(record['CHARTER NO']);
      const name = normalizeText(record.NAME);

      if (!occCharterNumber || !name) return null;

      return {
        occ_charter_number: occCharterNumber,
        name,
        legal_name: name,
        address: normalizeText(record['ADDRESS (LOC)']),
        city: normalizeText(record.CITY),
        state: normalizeText(record.STATE),
        fdic_cert: toInteger(record.CERT),
        rssd_id: toInteger(record.RSSD),
        record_type: spec.key,
        charter_type: spec.charterType,
        business_role: spec.businessRole,
        source_url: spec.url,
        source_sheet: spec.sheetName,
        active_as_of: activeAsOf,
      };
    })
    .filter(Boolean);
}

async function fetchAllInstitutions() {
  const rows = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('institutions')
      .select('id, cert_number, source, name, raw_data')
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Unable to query institutions: ${error.message}`);
    if (!data || data.length === 0) break;

    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

function dedupeRecords(records) {
  const map = new Map();

  for (const record of records) {
    const key = String(record.occ_charter_number);
    const existing = map.get(key);
    if (!existing || TYPE_PRIORITY[record.record_type] > TYPE_PRIORITY[existing.record_type]) {
      map.set(key, record);
    }
  }

  return [...map.values()].sort((a, b) => a.occ_charter_number - b.occ_charter_number);
}

function buildInstitutionMaps(institutions) {
  const byCert = new Map();
  const byRssd = new Map();
  const byOccCharter = new Map();

  for (const institution of institutions) {
    byCert.set(String(institution.cert_number), institution);

    const rssd = extractRssd(institution.raw_data);
    if (rssd) byRssd.set(rssd, institution);

    const occCharter = extractOccCharter(institution.raw_data);
    if (occCharter) byOccCharter.set(occCharter, institution);
  }

  return { byCert, byRssd, byOccCharter };
}

function resolveInstitutionMatch(record, maps) {
  const occCharter = String(record.occ_charter_number);
  const fdicCert = record.fdic_cert ? String(record.fdic_cert) : null;
  const rssd = record.rssd_id ? String(record.rssd_id) : null;

  return (
    maps.byOccCharter.get(occCharter) ??
    (fdicCert ? maps.byCert.get(fdicCert) : null) ??
    (rssd ? maps.byRssd.get(rssd) : null) ??
    null
  );
}

function syntheticCert(record) {
  return record.fdic_cert && record.fdic_cert > 0
    ? record.fdic_cert
    : OCC_CERT_BASE + record.occ_charter_number;
}

function occInstitutionPayload(record) {
  const certNumber = syntheticCert(record);

  return {
    id: stableUuid(`institution:occ:${record.record_type}:${record.occ_charter_number}`),
    cert_number: certNumber,
    source: 'occ',
    name: record.name,
    legal_name: record.legal_name,
    charter_type: record.charter_type,
    active: true,
    city: record.city,
    state: record.state,
    website: null,
    regulator: 'OCC',
    established_date: null,
    data_as_of: record.active_as_of,
    last_synced_at: new Date().toISOString(),
    raw_data: {
      occ_charter_number: record.occ_charter_number,
      fdic_cert: record.fdic_cert,
      rssd_id: record.rssd_id,
      address: record.address,
      list_type: record.record_type,
      source_sheet: record.source_sheet,
      source_url: record.source_url,
      active_as_of: record.active_as_of,
    },
  };
}

function externalIdsForRecord(entityId, record) {
  const ids = [
    {
      entity_table: 'institutions',
      entity_id: entityId,
      id_type: 'occ_charter_number',
      id_value: String(record.occ_charter_number),
      is_primary: false,
      source_url: record.source_url,
      notes: 'Synced from OCC Financial Institution Lists',
    },
  ];

  if (record.fdic_cert && record.fdic_cert > 0) {
    ids.push({
      entity_table: 'institutions',
      entity_id: entityId,
      id_type: 'fdic_cert',
      id_value: String(record.fdic_cert),
      is_primary: false,
      source_url: record.source_url,
      notes: 'Synced from OCC Financial Institution Lists',
    });
  }

  if (record.rssd_id && record.rssd_id > 0) {
    ids.push({
      entity_table: 'institutions',
      entity_id: entityId,
      id_type: 'rssd_id',
      id_value: String(record.rssd_id),
      is_primary: false,
      source_url: record.source_url,
      notes: 'Synced from OCC Financial Institution Lists',
    });
  }

  return ids;
}

function tagsForRecord(entityId, record) {
  const tags = [
    {
      id: tagId(entityId, 'charter_family', record.record_type),
      entity_table: 'institutions',
      entity_id: entityId,
      tag_key: 'charter_family',
      tag_value: record.record_type,
      source_kind: 'official',
      source_url: record.source_url,
      confidence_score: 1,
      effective_start: record.active_as_of,
      effective_end: null,
      notes: 'Synced from OCC Financial Institution Lists',
    },
  ];

  if (record.business_role) {
    tags.push({
      id: tagId(entityId, 'business_role', record.business_role),
      entity_table: 'institutions',
      entity_id: entityId,
      tag_key: 'business_role',
      tag_value: record.business_role,
      source_kind: 'official',
      source_url: record.source_url,
      confidence_score: 1,
      effective_start: record.active_as_of,
      effective_end: null,
      notes: 'Synced from OCC Financial Institution Lists',
    });
  }

  return tags;
}

async function main() {
  console.log(`Starting OCC sync${DRY_RUN ? ' (dry run)' : ''}...`);
  console.log(`Source index: ${OCC_INDEX_URL}`);

  const jobId = DRY_RUN ? null : await startSyncJob(supabase, SOURCE_KEY);

  try {
    const sheetRows = (await Promise.all(SHEET_SPECS.map(loadOccSheet))).flat();
    const occRecords = dedupeRecords(sheetRows);
    const institutions = await fetchAllInstitutions();
    const institutionMaps = buildInstitutionMaps(institutions);

    const matched = [];
    const inserts = [];
    const entityExternalIds = [];
    const entityTags = [];
    const sourceBreakdown = {};

    const hasEntityExternalIds = await tableExists(supabase, 'entity_external_ids');
    const hasEntityTags = await tableExists(supabase, 'entity_tags');

    for (const record of occRecords) {
      sourceBreakdown[record.record_type] = (sourceBreakdown[record.record_type] ?? 0) + 1;

      const existing = resolveInstitutionMatch(record, institutionMaps);
      const entityId = existing?.id ?? stableUuid(`institution:occ:${record.record_type}:${record.occ_charter_number}`);

      if (existing) {
        matched.push({ record, institution: existing });
      } else {
        inserts.push(occInstitutionPayload(record));
      }

      if (hasEntityExternalIds) {
        entityExternalIds.push(...externalIdsForRecord(entityId, record));
      }

      if (hasEntityTags) {
        entityTags.push(...tagsForRecord(entityId, record));
      }
    }

    console.log(`\nOCC records parsed: ${occRecords.length}`);
    for (const [key, count] of Object.entries(sourceBreakdown).sort()) {
      console.log(`  ${key}: ${count}`);
    }
    console.log(`Matched existing institutions: ${matched.length}`);
    console.log(`New OCC-only institutions to upsert: ${inserts.length}`);
    console.log(`Warehouse external IDs prepared: ${entityExternalIds.length}`);
    console.log(`Warehouse tags prepared: ${entityTags.length}`);

    if (!DRY_RUN && inserts.length > 0) {
      for (const batch of chunkArray(inserts, 250)) {
        const { error } = await supabase
          .from('institutions')
          .upsert(batch, { onConflict: 'cert_number' });

        if (error) throw new Error(`Unable to upsert OCC institutions: ${error.message}`);
      }
    }

    if (!DRY_RUN && hasEntityExternalIds && entityExternalIds.length > 0) {
      for (const batch of chunkArray(entityExternalIds, 500)) {
        const { error } = await supabase
          .from('entity_external_ids')
          .upsert(batch, { onConflict: 'entity_table,entity_id,id_type,id_value' });

        if (error) throw new Error(`Unable to upsert OCC entity_external_ids: ${error.message}`);
      }
    }

    if (!DRY_RUN && hasEntityTags && entityTags.length > 0) {
      for (const batch of chunkArray(entityTags, 500)) {
        const { error } = await supabase
          .from('entity_tags')
          .upsert(batch, { onConflict: 'id' });

        if (error) throw new Error(`Unable to upsert OCC entity_tags: ${error.message}`);
      }
    }

    if (!DRY_RUN) {
      await finishSyncJob(supabase, jobId, {
        status: 'completed',
        records_processed: occRecords.length,
      });

      await updateDataSourceSnapshot(supabase, SOURCE_KEY, {
        institution_count: occRecords.length,
        last_synced_at: new Date().toISOString(),
        data_as_of: occRecords[0]?.active_as_of ?? null,
        status: 'active',
        notes:
          `OCC sync current. Matched ${matched.length} existing institutions; ` +
          `upserted ${inserts.length} OCC-only rows.`,
      });
    }

    console.log('\nOCC sync complete.');
  } catch (error) {
    if (!DRY_RUN) {
      await finishSyncJob(supabase, jobId, {
        status: 'failed',
        error: error.message,
      });
    }

    console.error(`OCC sync failed: ${error.message}`);
    process.exit(1);
  }
}

main();
