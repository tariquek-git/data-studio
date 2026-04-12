import { getSupabase } from './supabase.js';
import type {
  EntityContextResponse,
  EntityDetail,
  EntityExternalId,
  EntityHistoryPoint,
  EntityRelationship,
  EntitySearchAggregations,
  EntitySourceKind,
  EntitySourceRecord,
  EntityStorageTable,
  EntitySummary,
  EntityTag,
} from '../src/types/entity.js';

type InstitutionRow = {
  id: string;
  cert_number: number | null;
  source: string;
  name: string;
  legal_name: string | null;
  charter_type: string | null;
  active: boolean | null;
  city: string | null;
  state: string | null;
  website: string | null;
  regulator: string | null;
  holding_company: string | null;
  total_assets: number | null;
  total_deposits: number | null;
  total_loans: number | null;
  net_income: number | null;
  roa: number | null;
  roi: number | null;
  raw_data: Record<string, unknown> | null;
  data_as_of: string | null;
  last_synced_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type RegistryEntityRow = {
  id: string;
  source_key: string;
  name: string;
  legal_name: string | null;
  entity_subtype: string | null;
  active: boolean | null;
  city: string | null;
  state: string | null;
  website: string | null;
  regulator: string | null;
  registration_number: string | null;
  status: string | null;
  description: string | null;
  raw_data: Record<string, unknown> | null;
  data_as_of: string | null;
  last_synced_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  country: string | null;
};

type EcosystemEntityRow = {
  id: string;
  source_key: string | null;
  source_authority: string | null;
  name: string;
  legal_name: string | null;
  entity_type: string;
  business_model: string | null;
  active: boolean | null;
  status: string | null;
  country: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
  description: string | null;
  parent_name: string | null;
  confidence_score: number | null;
  raw_data: Record<string, unknown> | null;
  data_as_of: string | null;
  last_synced_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type CapabilityRow = {
  cert_number: number;
  baas_platform: boolean | null;
  baas_partners: string[] | null;
  notes: string | null;
  fed_master_account: boolean | null;
  fedwire_participant: boolean | null;
  visa_principal: boolean | null;
  mastercard_principal: boolean | null;
};

type SearchOptions = {
  q?: string;
  country?: string | null;
  profile_kind?: string | null;
  regulator?: string | null;
  source_authority?: string | null;
  charter_family?: string | null;
  business_role?: string | null;
  status?: string | null;
  page?: number;
  perPage?: number;
};

const REGULATED_SOURCES = new Set(['fdic', 'ncua', 'osfi']);
const REGISTRY_SOURCES = new Set(['rpaa', 'ciro', 'fintrac', 'fincen']);
const TABLE_EXISTENCE_CACHE_TTL_MS = 60_000;
const TABLE_EXISTENCE_CACHE = new Map<string, { exists: boolean; checkedAt: number }>();
const ENTITY_ID_CHUNK_SIZE = 100;
const CERT_CHUNK_SIZE = 400;

const SOURCE_META: Record<
  string,
  { authority: string; country: string; countryLabel: string; sourceKind: EntitySourceKind }
> = {
  fdic: { authority: 'FDIC BankFind Suite', country: 'US', countryLabel: 'United States', sourceKind: 'official' },
  ncua: { authority: 'NCUA Call Report', country: 'US', countryLabel: 'United States', sourceKind: 'official' },
  osfi: { authority: 'OSFI', country: 'CA', countryLabel: 'Canada', sourceKind: 'official' },
  rpaa: { authority: 'Bank of Canada RPAA', country: 'CA', countryLabel: 'Canada', sourceKind: 'official' },
  ciro: { authority: 'CIRO', country: 'CA', countryLabel: 'Canada', sourceKind: 'official' },
  fintrac: { authority: 'FINTRAC MSB Registry', country: 'CA', countryLabel: 'Canada', sourceKind: 'official' },
  fincen: { authority: 'FinCEN MSB Registry', country: 'US', countryLabel: 'United States', sourceKind: 'official' },
  fdic_history: { authority: 'FDIC History API', country: 'US', countryLabel: 'United States', sourceKind: 'official' },
  fdic_enforcement: { authority: 'FDIC Enforcement API', country: 'US', countryLabel: 'United States', sourceKind: 'official' },
  ffiec_cra: { authority: 'FFIEC CRA Ratings', country: 'US', countryLabel: 'United States', sourceKind: 'official' },
  ffiec_nic: { authority: 'FFIEC NIC', country: 'US', countryLabel: 'United States', sourceKind: 'official' },
  cfpb_complaints: { authority: 'CFPB Complaint Database', country: 'US', countryLabel: 'United States', sourceKind: 'official' },
  curated: { authority: 'Curated Research', country: 'NA', countryLabel: 'North America', sourceKind: 'curated' },
};

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybe = error as { code?: string; message?: string };
  return (
    maybe.code === '42P01' ||
    maybe.code === '42703' ||
    maybe.code === 'PGRST205' ||
    /relation .* does not exist/i.test(maybe.message ?? '') ||
    /schema cache/i.test(maybe.message ?? '')
  );
}

async function safeRows<T>(promise: PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>): Promise<T[]> {
  const { data, error } = await promise;
  if (error) {
    if (isMissingTableError(error)) return [];
    throw new Error(error.code ? `${error.code}: ${error.message ?? 'Database query failed'}` : (error.message ?? 'Database query failed'));
  }
  return data ?? [];
}

async function safeMaybeSingle<T>(promise: PromiseLike<{ data: T | null; error: { code?: string; message?: string } | null }>): Promise<T | null> {
  const { data, error } = await promise;
  if (error) {
    if (isMissingTableError(error)) return null;
    throw new Error(error.message ?? 'Database query failed');
  }
  return data ?? null;
}

async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>,
  pageSize = 1000,
  maxPages = 25
) {
  const rows: T[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const chunk = await safeRows(fetchPage(from, to));
    if (chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }

  return rows;
}

async function tableExists(table: string) {
  const cached = TABLE_EXISTENCE_CACHE.get(table);
  if (cached && Date.now() - cached.checkedAt < TABLE_EXISTENCE_CACHE_TTL_MS) {
    return cached.exists;
  }

  const { error } = await getSupabase()
    .from(table)
    .select('id')
    .limit(1);

  if (!error) {
    TABLE_EXISTENCE_CACHE.set(table, { exists: true, checkedAt: Date.now() });
    return true;
  }

  if (isMissingTableError(error)) {
    TABLE_EXISTENCE_CACHE.set(table, { exists: false, checkedAt: Date.now() });
    return false;
  }

  throw new Error(error.message ?? `Unable to probe table ${table}`);
}

function countryMeta(sourceKey: string, explicitCountry?: string | null) {
  if (explicitCountry) {
    if (explicitCountry === 'US') return { country: 'US', countryLabel: 'United States' };
    if (explicitCountry === 'CA') return { country: 'CA', countryLabel: 'Canada' };
    if (explicitCountry === 'NA') return { country: 'NA', countryLabel: 'North America' };
  }
  const meta = SOURCE_META[sourceKey];
  return {
    country: meta?.country ?? 'NA',
    countryLabel: meta?.countryLabel ?? 'North America',
  };
}

function formatSourceAuthority(sourceKey: string, fallback?: string | null) {
  return fallback ?? SOURCE_META[sourceKey]?.authority ?? sourceKey.toUpperCase();
}

function chunkValues<T>(values: T[], size = 400) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function inferInstitutionProfileKind(source: string) {
  if (REGISTRY_SOURCES.has(source)) return 'registry_entity' as const;
  return 'regulated_institution' as const;
}

function inferInstitutionEntityType(row: InstitutionRow) {
  if (row.source === 'ncua') return 'credit_union';
  if (row.source === 'rpaa') return 'payment_service_provider';
  if (row.source === 'ciro') return 'dealer_firm';
  if (row.source === 'fintrac' || row.source === 'fincen') return 'money_services_business';
  if (row.source === 'osfi') return row.charter_type ?? 'regulated_institution';
  return 'bank';
}

function inferInstitutionCharterFamily(row: InstitutionRow) {
  if (row.source === 'ncua') return 'credit_union';
  if (row.source === 'rpaa') return 'payment_service_provider';
  if (row.source === 'ciro') return 'dealer_firm';
  if (row.source === 'fintrac' || row.source === 'fincen') return 'money_services_business';
  if (row.source === 'osfi') return row.charter_type ?? 'regulated_institution';
  return row.charter_type ?? 'bank';
}

function pushUnique(values: string[], next: string | null | undefined) {
  if (next && !values.includes(next)) values.push(next);
}

function externalIdRowsFromInstitution(row: InstitutionRow) {
  const ids: EntityExternalId[] = [];
  if (row.cert_number != null) {
    ids.push({
      entity_table: 'institutions',
      entity_id: row.id,
      id_type: 'cert_number',
      id_value: String(row.cert_number),
      is_primary: true,
      source_url: null,
    });
  }
  if (row.holding_company) {
    ids.push({
      entity_table: 'institutions',
      entity_id: row.id,
      id_type: 'holding_company',
      id_value: row.holding_company,
      is_primary: false,
      source_url: null,
    });
  }
  if (row.raw_data && typeof row.raw_data === 'object') {
    const raw = row.raw_data as Record<string, unknown>;
    const rawIds: Array<[string, unknown, boolean]> = [
      ['fdic_cert', raw.CERT, true],
      ['rssd_id', raw.RSSD, false],
      ['lei', raw.LEI, false],
      ['routing_number', raw.RTNUM ?? raw.ABA ?? raw.ROUTING_NUMBER, false],
    ];
    for (const [idType, idValue, isPrimary] of rawIds) {
      if (idValue == null || String(idValue).trim() === '') continue;
      ids.push({
        entity_table: 'institutions',
        entity_id: row.id,
        id_type: idType,
        id_value: String(idValue).trim(),
        is_primary: isPrimary,
        source_url: null,
      });
    }
  }
  return ids;
}

function externalIdRowsFromRegistry(row: RegistryEntityRow) {
  const ids: EntityExternalId[] = [];
  if (row.registration_number) {
    ids.push({
      entity_table: 'registry_entities',
      entity_id: row.id,
      id_type: 'registration_number',
      id_value: row.registration_number,
      is_primary: true,
      source_url: null,
    });
  }
  return ids;
}

function externalIdRowsFromEcosystem(row: EcosystemEntityRow) {
  const ids: EntityExternalId[] = [];
  if (row.source_key) {
    ids.push({
      entity_table: 'ecosystem_entities',
      entity_id: row.id,
      id_type: 'source_key',
      id_value: row.source_key,
      is_primary: true,
      source_url: null,
    });
  }
  return ids;
}

function capabilityRoles(cap: CapabilityRow | null | undefined) {
  const roles: string[] = [];
  if (!cap) return roles;
  if (cap.baas_platform) pushUnique(roles, 'sponsor_bank');
  if (cap.fed_master_account) pushUnique(roles, 'fed_master_account_holder');
  if (cap.fedwire_participant) pushUnique(roles, 'fedwire_participant');
  if (cap.visa_principal || cap.mastercard_principal) pushUnique(roles, 'card_issuer');
  return roles;
}

function tagRoles(tags: EntityTag[], key: string) {
  return tags.filter((tag) => tag.tag_key === key).map((tag) => tag.tag_value);
}

function toneFromStatus(active: boolean, status: string) {
  if (!active || /failed|terminated|inactive/i.test(status)) return 'critical' as const;
  if (/pending|limited/i.test(status)) return 'caution' as const;
  return 'positive' as const;
}

function buildInstitutionContextSummary(row: InstitutionRow, roles: string[]) {
  const size = row.total_assets != null ? `$${(row.total_assets / 1_000_000_000).toFixed(1)}B in assets` : 'no asset disclosure loaded';
  if (REGISTRY_SOURCES.has(row.source)) {
    if (row.source === 'rpaa') return `Bank of Canada RPAA-registered payment service provider with ${size === 'no asset disclosure loaded' ? 'registry-backed status' : size}.`;
    if (row.source === 'ciro') return `CIRO-regulated dealer profile with source-backed registry context and ${size}.`;
    return `${formatSourceAuthority(row.source)} registry entity with source-backed legal context and ${size}.`;
  }
  const sponsor = roles.includes('sponsor_bank') ? ' Sponsor-bank/BaaS role is flagged from curated capabilities data.' : '';
  return `${formatSourceAuthority(row.source)} ${inferInstitutionCharterFamily(row).replace(/_/g, ' ')} in ${[row.city, row.state].filter(Boolean).join(', ') || 'North America'} with ${size}.${sponsor}`;
}

function buildRegistryContextSummary(row: RegistryEntityRow) {
  const authority = formatSourceAuthority(row.source_key);
  const subtype = row.entity_subtype ? row.entity_subtype.replace(/_/g, ' ') : 'registry entity';
  return `${authority} ${subtype} profile with registration context, source provenance, and regulatory framing.`;
}

function buildEcosystemContextSummary(row: EcosystemEntityRow, roles: string[]) {
  const roleText = roles.length > 0 ? roles.map((role) => role.replace(/_/g, ' ')).join(', ') : row.business_model ?? row.entity_type;
  return `${roleText.replace(/_/g, ' ')} tracked through curated ecosystem research with relationship and evidence context.`;
}

async function loadCapabilityMap(certs: number[]) {
  if (certs.length === 0) return new Map<number, CapabilityRow>();
  if (!(await tableExists('bank_capabilities'))) return new Map<number, CapabilityRow>();
  const supabase = getSupabase();
  const rows: CapabilityRow[] = [];

  for (const certChunk of chunkValues(certs, CERT_CHUNK_SIZE)) {
    const chunkRows = await safeRows<CapabilityRow>(
      supabase
        .from('bank_capabilities')
        .select('cert_number, baas_platform, baas_partners, notes, fed_master_account, fedwire_participant, visa_principal, mastercard_principal')
        .in('cert_number', certChunk)
    );
    rows.push(...chunkRows);
  }

  return new Map(rows.map((row) => [row.cert_number, row]));
}

function deriveInstitutionTags(row: InstitutionRow, capability: CapabilityRow | null | undefined) {
  const tags: EntityTag[] = [];
  for (const role of capabilityRoles(capability)) {
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
      notes: 'Derived from capabilities metadata',
    });
  }
  if (row.charter_type) {
    tags.push({
      entity_table: 'institutions',
      entity_id: row.id,
      tag_key: 'charter_family',
      tag_value: row.charter_type,
      source_kind: 'curated',
      source_url: null,
      confidence_score: 0.5,
      effective_start: null,
      effective_end: null,
      notes: 'Derived from legacy institution row',
    });
  }
  return tags;
}

function deriveRegistryTags(row: RegistryEntityRow) {
  const tags: EntityTag[] = [];
  if (row.entity_subtype) {
    tags.push({
      entity_table: 'registry_entities',
      entity_id: row.id,
      tag_key: 'business_role',
      tag_value: row.entity_subtype,
      source_kind: 'curated',
      source_url: null,
      confidence_score: 0.5,
      effective_start: null,
      effective_end: null,
      notes: 'Derived from registry subtype',
    });
  }
  return tags;
}

function deriveEcosystemTags(row: EcosystemEntityRow) {
  const tags: EntityTag[] = [];
  if (row.business_model) {
    tags.push({
      entity_table: 'ecosystem_entities',
      entity_id: row.id,
      tag_key: 'business_role',
      tag_value: row.business_model,
      source_kind: 'curated',
      source_url: null,
      confidence_score: 0.5,
      effective_start: null,
      effective_end: null,
      notes: 'Derived from ecosystem business model',
    });
  }
  return tags;
}

async function loadTags(entityRefs: Array<{ entity_table: EntityStorageTable; entity_id: string }>) {
  if (entityRefs.length === 0) return new Map<string, EntityTag[]>();
  const supabase = getSupabase();
  const hasWarehouseTags = await tableExists('entity_tags');
  const tags = new Map<string, EntityTag[]>();

  if (hasWarehouseTags) {
    const rows: EntityTag[] = [];

    for (const idChunk of chunkValues(entityRefs.map((ref) => ref.entity_id), ENTITY_ID_CHUNK_SIZE)) {
      const chunkRows = await safeRows<EntityTag>(
        supabase
          .from('entity_tags')
          .select('id, entity_table, entity_id, tag_key, tag_value, source_kind, source_url, confidence_score, effective_start, effective_end, notes')
          .in('entity_id', idChunk)
      );
      rows.push(...chunkRows);
    }

    for (const row of rows) {
      const key = `${row.entity_table}:${row.entity_id}`;
      const list = tags.get(key) ?? [];
      list.push(row);
      tags.set(key, list);
    }
  }

  const missingInstitutionIds = entityRefs
    .filter((ref) => ref.entity_table === 'institutions' && !tags.has(`${ref.entity_table}:${ref.entity_id}`))
    .map((ref) => ref.entity_id);
  const missingRegistryIds = entityRefs
    .filter((ref) => ref.entity_table === 'registry_entities' && !tags.has(`${ref.entity_table}:${ref.entity_id}`))
    .map((ref) => ref.entity_id);
  const missingEcosystemIds = entityRefs
    .filter((ref) => ref.entity_table === 'ecosystem_entities' && !tags.has(`${ref.entity_table}:${ref.entity_id}`))
    .map((ref) => ref.entity_id);

  if (missingInstitutionIds.length > 0) {
    const institutionRows: InstitutionRow[] = [];

    for (const idChunk of chunkValues(missingInstitutionIds, ENTITY_ID_CHUNK_SIZE)) {
      const chunkRows = await safeRows<InstitutionRow>(
        supabase
          .from('institutions')
          .select('id, cert_number, source, name, legal_name, charter_type, active, city, state, website, regulator, holding_company, total_assets, total_deposits, total_loans, net_income, roa, roi, raw_data, data_as_of, last_synced_at, created_at, updated_at')
          .in('id', idChunk)
      );
      institutionRows.push(...chunkRows);
    }

    const capabilityMap = await loadCapabilityMap(
      institutionRows
        .map((row) => row.cert_number)
        .filter((value): value is number => typeof value === 'number')
    );

    for (const row of institutionRows) {
      const derived = deriveInstitutionTags(row, row.cert_number != null ? capabilityMap.get(row.cert_number) : null);
      if (derived.length > 0) tags.set(`institutions:${row.id}`, derived);
    }
  }

  if (missingRegistryIds.length > 0) {
    const registryRows: RegistryEntityRow[] = [];

    for (const idChunk of chunkValues(missingRegistryIds, ENTITY_ID_CHUNK_SIZE)) {
      const chunkRows = await safeRows<RegistryEntityRow>(
        supabase
          .from('registry_entities')
          .select('id, source_key, name, legal_name, entity_subtype, active, city, state, website, regulator, registration_number, status, description, raw_data, data_as_of, last_synced_at, created_at, updated_at, country')
          .in('id', idChunk)
      );
      registryRows.push(...chunkRows);
    }

    for (const row of registryRows) {
      const derived = deriveRegistryTags(row);
      if (derived.length > 0) tags.set(`registry_entities:${row.id}`, derived);
    }
  }

  if (missingEcosystemIds.length > 0) {
    const ecosystemRows: EcosystemEntityRow[] = [];

    for (const idChunk of chunkValues(missingEcosystemIds, ENTITY_ID_CHUNK_SIZE)) {
      const chunkRows = await safeRows<EcosystemEntityRow>(
        supabase
          .from('ecosystem_entities')
          .select('id, source_key, source_authority, name, legal_name, entity_type, business_model, active, status, country, city, state, website, description, parent_name, confidence_score, raw_data, data_as_of, last_synced_at, created_at, updated_at')
          .in('id', idChunk)
      );
      ecosystemRows.push(...chunkRows);
    }

    for (const row of ecosystemRows) {
      const derived = deriveEcosystemTags(row);
      if (derived.length > 0) tags.set(`ecosystem_entities:${row.id}`, derived);
    }
  }

  for (const ref of entityRefs) {
    const key = `${ref.entity_table}:${ref.entity_id}`;
    if (!tags.has(key)) tags.set(key, []);
  }

  return tags;
}

async function loadExternalIds(entityTable: EntityStorageTable, entityId: string) {
  const supabase = getSupabase();
  const hasWarehouseExternalIds = await tableExists('entity_external_ids');
  const warehouseRows = hasWarehouseExternalIds
    ? await safeRows<EntityExternalId>(
        supabase
          .from('entity_external_ids')
          .select('id, entity_table, entity_id, id_type, id_value, is_primary, source_url')
          .eq('entity_table', entityTable)
          .eq('entity_id', entityId)
          .order('is_primary', { ascending: false })
      )
    : [];

  if (warehouseRows.length > 0) return warehouseRows;

  if (entityTable === 'institutions') {
    const legacy = await loadInstitutionById(entityId);
    return legacy ? externalIdRowsFromInstitution(legacy) : [];
  }

  if (entityTable === 'registry_entities') {
    const legacy = await loadRegistryById(entityId);
    return legacy ? externalIdRowsFromRegistry(legacy) : [];
  }

  const legacy = await loadEcosystemById(entityId);
  return legacy ? externalIdRowsFromEcosystem(legacy) : [];
}

function mapInstitutionToSummary(
  row: InstitutionRow,
  tags: EntityTag[],
  capability: CapabilityRow | null | undefined
): EntitySummary {
  const roles = capabilityRoles(capability);
  for (const tag of tagRoles(tags, 'business_role')) pushUnique(roles, tag);
  const marketRoles = tagRoles(tags, 'market_role');
  const { country, countryLabel } = countryMeta(row.source);

  return {
    id: row.id,
    storage_table: 'institutions',
    profile_kind: inferInstitutionProfileKind(row.source),
    source_key: row.source,
    source_authority: formatSourceAuthority(row.source),
    source_kind: SOURCE_META[row.source]?.sourceKind ?? 'official',
    name: row.name,
    legal_name: row.legal_name,
    description: capability?.notes ?? null,
    country,
    country_label: countryLabel,
    city: row.city,
    state: row.state,
    website: row.website,
    regulator: row.regulator,
    entity_type: inferInstitutionEntityType(row),
    charter_family: inferInstitutionCharterFamily(row),
    business_roles: roles,
    market_roles: marketRoles,
    status: row.active === false ? 'inactive' : 'active',
    active: row.active !== false,
    confidence_score: null,
    data_as_of: row.data_as_of,
    last_synced_at: row.last_synced_at,
    context_summary: buildInstitutionContextSummary(row, roles),
    metrics: {
      total_assets: row.total_assets,
      total_deposits: row.total_deposits,
      total_loans: row.total_loans,
      net_income: row.net_income,
      roa: row.roa,
      roi: row.roi,
    },
    cert_number: row.cert_number,
  };
}

function mapRegistryToSummary(row: RegistryEntityRow, tags: EntityTag[]): EntitySummary {
  const { country, countryLabel } = countryMeta(row.source_key, row.country);
  return {
    id: row.id,
    storage_table: 'registry_entities',
    profile_kind: 'registry_entity',
    source_key: row.source_key,
    source_authority: formatSourceAuthority(row.source_key),
    source_kind: SOURCE_META[row.source_key]?.sourceKind ?? 'official',
    name: row.name,
    legal_name: row.legal_name,
    description: row.description,
    country,
    country_label: countryLabel,
    city: row.city,
    state: row.state,
    website: row.website,
    regulator: row.regulator,
    entity_type: row.entity_subtype ?? 'registry_entity',
    charter_family: row.entity_subtype ?? 'registry_entity',
    business_roles: tagRoles(tags, 'business_role'),
    market_roles: tagRoles(tags, 'market_role'),
    status: row.status ?? (row.active === false ? 'inactive' : 'active'),
    active: row.active !== false,
    confidence_score: null,
    data_as_of: row.data_as_of,
    last_synced_at: row.last_synced_at,
    context_summary: buildRegistryContextSummary(row),
    metrics: {
      total_assets: null,
      total_deposits: null,
      total_loans: null,
      net_income: null,
      roa: null,
      roi: null,
    },
    cert_number: null,
  };
}

function mapEcosystemToSummary(row: EcosystemEntityRow, tags: EntityTag[]): EntitySummary {
  const { country, countryLabel } = countryMeta(row.source_key ?? 'curated', row.country);
  const roles = [row.business_model, ...tagRoles(tags, 'business_role')].filter(Boolean) as string[];
  return {
    id: row.id,
    storage_table: 'ecosystem_entities',
    profile_kind: 'ecosystem_entity',
    source_key: row.source_key ?? 'curated',
    source_authority: formatSourceAuthority(row.source_key ?? 'curated', row.source_authority),
    source_kind: SOURCE_META[row.source_key ?? 'curated']?.sourceKind ?? 'curated',
    name: row.name,
    legal_name: row.legal_name,
    description: row.description,
    country,
    country_label: countryLabel,
    city: row.city,
    state: row.state,
    website: row.website,
    regulator: null,
    entity_type: row.entity_type,
    charter_family: null,
    business_roles: roles,
    market_roles: tagRoles(tags, 'market_role'),
    status: row.status ?? (row.active === false ? 'inactive' : 'active'),
    active: row.active !== false,
    confidence_score: row.confidence_score,
    data_as_of: row.data_as_of,
    last_synced_at: row.last_synced_at,
    context_summary: buildEcosystemContextSummary(row, roles),
    metrics: {
      total_assets: null,
      total_deposits: null,
      total_loans: null,
      net_income: null,
      roa: null,
      roi: null,
    },
    cert_number: null,
  };
}

function applySearchFilters(entities: EntitySummary[], options: SearchOptions) {
  let filtered = entities;
  const q = options.q?.trim().toLowerCase();

  if (q) {
    filtered = filtered.filter((entity) =>
      [
        entity.name,
        entity.legal_name,
        entity.context_summary,
        entity.city,
        entity.state,
        entity.regulator,
        entity.source_authority,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }

  if (options.country) filtered = filtered.filter((entity) => entity.country === options.country);
  if (options.profile_kind) filtered = filtered.filter((entity) => entity.profile_kind === options.profile_kind);
  if (options.regulator) filtered = filtered.filter((entity) => (entity.regulator ?? '').toLowerCase().includes(options.regulator!.toLowerCase()));
  if (options.source_authority) filtered = filtered.filter((entity) => entity.source_key === options.source_authority || entity.source_authority.toLowerCase().includes(options.source_authority!.toLowerCase()));
  if (options.charter_family) filtered = filtered.filter((entity) => entity.charter_family === options.charter_family);
  if (options.business_role) filtered = filtered.filter((entity) => entity.business_roles.includes(options.business_role!));
  if (options.status) filtered = filtered.filter((entity) => entity.status === options.status);

  filtered = filtered.sort((a, b) => {
    const assetDelta = (b.metrics.total_assets ?? -1) - (a.metrics.total_assets ?? -1);
    if (assetDelta !== 0) return assetDelta;
    return a.name.localeCompare(b.name);
  });

  return filtered;
}

function aggregateEntities(entities: EntitySummary[]): EntitySearchAggregations {
  return entities.reduce<EntitySearchAggregations>(
    (agg, entity) => {
      agg.by_country[entity.country] = (agg.by_country[entity.country] ?? 0) + 1;
      agg.by_profile_kind[entity.profile_kind] += 1;
      agg.by_source_key[entity.source_key] = (agg.by_source_key[entity.source_key] ?? 0) + 1;
      const regulator = entity.regulator ?? entity.source_authority;
      agg.by_regulator[regulator] = (agg.by_regulator[regulator] ?? 0) + 1;
      if (entity.charter_family) {
        agg.by_charter_family[entity.charter_family] = (agg.by_charter_family[entity.charter_family] ?? 0) + 1;
      }
      agg.by_status[entity.status] = (agg.by_status[entity.status] ?? 0) + 1;
      for (const role of entity.business_roles) {
        agg.by_business_role[role] = (agg.by_business_role[role] ?? 0) + 1;
      }
      return agg;
    },
    {
      by_country: {},
      by_profile_kind: {
        regulated_institution: 0,
        registry_entity: 0,
        ecosystem_entity: 0,
      },
      by_source_key: {},
      by_regulator: {},
      by_charter_family: {},
      by_business_role: {},
      by_status: {},
    }
  );
}

export async function searchEntities(options: SearchOptions) {
  const supabase = getSupabase();
  const [hasRegistryTable, hasEcosystemTable] = await Promise.all([
    tableExists('registry_entities'),
    tableExists('ecosystem_entities'),
  ]);

  const [allInstitutionRows, registryRows, ecosystemRows] = await Promise.all([
    fetchAllPages<InstitutionRow>((from, to) =>
      supabase
        .from('institutions')
        .select('id, cert_number, source, name, legal_name, charter_type, active, city, state, website, regulator, holding_company, total_assets, total_deposits, total_loans, net_income, roa, roi, raw_data, data_as_of, last_synced_at, created_at, updated_at')
        .range(from, to)
    ),
    hasRegistryTable
      ? fetchAllPages<RegistryEntityRow>((from, to) =>
          supabase
            .from('registry_entities')
            .select('id, source_key, name, legal_name, entity_subtype, active, city, state, website, regulator, registration_number, status, description, raw_data, data_as_of, last_synced_at, created_at, updated_at, country')
            .range(from, to)
        )
      : Promise.resolve([] as RegistryEntityRow[]),
    hasEcosystemTable
      ? fetchAllPages<EcosystemEntityRow>((from, to) =>
          supabase
            .from('ecosystem_entities')
            .select('id, source_key, source_authority, name, legal_name, entity_type, business_model, active, status, country, city, state, website, description, parent_name, confidence_score, raw_data, data_as_of, last_synced_at, created_at, updated_at')
            .range(from, to)
        )
      : Promise.resolve([] as EcosystemEntityRow[]),
  ]);

  const institutionRows =
    registryRows.length > 0
      ? allInstitutionRows.filter((row) => !REGISTRY_SOURCES.has(row.source))
      : allInstitutionRows;

  const entityRefs = [
    ...institutionRows.map((row) => ({ entity_table: 'institutions' as const, entity_id: row.id })),
    ...registryRows.map((row) => ({ entity_table: 'registry_entities' as const, entity_id: row.id })),
    ...ecosystemRows.map((row) => ({ entity_table: 'ecosystem_entities' as const, entity_id: row.id })),
  ];

  const [tagsMap, capabilityMap] = await Promise.all([
    loadTags(entityRefs),
    loadCapabilityMap(
      institutionRows
        .map((row) => row.cert_number)
        .filter((value): value is number => typeof value === 'number')
    ),
  ]);

  const entities: EntitySummary[] = [
    ...institutionRows.map((row) =>
      mapInstitutionToSummary(row, tagsMap.get(`institutions:${row.id}`) ?? [], row.cert_number ? capabilityMap.get(row.cert_number) : null)
    ),
    ...registryRows.map((row) => mapRegistryToSummary(row, tagsMap.get(`registry_entities:${row.id}`) ?? [])),
    ...ecosystemRows.map((row) => mapEcosystemToSummary(row, tagsMap.get(`ecosystem_entities:${row.id}`) ?? [])),
  ];

  const filtered = applySearchFilters(entities, options);
  const page = Math.max(1, options.page ?? 1);
  const perPage = Math.min(50, Math.max(1, options.perPage ?? 24));
  const start = (page - 1) * perPage;
  const paged = filtered.slice(start, start + perPage);

  return {
    entities: paged,
    total: filtered.length,
    page,
    per_page: perPage,
    aggregations: aggregateEntities(filtered),
  };
}

async function loadInstitutionById(entityId: string) {
  return safeMaybeSingle<InstitutionRow>(
    getSupabase()
      .from('institutions')
      .select('id, cert_number, source, name, legal_name, charter_type, active, city, state, website, regulator, holding_company, total_assets, total_deposits, total_loans, net_income, roa, roi, raw_data, data_as_of, last_synced_at, created_at, updated_at')
      .eq('id', entityId)
      .maybeSingle()
  );
}

async function loadRegistryById(entityId: string) {
  return safeMaybeSingle<RegistryEntityRow>(
    getSupabase()
      .from('registry_entities')
      .select('id, source_key, name, legal_name, entity_subtype, active, city, state, website, regulator, registration_number, status, description, raw_data, data_as_of, last_synced_at, created_at, updated_at, country')
      .eq('id', entityId)
      .maybeSingle()
  );
}

async function loadEcosystemById(entityId: string) {
  return safeMaybeSingle<EcosystemEntityRow>(
    getSupabase()
      .from('ecosystem_entities')
      .select('id, source_key, source_authority, name, legal_name, entity_type, business_model, active, status, country, city, state, website, description, parent_name, confidence_score, raw_data, data_as_of, last_synced_at, created_at, updated_at')
      .eq('id', entityId)
      .maybeSingle()
  );
}

export async function getEntityById(entityId: string): Promise<EntityDetail | null> {
  const [institutionRow, registryRow, ecosystemRow] = await Promise.all([
    loadInstitutionById(entityId),
    loadRegistryById(entityId),
    loadEcosystemById(entityId),
  ]);

  if (!institutionRow && !registryRow && !ecosystemRow) return null;

  const storageTable: EntityStorageTable = institutionRow ? 'institutions' : registryRow ? 'registry_entities' : 'ecosystem_entities';
  const externalIds = await loadExternalIds(storageTable, entityId);
  const tagsMap = await loadTags([{ entity_table: storageTable, entity_id: entityId }]);
  const tags = tagsMap.get(`${storageTable}:${entityId}`) ?? [];

  if (institutionRow) {
    const capabilityMap = await loadCapabilityMap(
      institutionRow.cert_number != null ? [institutionRow.cert_number] : []
    );
    const summary = mapInstitutionToSummary(
      institutionRow,
      tags,
      institutionRow.cert_number != null ? capabilityMap.get(institutionRow.cert_number) : null
    );
    return {
      ...summary,
      aliases: [],
      parent_name: institutionRow.holding_company,
      holding_company: institutionRow.holding_company,
      raw_data: institutionRow.raw_data,
      created_at: institutionRow.created_at,
      updated_at: institutionRow.updated_at,
      external_ids: externalIds,
      tags,
    };
  }

  if (registryRow) {
    const summary = mapRegistryToSummary(registryRow, tags);
    return {
      ...summary,
      aliases: [],
      parent_name: null,
      holding_company: null,
      raw_data: registryRow.raw_data,
      created_at: registryRow.created_at,
      updated_at: registryRow.updated_at,
      external_ids: externalIds,
      tags,
    };
  }

  const summary = mapEcosystemToSummary(ecosystemRow!, tags);
  return {
    ...summary,
    aliases: [],
    parent_name: ecosystemRow!.parent_name,
    holding_company: null,
    raw_data: ecosystemRow!.raw_data,
    created_at: ecosystemRow!.created_at,
    updated_at: ecosystemRow!.updated_at,
    external_ids: externalIds,
    tags,
  };
}

async function loadEntityFacts(storageTable: EntityStorageTable, entityId: string) {
  const supabase = getSupabase();
  const hasWarehouseFacts = await tableExists('entity_facts');
  const facts = hasWarehouseFacts
    ? await safeRows<{
        id: string;
        source_kind: string | null;
        source_url: string | null;
        fact_type: string | null;
        fact_key: string | null;
        fact_value_text: string | null;
        fact_value_number: number | null;
        fact_value_json: Record<string, unknown> | null;
        confidence_score: number | null;
        observed_at: string | null;
      }>(
        supabase
          .from('entity_facts')
          .select('id, source_kind, source_url, fact_type, fact_key, fact_value_text, fact_value_number, fact_value_json, confidence_score, observed_at')
          .eq('entity_table', storageTable)
          .eq('entity_id', entityId)
          .order('observed_at', { ascending: false })
          .limit(20)
      )
    : [];

  if (facts.length > 0) return facts;

  const entity = await getEntityById(entityId);
  if (!entity) return [];

  const fallbackFacts = [] as Array<{
    id: string;
    source_kind: string | null;
    source_url: string | null;
    fact_type: string | null;
    fact_key: string | null;
    fact_value_text: string | null;
    fact_value_number: number | null;
    fact_value_json: Record<string, unknown> | null;
    confidence_score: number | null;
    observed_at: string | null;
  }>;

  if (entity.storage_table === 'institutions') {
    fallbackFacts.push(
      ...(entity.cert_number != null
        ? [{
            id: `legacy-cert-${entity.id}`,
            source_kind: 'curated',
            source_url: null,
            fact_type: 'identity',
            fact_key: 'cert_number',
            fact_value_text: String(entity.cert_number),
            fact_value_number: entity.cert_number,
            fact_value_json: null,
            confidence_score: 0.7,
            observed_at: entity.data_as_of ?? entity.last_synced_at,
          }]
        : [])
    );
  }

  fallbackFacts.push({
    id: `legacy-source-${entity.id}`,
    source_kind: entity.source_kind,
    source_url: null,
    fact_type: 'source',
    fact_key: 'source_authority',
    fact_value_text: entity.source_authority,
    fact_value_number: null,
    fact_value_json: null,
    confidence_score: 0.9,
    observed_at: entity.data_as_of ?? entity.last_synced_at,
  });

  return fallbackFacts;
}

export async function getEntitySources(entityId: string): Promise<EntitySourceRecord[]> {
  const entity = await getEntityById(entityId);
  if (!entity) return [];

  const facts = await loadEntityFacts(entity.storage_table, entity.id);
  const charterEvents = await loadCharterEvents(entity.storage_table, entity.id);
  const sources: EntitySourceRecord[] = [];

  sources.push({
    label: entity.source_authority,
    url: SOURCE_META[entity.source_key]?.sourceKind === 'official'
      ? null
      : null,
    source_key: entity.source_key,
    source_kind: entity.source_kind,
    authority: entity.source_authority,
    confidence_label: entity.source_kind === 'official' ? 'Official source' : entity.source_kind === 'company' ? 'Company source' : 'Curated source',
    freshness: entity.data_as_of ?? entity.last_synced_at,
    notes: entity.context_summary,
  });

  for (const event of charterEvents) {
    sources.push({
      label: event.event_subtype ?? event.event_type,
      url: event.source_url,
      source_key: entity.source_key,
      source_kind: event.source_kind as EntitySourceKind,
      authority: entity.source_authority,
      confidence_label:
        event.confidence_score != null && event.confidence_score >= 0.8
          ? 'High confidence'
          : 'Curated event',
      freshness: event.event_date,
      notes: event.details,
    });
  }

  for (const fact of facts) {
    sources.push({
      label: fact.fact_key ?? fact.fact_type ?? 'Entity fact',
      url: fact.source_url,
      source_key: null,
      source_kind: (fact.source_kind ?? 'curated') as EntitySourceKind,
      authority:
        fact.source_kind === 'official'
          ? 'Official source'
          : fact.source_kind === 'company'
            ? 'Company source'
            : 'Curated research',
      confidence_label:
        fact.confidence_score != null && fact.confidence_score >= 0.8
          ? 'High confidence'
          : fact.confidence_score != null && fact.confidence_score >= 0.6
            ? 'Medium confidence'
            : 'Exploratory confidence',
      freshness: fact.observed_at,
      notes: fact.fact_value_text,
    });
  }

  return sources;
}

type RelationshipRow = {
  id: string;
  relationship_type: string;
  relationship_label: string | null;
  active: boolean;
  effective_start: string | null;
  effective_end: string | null;
  source_kind: string | null;
  source_url: string | null;
  confidence_score: number | null;
  notes: string | null;
  from_entity_table: EntityStorageTable;
  from_entity_id: string;
  to_entity_table: EntityStorageTable;
  to_entity_id: string;
};

async function loadRelationshipRows(storageTable: EntityStorageTable, entityId: string) {
  const supabase = getSupabase();
  const hasWarehouseRelationships = await tableExists('entity_relationships');
  if (!hasWarehouseRelationships) {
    return { outbound: [], inbound: [] };
  }
  const [outbound, inbound] = await Promise.all([
    safeRows<RelationshipRow>(
      supabase
        .from('entity_relationships')
        .select('id, relationship_type, relationship_label, active, effective_start, effective_end, source_kind, source_url, confidence_score, notes, from_entity_table, from_entity_id, to_entity_table, to_entity_id')
        .eq('from_entity_table', storageTable)
        .eq('from_entity_id', entityId)
    ),
    safeRows<RelationshipRow>(
      supabase
        .from('entity_relationships')
        .select('id, relationship_type, relationship_label, active, effective_start, effective_end, source_kind, source_url, confidence_score, notes, from_entity_table, from_entity_id, to_entity_table, to_entity_id')
        .eq('to_entity_table', storageTable)
        .eq('to_entity_id', entityId)
    ),
  ]);

  return {
    outbound: outbound.map((row) => ({ ...row, direction: 'outbound' as const })),
    inbound: inbound.map((row) => ({ ...row, direction: 'inbound' as const })),
  };
}

async function loadCharterEvents(storageTable: EntityStorageTable, entityId: string) {
  const supabase = getSupabase();
  const hasWarehouseEvents = await tableExists('charter_events');
  if (!hasWarehouseEvents) return [];

  return safeRows<{
    id: string;
    event_type: string;
    event_subtype: string | null;
    event_date: string;
    effective_date: string | null;
    status: string | null;
    details: string | null;
    source_kind: string | null;
    source_url: string | null;
    confidence_score: number | null;
  }>(
    supabase
      .from('charter_events')
      .select('id, event_type, event_subtype, event_date, effective_date, status, details, source_kind, source_url, confidence_score')
      .eq('entity_table', storageTable)
      .eq('entity_id', entityId)
      .order('event_date', { ascending: false })
      .limit(10)
  );
}

async function resolveEntityRefs(refs: Array<{ table: EntityStorageTable; id: string }>) {
  const unique = Array.from(new Set(refs.map((ref) => `${ref.table}:${ref.id}`))).map((key) => {
    const [table, id] = key.split(':');
    return { table: table as EntityStorageTable, id };
  });

  const resolved = new Map<string, EntitySummary>();
  for (const ref of unique) {
    const entity = await getEntityById(ref.id);
    if (entity) {
      resolved.set(`${ref.table}:${ref.id}`, entity);
    }
  }
  return resolved;
}

export async function getEntityRelationships(entityId: string): Promise<EntityRelationship[]> {
  const entity = await getEntityById(entityId);
  if (!entity) return [];

  const { outbound, inbound } = await loadRelationshipRows(entity.storage_table, entity.id);
  const capabilityRows =
    entity.storage_table === 'institutions' && entity.cert_number != null
      ? await safeRows<CapabilityRow>(
          getSupabase()
            .from('bank_capabilities')
            .select('cert_number, baas_platform, baas_partners, notes, fed_master_account, fedwire_participant, visa_principal, mastercard_principal')
            .eq('cert_number', entity.cert_number)
            .limit(1)
        )
      : [];

  const derivedRelationships: EntityRelationship[] = [];
  const capability = capabilityRows[0];
  if (capability?.baas_partners?.length) {
    for (const partner of capability.baas_partners) {
      derivedRelationships.push({
        id: `derived-${entity.id}-${partner}`,
        relationship_type: 'sponsor_bank_for',
        relationship_label: 'Sponsor bank for',
        direction: 'outbound',
        active: true,
        effective_start: null,
        effective_end: null,
        source_kind: 'curated',
        source_url: null,
        confidence_score: 0.6,
        notes: capability.notes,
        counterparty: {
          id: `derived:${partner}`,
          storage_table: 'ecosystem_entities',
          profile_kind: 'ecosystem_entity',
          name: partner,
          country: entity.country,
          country_label: entity.country_label,
          regulator: null,
          entity_type: 'ecosystem_company',
          charter_family: null,
          source_key: 'curated',
          source_authority: 'Curated Research',
        },
      });
    }
  }

  const rows = [...outbound, ...inbound];
  if (rows.length === 0 && capability?.baas_partners?.length) {
    for (const partner of capability.baas_partners) {
      derivedRelationships.push({
        id: `derived-${entity.id}-${partner}`,
        relationship_type: 'sponsor_bank_for',
        relationship_label: 'Sponsor bank for',
        direction: 'outbound',
        active: true,
        effective_start: null,
        effective_end: null,
        source_kind: 'curated',
        source_url: null,
        confidence_score: 0.6,
        notes: capability.notes,
        counterparty: {
          id: `derived:${partner}`,
          storage_table: 'ecosystem_entities',
          profile_kind: 'ecosystem_entity',
          name: partner,
          country: entity.country,
          country_label: entity.country_label,
          regulator: null,
          entity_type: 'ecosystem_company',
          charter_family: null,
          source_key: 'curated',
          source_authority: 'Curated Research',
        },
      });
    }
  }
  const resolved = await resolveEntityRefs(
    rows.map((row) => ({
      table: row.direction === 'outbound' ? row.to_entity_table : row.from_entity_table,
      id: row.direction === 'outbound' ? row.to_entity_id : row.from_entity_id,
    }))
  );

  const mapped = rows
    .map((row) => {
      const refKey = row.direction === 'outbound'
        ? `${row.to_entity_table}:${row.to_entity_id}`
        : `${row.from_entity_table}:${row.from_entity_id}`;
      const counterparty = resolved.get(refKey);
      if (!counterparty) return null;
      return {
        id: row.id,
        relationship_type: row.relationship_type,
        relationship_label: row.relationship_label,
        direction: row.direction,
        active: row.active,
        effective_start: row.effective_start,
        effective_end: row.effective_end,
        source_kind: row.source_kind,
        source_url: row.source_url,
        confidence_score: row.confidence_score,
        notes: row.notes,
        counterparty: {
          id: counterparty.id,
          storage_table: counterparty.storage_table,
          profile_kind: counterparty.profile_kind,
          name: counterparty.name,
          country: counterparty.country,
          country_label: counterparty.country_label,
          regulator: counterparty.regulator,
          entity_type: counterparty.entity_type,
          charter_family: counterparty.charter_family,
          source_key: counterparty.source_key,
          source_authority: counterparty.source_authority,
        },
      } satisfies EntityRelationship;
    })
    .filter((value): value is EntityRelationship => value != null);

  return [...mapped, ...derivedRelationships];
}

export async function getEntityHistory(entityId: string): Promise<EntityHistoryPoint[]> {
  const entity = await getEntityById(entityId);
  if (!entity) return [];

  const supabase = getSupabase();
  const hasQuarterlyHistory = await tableExists('financial_history_quarterly');
  const quarterly = hasQuarterlyHistory
    ? await safeRows<EntityHistoryPoint>(
        supabase
          .from('financial_history_quarterly')
          .select('period, total_assets, total_deposits, total_loans, net_income, equity_capital, roa, roi, credit_card_loans')
          .eq('entity_table', entity.storage_table)
          .eq('entity_id', entity.id)
          .order('period', { ascending: false })
          .limit(20)
      )
    : [];

  if (quarterly.length > 0) return quarterly;

  if (entity.storage_table === 'institutions' && entity.cert_number != null) {
    return safeRows<EntityHistoryPoint>(
      supabase
        .from('financial_history')
        .select('period, total_assets, total_deposits, total_loans, net_income, equity_capital, roa, roi, credit_card_loans')
        .eq('cert_number', entity.cert_number)
        .order('period', { ascending: false })
        .limit(20)
    );
  }

  return [];
}

export async function getEntityContext(entityId: string): Promise<EntityContextResponse | null> {
  const [entity, relationships, sources, history] = await Promise.all([
    getEntityById(entityId),
    getEntityRelationships(entityId),
    getEntitySources(entityId),
    getEntityHistory(entityId),
  ]);

  if (!entity) return null;

  const [facts, charterEvents] = await Promise.all([
    loadEntityFacts(entity.storage_table, entity.id),
    loadCharterEvents(entity.storage_table, entity.id),
  ]);
  const latestHistory = history[0] ?? null;
  const latestCharterEvent = charterEvents[0] ?? null;
  const craRating = facts.find((fact) => fact.fact_key === 'cra_rating');
  const latestEnforcement = facts.find((fact) => fact.fact_key === 'fdic_enforcement_action');
  const complaintTotal = facts.find((fact) =>
    ['cfpb_complaints_recent_12m_total', 'cfpb_complaints_total', 'cfpb_complaints_summary'].includes(fact.fact_key ?? '')
  );
  const complaintSummary = facts.find((fact) => fact.fact_key === 'cfpb_complaints_summary');
  const sourceTone = toneFromStatus(entity.active, entity.status);
  const sections = [
    {
      key: 'identity',
      title: 'Identity Context',
      summary: `${entity.name} is classified as a ${entity.entity_type.replace(/_/g, ' ')} in ${entity.country_label}.`,
      items: [
        { label: 'Profile type', value: entity.profile_kind.replace(/_/g, ' '), tone: 'default' as const },
        { label: 'Legal name', value: entity.legal_name ?? entity.name },
        { label: 'Location', value: [entity.city, entity.state, entity.country_label].filter(Boolean).join(', ') || entity.country_label },
        { label: 'Status', value: entity.status.replace(/_/g, ' '), tone: sourceTone },
      ],
    },
    {
      key: 'regulatory',
      title: 'Regulatory Context',
      summary:
        latestCharterEvent
          ? `${entity.source_authority} anchors the profile, and the latest recorded charter event is ${latestCharterEvent.event_type.replace(/_/g, ' ')} on ${latestCharterEvent.event_date}.`
          : `${entity.source_authority} is the primary authority for this profile today.`,
      items: [
        { label: 'Regulator / authority', value: entity.regulator ?? entity.source_authority },
        { label: 'Charter / registration family', value: entity.charter_family?.replace(/_/g, ' ') ?? 'Not classified yet' },
        { label: 'Source authority', value: entity.source_authority },
        { label: 'Data as of', value: entity.data_as_of ?? entity.last_synced_at ?? 'Unknown freshness' },
        ...(craRating?.fact_value_text
          ? [{ label: 'CRA posture', value: craRating.fact_value_text }]
          : []),
        ...(latestEnforcement?.fact_value_text
          ? [{
              label: 'Latest enforcement action',
              value: `${latestEnforcement.fact_value_text}${latestEnforcement.observed_at ? ` · ${latestEnforcement.observed_at}` : ''}`,
              tone: 'caution' as const,
            }]
          : []),
        ...(latestCharterEvent
          ? [{
              label: 'Latest charter event',
              value: `${(latestCharterEvent.event_subtype ?? latestCharterEvent.event_type).replace(/_/g, ' ')} · ${latestCharterEvent.event_date}`,
              tone: latestCharterEvent.event_type === 'failure' ? 'critical' as const : 'default' as const,
            }]
          : []),
      ],
    },
    {
      key: 'business_model',
      title: 'Business-Model Context',
      summary:
        entity.business_roles.length > 0
          ? `This profile is tagged with ${entity.business_roles.length} business role${entity.business_roles.length > 1 ? 's' : ''}.`
          : 'Business-model tags are still sparse for this profile.',
      items: [
        { label: 'Entity type', value: entity.entity_type.replace(/_/g, ' ') },
        { label: 'Business roles', value: entity.business_roles.length > 0 ? entity.business_roles.map((role) => role.replace(/_/g, ' ')).join(', ') : 'No role tags yet' },
        { label: 'Market roles', value: entity.market_roles.length > 0 ? entity.market_roles.map((role) => role.replace(/_/g, ' ')).join(', ') : 'No market-role tags yet' },
      ],
    },
    {
      key: 'financial',
      title: 'Financial Context',
      summary:
        entity.metrics.total_assets != null
          ? `Current financial snapshot is available with ${history.length} historical observation${history.length === 1 ? '' : 's'}.`
          : 'No standard financial statement snapshot is currently attached to this profile.',
      items: [
        { label: 'Total assets', value: entity.metrics.total_assets != null ? `$${entity.metrics.total_assets.toLocaleString()}` : 'Not disclosed' },
        { label: 'Total deposits', value: entity.metrics.total_deposits != null ? `$${entity.metrics.total_deposits.toLocaleString()}` : 'Not disclosed' },
        { label: 'ROA / ROE', value: entity.metrics.roa != null || entity.metrics.roi != null ? `${entity.metrics.roa != null ? `${entity.metrics.roa.toFixed(2)}% ROA` : '—'} · ${entity.metrics.roi != null ? `${entity.metrics.roi.toFixed(2)}% ROE` : '—'}` : 'Not disclosed' },
        { label: 'Latest historical point', value: latestHistory?.period ?? 'No history loaded' },
      ],
    },
    {
      key: 'relationships',
      title: 'Relationship Context',
      summary:
        relationships.length > 0
          ? `${relationships.length} relationship${relationships.length === 1 ? '' : 's'} surfaced for this profile.`
          : 'No structured relationship graph has been loaded yet.',
      items: relationships.slice(0, 4).map((rel) => ({
        label: rel.relationship_label ?? rel.relationship_type.replace(/_/g, ' '),
        value: rel.counterparty.name,
        tone: rel.active ? 'positive' : 'caution',
      })),
    },
    {
      key: 'market',
      title: 'Market Context',
      summary:
        complaintTotal?.fact_value_number != null || latestEnforcement != null
          ? 'Market context combines geography, source posture, and regulatory-pressure signals.'
          : 'Market context combines geography, source class, and cross-border positioning.',
      items: [
        { label: 'Jurisdiction', value: entity.country_label },
        { label: 'Source class', value: entity.source_kind === 'official' ? 'Official regulatory source' : entity.source_kind === 'company' ? 'Company disclosure' : 'Curated research' },
        { label: 'Cross-border lens', value: entity.country === 'CA' ? 'Canada-facing profile' : entity.country === 'US' ? 'United States-facing profile' : 'North America' },
        ...(latestEnforcement?.fact_value_text
          ? [{
              label: 'Supervisory signal',
              value: latestEnforcement.fact_value_text,
              tone: 'caution' as const,
            }]
          : []),
        ...(complaintTotal?.fact_value_number != null
          ? [{
              label: 'CFPB complaint signal',
              value: complaintTotal.fact_value_text ?? `${complaintTotal.fact_value_number.toLocaleString()} complaints`,
              tone: complaintTotal.fact_value_number >= 1000 ? 'caution' as const : 'default' as const,
            }]
          : []),
        ...(complaintSummary?.fact_value_text
          ? [{ label: 'Complaint summary', value: complaintSummary.fact_value_text }]
          : []),
      ],
    },
    {
      key: 'sources',
      title: 'Source Context',
      summary: `${sources.length} source reference${sources.length === 1 ? '' : 's'} are attached to this profile.`,
      items: sources.slice(0, 4).map((source) => ({
        label: source.authority,
        value: source.confidence_label,
        tone: source.source_kind === 'official' ? 'positive' : source.source_kind === 'company' ? 'default' : 'caution',
        url: source.url,
      })),
    },
    {
      key: 'ai',
      title: 'AI Context',
      summary: entity.context_summary,
      items: [
        { label: 'Why this matters', value: entity.context_summary },
        {
          label: 'Coverage gap',
          value:
            relationships.length === 0
              ? 'Relationship graph still needs enrichment.'
              : latestCharterEvent == null && complaintTotal == null && latestEnforcement == null
                ? 'Relationship coverage is improving, but event and regulatory context are still sparse here.'
                : 'Relationship graph is beginning to form.',
        },
        { label: 'Evidence posture', value: entity.source_kind === 'official' ? 'Primary-source anchored.' : 'Mix of curated and source-backed context.' },
      ],
    },
  ] satisfies EntityContextResponse['sections'];

  const nonEmptySectionCount = sections.filter((section) => section.items.length > 0).length;
  const contextCompleteness = Math.round((nonEmptySectionCount / sections.length) * 100);

  return {
    context_completeness: contextCompleteness,
    sections,
  };
}


// =============================================================================
// Institution summary MV — typed reads for Phase 2 API convergence
// =============================================================================

export type InstitutionSummaryRow = {
  id: string;
  cert_number: number;
  source: string;
  name: string;
  legal_name: string | null;
  charter_type: string | null;
  active: boolean;
  city: string | null;
  state: string | null;
  zip: string | null;
  county: string | null;
  latitude: number | null;
  longitude: number | null;
  website: string | null;
  established_date: string | null;
  regulator: string | null;
  holding_company: string | null;
  holding_company_id: string | null;
  total_assets: number | null;
  total_deposits: number | null;
  total_loans: number | null;
  num_branches: number | null;
  num_employees: number | null;
  roa: number | null;
  roi: number | null;
  equity_capital: number | null;
  net_income: number | null;
  credit_card_loans: number | null;
  bd_exclusion_reason: string | null;
  data_as_of: string | null;
  // Brim fields
  brim_score: number | null;
  brim_tier: string | null;
  core_processor: string | null;
  core_processor_confidence: string | null;
  agent_bank_program: string | null;
  card_portfolio_size: number | null;
  issues_credit_cards: boolean | null;
  issues_debit_cards: boolean | null;
  credit_card_issuer_processor: string | null;
  debit_network: string | null;
  card_program_manager: string | null;
  // Latest quarterly snapshot
  latest_quarter: string | null;
  q_total_assets: number | null;
  q_roa: number | null;
  q_net_income: number | null;
  last_synced_at: string | null;
  updated_at: string | null;
};

export type InstitutionSearchParams = {
  q?: string;
  states?: string[];
  sources?: string[];
  charter_types?: string[];
  regulators?: string[];
  min_assets?: number | null;
  max_assets?: number | null;
  min_deposits?: number | null;
  max_deposits?: number | null;
  min_branches?: number | null;
  max_branches?: number | null;
  min_roa?: number | null;
  max_roa?: number | null;
  min_roi?: number | null;
  max_roi?: number | null;
  has_credit_cards?: boolean;
  min_brim_score?: number | null;
  brim_tier?: string | null;
  exclude_bd_exclusions?: boolean;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
  page?: number;
  per_page?: number;
};

export type InstitutionSearchResult = {
  data: InstitutionSummaryRow[];
  total: number;
  page: number;
  per_page: number;
};

const ALLOWED_INSTITUTION_SORTS = new Set([
  'name', 'total_assets', 'total_deposits', 'total_loans',
  'num_branches', 'roa', 'roi', 'net_income', 'credit_card_loans',
  'equity_capital', 'state', 'brim_score', 'card_portfolio_size',
]);

export async function searchInstitutions(params: InstitutionSearchParams): Promise<InstitutionSearchResult> {
  const supabase = getSupabase();

  const page = Math.max(1, params.page ?? 1);
  const perPage = Math.min(100, Math.max(1, params.per_page ?? 25));
  const offset = (page - 1) * perPage;
  const sortBy = ALLOWED_INSTITUTION_SORTS.has(params.sort_by ?? '') ? (params.sort_by as string) : 'total_assets';
  const ascending = params.sort_dir === 'asc';

  let query = supabase
    .from('institution_summary_mv')
    .select('*', { count: 'exact' });

  // Full-text search via ilike fallback (MV has search_vector but Supabase JS doesn't expose tsquery)
  if (params.q) {
    const term = `%${params.q}%`;
    query = query.or(`name.ilike.${term},city.ilike.${term},holding_company.ilike.${term}`);
  }

  if (params.states?.length)       query = query.in('state', params.states);
  if (params.sources?.length)      query = query.in('source', params.sources);
  if (params.charter_types?.length) query = query.in('charter_type', params.charter_types);
  if (params.regulators?.length)   query = query.in('regulator', params.regulators);
  if (params.min_assets  != null)  query = query.gte('total_assets',   params.min_assets);
  if (params.max_assets  != null)  query = query.lte('total_assets',   params.max_assets);
  if (params.min_deposits != null) query = query.gte('total_deposits', params.min_deposits);
  if (params.max_deposits != null) query = query.lte('total_deposits', params.max_deposits);
  if (params.min_branches != null) query = query.gte('num_branches',   params.min_branches);
  if (params.max_branches != null) query = query.lte('num_branches',   params.max_branches);
  if (params.min_roa != null)      query = query.gte('roa', params.min_roa);
  if (params.max_roa != null)      query = query.lte('roa', params.max_roa);
  if (params.min_roi != null)      query = query.gte('roi', params.min_roi);
  if (params.max_roi != null)      query = query.lte('roi', params.max_roi);
  if (params.has_credit_cards)     query = query.gt('credit_card_loans', 0);
  if (params.min_brim_score != null) query = query.gte('brim_score', params.min_brim_score);
  if (params.brim_tier)            query = query.eq('brim_tier', params.brim_tier.toUpperCase());
  if (params.exclude_bd_exclusions) query = query.is('bd_exclusion_reason', null);

  query = query
    .order(sortBy, { ascending, nullsFirst: false })
    .range(offset, offset + perPage - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return {
    data: (data ?? []) as InstitutionSummaryRow[],
    total: count ?? 0,
    page,
    per_page: perPage,
  };
}

export async function getInstitutionSummary(certNumber: number): Promise<InstitutionSummaryRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('institution_summary_mv')
    .select('*')
    .eq('cert_number', certNumber)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as InstitutionSummaryRow | null;
}

// ─── QA ───────────────────────────────────────────────────────────────────────

export interface QADatabaseSummary {
  total_fdic_institutions: number;
  total_active_fdic: number;
  institutions_with_raw_data: number;
  stale_records_count: number;
}

/** Returns database-level counts used by GET /api/qa/status. */
export async function getQADatabaseSummary(): Promise<QADatabaseSummary> {
  const supabase = getSupabase();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const sixMonthsAgoStr = sixMonthsAgo.toISOString().split('T')[0];

  const [totalResult, activeResult, rawDataResult, staleResult] = await Promise.all([
    supabase
      .from('institutions')
      .select('*', { count: 'exact', head: true })
      .eq('source', 'fdic'),
    supabase
      .from('institutions')
      .select('*', { count: 'exact', head: true })
      .eq('source', 'fdic')
      .eq('active', true),
    supabase
      .from('institutions')
      .select('*', { count: 'exact', head: true })
      .eq('source', 'fdic')
      .not('raw_data', 'is', null),
    supabase
      .from('institutions')
      .select('*', { count: 'exact', head: true })
      .eq('source', 'fdic')
      .eq('active', true)
      .lt('data_as_of', sixMonthsAgoStr),
  ]);

  for (const r of [totalResult, activeResult, rawDataResult, staleResult]) {
    if (r.error) throw new Error(r.error.message);
  }

  return {
    total_fdic_institutions: totalResult.count ?? 0,
    total_active_fdic: activeResult.count ?? 0,
    institutions_with_raw_data: rawDataResult.count ?? 0,
    stale_records_count: staleResult.count ?? 0,
  };
}

export interface QACheckParams {
  certNumber?: number;
  sample?: number;
}

export interface QACheckInstitutionsResult {
  mode: 'single' | 'sample';
  institutions: InstitutionRow[];
}

/**
 * Fetches institution rows for GET /api/qa/check.
 * Returns a single institution by cert, or a random sample of N active FDIC institutions.
 */
export async function getQACheckInstitutions(
  params: QACheckParams,
): Promise<QACheckInstitutionsResult> {
  const supabase = getSupabase();

  if (params.certNumber != null) {
    const { data, error } = await supabase
      .from('institutions')
      .select('*')
      .eq('cert_number', params.certNumber)
      .eq('source', 'fdic')
      .single();
    if (error) throw Object.assign(new Error(error.message), { status: 404 });
    return { mode: 'single', institutions: [data as InstitutionRow] };
  }

  const n = Math.min(50, Math.max(1, params.sample ?? 20));
  const { count } = await supabase
    .from('institutions')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'fdic')
    .eq('active', true);

  const total = count ?? 0;
  const offset = total > n ? Math.floor(Math.random() * (total - n)) : 0;

  const { data, error } = await supabase
    .from('institutions')
    .select('*')
    .eq('source', 'fdic')
    .eq('active', true)
    .range(offset, offset + n - 1);

  if (error) throw new Error(error.message);
  return { mode: 'sample', institutions: (data ?? []) as InstitutionRow[] };
}
