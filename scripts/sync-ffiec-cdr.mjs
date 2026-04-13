#!/usr/bin/env node
/**
 * FFIEC CDR starter sync
 *
 * Uses the official FFIEC CDR Public Web Services account flow to pull the
 * latest Call Report Panel of Reporters and attach RSSD / routing / charter
 * identifiers to existing institutions. This script is intentionally scoped to
 * source scaffolding and identifier enrichment rather than full facsimile
 * ingestion, which requires a larger warehouse transform.
 *
 * Required:
 *   FFIEC_CDR_USER_ID
 *   FFIEC_CDR_AUTH_TOKEN
 *
 * Optional:
 *   FFIEC_CDR_REPORTING_PERIOD=03/31/2026
 *   FFIEC_CDR_LAST_UPDATE=2026-03-15 00:00:00.000
 *   FFIEC_CDR_PANEL_FILE=path/to/panel.json
 *
 * Official references:
 *   https://cdr.ffiec.gov/public/HelpFiles/PWSInfo.htm
 *   https://cdr.ffiec.gov/public/Files/SIS611_-_Retrieve_Public_Data_via_Web_Service.pdf
 */

import {
  chunkArray,
  createSupabaseServiceClient,
  finishSyncJob,
  formatUsDateToIso,
  getEnvValue,
  loadEnvLocal,
  readJsonSource,
  startSyncJob,
  tableExists,
  updateDataSourceSnapshot,
} from './_sync-utils.mjs';
import { createHash } from 'node:crypto';

const SOURCE_KEY = 'ffiec_cdr';
const SOURCE_URL = 'https://cdr.ffiec.gov/public/HelpFiles/PWSInfo.htm';
const API_SPEC_URL = 'https://cdr.ffiec.gov/public/Files/SIS611_-_Retrieve_Public_Data_via_Web_Service.pdf';
const REPORTING_PERIODS_URL = 'https://ffieccdr.azure-api.us/public/RetrieveReportingPeriods';
const PANEL_OF_REPORTERS_URL = 'https://ffieccdr.azure-api.us/public/RetrievePanelOfReporters';
const FILERS_SUBMISSION_URL = 'https://ffieccdr.azure-api.us/public/RetrieveFilersSubmissionDateTime';

function stableId(seedParts: Array<string | number | boolean | null | undefined>) {
  const seed = seedParts
    .map((value) => (value == null ? '' : String(value)))
    .join('|');
  const hash = createHash('sha1').update(seed).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

const env = loadEnvLocal();
const userId = getEnvValue(env, 'FFIEC_CDR_USER_ID');
const authToken = getEnvValue(env, 'FFIEC_CDR_AUTH_TOKEN');
const panelFile = getEnvValue(env, 'FFIEC_CDR_PANEL_FILE');
const reportingPeriodOverride = getEnvValue(env, 'FFIEC_CDR_REPORTING_PERIOD');
const lastUpdateDateTime = getEnvValue(env, 'FFIEC_CDR_LAST_UPDATE');
const supabase = createSupabaseServiceClient(env);

function authHeaders(extra = {}) {
  return {
    UserID: userId,
    Authentication: `Bearer ${authToken}`,
    dataSeries: 'Call',
    ...extra,
  };
}

async function fetchJson(url, headers) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'DataStudio/1.0',
      ...headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`FFIEC CDR request failed (${response.status}): ${body.slice(0, 400)}`);
  }

  return response.json();
}

async function loadReportingPeriod() {
  if (reportingPeriodOverride) return reportingPeriodOverride;
  if (!userId || !authToken) {
    throw new Error('FFIEC_CDR_REPORTING_PERIOD is required when using FFIEC_CDR_PANEL_FILE without live PWS credentials');
  }

  const periods = await fetchJson(REPORTING_PERIODS_URL, authHeaders());
  if (!Array.isArray(periods) || periods.length === 0) {
    throw new Error('FFIEC CDR returned no reporting periods');
  }

  return periods[periods.length - 1];
}

async function loadPanelOfReporters(reportingPeriod) {
  if (panelFile) {
    return readJsonSource(panelFile);
  }

  if (!userId || !authToken) {
    throw new Error('Set FFIEC_CDR_USER_ID and FFIEC_CDR_AUTH_TOKEN, or provide FFIEC_CDR_PANEL_FILE');
  }

  return fetchJson(
    PANEL_OF_REPORTERS_URL,
    authHeaders({ reportingPeriodEndDate: reportingPeriod })
  );
}

async function loadSubmissionTimes(reportingPeriod) {
  if (!lastUpdateDateTime || !userId || !authToken) return [];
  return fetchJson(
    FILERS_SUBMISSION_URL,
    authHeaders({
      reportingPeriodEndDate: reportingPeriod,
      lastUpdateDateTime,
    })
  );
}

async function loadInstitutionsByCert(certNumbers) {
  const matches = new Map();

  for (const certChunk of chunkArray(certNumbers, 400)) {
    const { data, error } = await supabase
      .from('institutions')
      .select('id, cert_number, name, source')
      .in('cert_number', certChunk);

    if (error) throw new Error(`Unable to query institutions for FFIEC CDR sync: ${error.message}`);
    for (const institution of data ?? []) {
      matches.set(Number(institution.cert_number), institution);
    }
  }

  return matches;
}

async function main() {
  if ((!userId || !authToken) && !panelFile) {
    console.error('FFIEC CDR sync requires FFIEC_CDR_USER_ID + FFIEC_CDR_AUTH_TOKEN, or FFIEC_CDR_PANEL_FILE.');
    console.error(`See ${SOURCE_URL}`);
    process.exit(1);
  }

  let jobId = null;

  try {
    const reportingPeriod = await loadReportingPeriod();
    const reportingPeriodIso = formatUsDateToIso(reportingPeriod);

    console.log(`Starting FFIEC CDR sync for reporting period ${reportingPeriod}...`);
    jobId = await startSyncJob(supabase, SOURCE_KEY);

    const panel = await loadPanelOfReporters(reportingPeriod);
    if (!Array.isArray(panel) || panel.length === 0) {
      throw new Error('FFIEC CDR returned an empty Panel of Reporters response');
    }

    const submissionTimes = await loadSubmissionTimes(reportingPeriod);
    const submissionMap = new Map(
      (Array.isArray(submissionTimes) ? submissionTimes : []).map((row) => [String(row.ID_RSSD), row.DateTime])
    );

    const certNumbers = [...new Set(
      panel
        .map((row) => Number(row.FDICCertNumber))
        .filter((value) => Number.isFinite(value) && value > 0)
    )];

    const institutionsByCert = await loadInstitutionsByCert(certNumbers);

    const hasExternalIdsTable = await tableExists(supabase, 'entity_external_ids');
    const hasTagsTable = await tableExists(supabase, 'entity_tags');
    const hasFactsTable = await tableExists(supabase, 'entity_facts');

    const externalIds = [];
    const tags = [];
    const facts = [];
    const nowIso = new Date().toISOString();
    const periodNote = `ffiec_cdr:${reportingPeriodIso}`;

    for (const row of panel) {
      const certNumber = Number(row.FDICCertNumber);
      if (!Number.isFinite(certNumber) || certNumber <= 0) continue;

      const institution = institutionsByCert.get(certNumber);
      if (!institution?.id) continue;

      const entityTable = 'institutions';
      const entityId = institution.id;

      const pushExternalId = (idType, idValue, isPrimary = false) => {
        if (idValue == null || String(idValue).trim() === '' || String(idValue) === '0') return;
        externalIds.push({
          entity_table: entityTable,
          entity_id: entityId,
          id_type: idType,
          id_value: String(idValue).trim(),
          is_primary: isPrimary,
          source_url: API_SPEC_URL,
          notes: `FFIEC CDR Panel of Reporters ${reportingPeriod}`,
        });
      };

      pushExternalId('rssd_id', row.ID_RSSD, true);
      pushExternalId('fdic_cert', row.FDICCertNumber);
      pushExternalId('occ_charter_number', row.OCCChartNumber);
      pushExternalId('ots_dock_number', row.OTSDockNumber);
      pushExternalId('routing_number', row.PrimaryABARoutNumber);

      tags.push({
        id: stableId([entityTable, entityId, 'ffiec_cdr_panel', periodNote, row.FDICCertNumber]),
        entity_table: entityTable,
        entity_id: entityId,
        tag_key: 'ffiec_cdr_panel',
        tag_value: 'call_reporter',
        source_kind: 'official',
        source_url: API_SPEC_URL,
        confidence_score: 1,
        effective_start: reportingPeriodIso,
        notes: periodNote,
      });

      if (row.FilingType != null && String(row.FilingType).trim() !== '') {
        tags.push({
          id: stableId([entityTable, entityId, 'ffiec_cdr_filing_type', String(row.FilingType), periodNote]),
          entity_table: entityTable,
          entity_id: entityId,
          tag_key: 'ffiec_cdr_filing_type',
          tag_value: String(row.FilingType).trim(),
          source_kind: 'official',
          source_url: API_SPEC_URL,
          confidence_score: 1,
          effective_start: reportingPeriodIso,
          notes: periodNote,
        });
      }

      facts.push({
        id: stableId([
          entityTable,
          entityId,
          'ffiec_cdr_reporting_status',
          String(Boolean(row.HasFiledForReportingPeriod)),
          reportingPeriodIso,
          row.FilingType ?? '',
          submissionMap.get(String(row.ID_RSSD)) ?? '',
        ]),
        entity_table: entityTable,
        entity_id: entityId,
        fact_type: 'filing',
        fact_key: 'ffiec_cdr_reporting_status',
        fact_value_text: String(Boolean(row.HasFiledForReportingPeriod)),
        fact_value_json: {
          reporting_period: reportingPeriod,
          has_filed_for_reporting_period: row.HasFiledForReportingPeriod,
          submission_datetime: submissionMap.get(String(row.ID_RSSD)) ?? null,
          city: row.City ?? null,
          state: row.State ?? null,
          filing_type: row.FilingType ?? null,
        },
        source_kind: 'official',
        source_url: API_SPEC_URL,
        observed_at: nowIso,
        confidence_score: 1,
        notes: periodNote,
      });
    }

    if (hasExternalIdsTable && externalIds.length > 0) {
      for (const batch of chunkArray(externalIds, 500)) {
        const { error } = await supabase
          .from('entity_external_ids')
          .upsert(batch, { onConflict: 'entity_table,entity_id,id_type,id_value' });

        if (error) throw new Error(`Unable to upsert FFIEC CDR external IDs: ${error.message}`);
      }
    } else if (!hasExternalIdsTable) {
      console.warn('Skipping entity_external_ids updates because the table is not available.');
    }

    if (hasTagsTable) {
      await supabase
        .from('entity_tags')
        .delete()
        .eq('source_url', API_SPEC_URL)
        .eq('notes', periodNote);

      for (const batch of chunkArray(tags, 500)) {
        const { error } = await supabase
          .from('entity_tags')
          .upsert(batch, { onConflict: 'id' });
        if (error) throw new Error(`Unable to insert FFIEC CDR tags: ${error.message}`);
      }
    } else {
      console.warn('Skipping entity_tags updates because the table is not available.');
    }

    if (hasFactsTable) {
      await supabase
        .from('entity_facts')
        .delete()
        .eq('source_url', API_SPEC_URL)
        .eq('notes', periodNote);

      for (const batch of chunkArray(facts, 400)) {
        const { error } = await supabase
          .from('entity_facts')
          .upsert(batch, { onConflict: 'id' });
        if (error) throw new Error(`Unable to insert FFIEC CDR facts: ${error.message}`);
      }
    } else {
      console.warn('Skipping entity_facts updates because the table is not available.');
    }

    await updateDataSourceSnapshot(supabase, SOURCE_KEY, {
      status: 'active',
      institution_count: panel.length,
      data_as_of: reportingPeriodIso,
      last_synced_at: nowIso,
      notes: `Latest sync used FFIEC CDR Panel of Reporters for ${reportingPeriod}. Full facsimile ingestion remains a later warehouse phase.`,
    });

    await finishSyncJob(supabase, jobId, {
      status: 'completed',
      records_processed: panel.length,
    });

    console.log(`FFIEC CDR sync complete. Panel rows: ${panel.length}. Matched institutions: ${facts.length}.`);
  } catch (error) {
    console.error('FFIEC CDR sync failed:', error.message);
    await finishSyncJob(supabase, jobId, {
      status: 'failed',
      error: error.message,
    });
    process.exit(1);
  }
}

main();
