import { stableUuid } from './_sync-utils.mjs';

const BACKFILL_NOTE = 'Backfilled from legacy warehouse activation';
const REGISTRY_SOURCES = new Set(['rpaa', 'ciro', 'fintrac', 'fincen']);
const DEFAULT_BRANCH_REPORTING_YEAR = 2024;

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

function resolveLegacyRegistrationNumber(row) {
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
      entity_table: 'institutions',
      entity_id: row.id,
      id_type: idType,
      id_value: text,
      is_primary: makePrimary,
      source_url: null,
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
  const registrationNumber = resolveLegacyRegistrationNumber(row);
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
  const preferredSourceId =
    normalizeText(meta?.registration_field ? raw[meta.registration_field] : null) ??
    normalizeText(raw.boc_id) ??
    normalizeText(raw.nmls_id);
  const preferredIsDistinct = preferredSourceId && preferredSourceId !== registryRow.registration_number;
  const ids = [
    {
      entity_table: 'registry_entities',
      entity_id: registryRow.id,
      id_type: 'registration_number',
      id_value: registryRow.registration_number,
      is_primary: !preferredIsDistinct,
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

  if (preferredSourceId && meta?.id_type && preferredIsDistinct) {
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
  return [
    {
      id: tagId(
        'registry_entities',
        registryRow.id,
        'business_role',
        meta?.business_role ?? registryRow.entity_subtype
      ),
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
      id: tagId('registry_entities', registryRow.id, 'charter_family', registryRow.entity_subtype),
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

export function resolveBranchReportingYear() {
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

export function buildBackfillPayloads({ institutions, financialHistory, branches, branchReportingYear }) {
  const institutionsByCert = new Map(
    institutions.map((row) => [Number(row.cert_number), row])
  );

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
