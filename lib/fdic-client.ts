import type { Institution, FinancialHistory, Branch } from '../src/types/institution';

const BASE_URL = 'https://banks.data.fdic.gov/api';

// ---------------------------------------------------------------------------
// Field mappings: FDIC API name --> our schema name
// ---------------------------------------------------------------------------

/** Fields requested from the /institutions endpoint */
const INSTITUTION_FIELDS = [
  'CERT', 'INSTNAME', 'CITY', 'STALP', 'STNAME', 'ZIP', 'COUNTY',
  'LATITUDE', 'LONGITUDE', 'WEBADDR', 'ESTYMD', 'REGAGENT', 'BKCLASS',
  'NAMEHCR', 'HCTMULT', 'ASSET', 'DEP', 'NETLOANS', 'NETINC',
  'EQ', 'ROA', 'ROE', 'OFFDOM', 'NUMEMP', 'LNCRCD', 'NCLNLS',
  'REPDTE', 'ACTIVE',
] as const;

/** Fields requested from the /financials endpoint */
const FINANCIAL_FIELDS = [
  'CERT', 'REPDTE', 'ASSET', 'DEP', 'NETLOANS', 'NETINC',
  'EQ', 'ROA', 'ROE', 'LNCRCD',
] as const;

/** Fields requested from the /locations endpoint */
const LOCATION_FIELDS = [
  'CERT', 'UNINUMBR', 'OFFNAME', 'ADDRESBR', 'CITYBR', 'STALPBR',
  'ZIPBR', 'BRNUMDESC', 'LATITUDE', 'LONGITUDE', 'ESTYMD', 'MAINOFF',
] as const;

// ---------------------------------------------------------------------------
// Charter type mapping
// ---------------------------------------------------------------------------

const CHARTER_TYPE_MAP: Record<string, string> = {
  N: 'commercial',
  SM: 'commercial',
  NM: 'commercial',
  SB: 'savings',
  SA: 'savings_association',
  OI: 'other',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FdicApiResponse<T = Record<string, unknown>> {
  data: Array<{ data: T }>;
  totals: { count: number };
  meta?: { total: number };
}

export interface SearchParams {
  query?: string;
  states?: string[];
  charterTypes?: string[];
  regulators?: string[];
  minAssets?: number;
  maxAssets?: number;
  active?: boolean;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
}

export interface FinancialsOptions {
  /** Number of reporting periods to retrieve (default: 20) */
  limit?: number;
  /** Sort order for REPDTE (default: DESC — most recent first) */
  sortOrder?: 'ASC' | 'DESC';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * FDIC amounts are reported in THOUSANDS — multiply by 1000 to get actual
 * dollar values.
 */
function thousands(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n * 1000 : null;
}

function num(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function str(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null;
  return String(val);
}

function bool(val: unknown): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1;
  if (typeof val === 'string') return val === '1' || val.toLowerCase() === 'y';
  return false;
}

/** Build an Elasticsearch-style filter string from SearchParams */
function buildFilters(params: SearchParams): string {
  const clauses: string[] = [];

  if (params.states?.length) {
    const stateFilter = params.states.map((s) => `STALP:"${s}"`).join(' OR ');
    clauses.push(`(${stateFilter})`);
  }
  if (params.charterTypes?.length) {
    const ctFilter = params.charterTypes.map((c) => `BKCLASS:"${c}"`).join(' OR ');
    clauses.push(`(${ctFilter})`);
  }
  if (params.regulators?.length) {
    const regFilter = params.regulators.map((r) => `REGAGENT:"${r}"`).join(' OR ');
    clauses.push(`(${regFilter})`);
  }
  if (params.minAssets != null) {
    // FDIC stores in thousands, so convert our dollar value to thousands
    clauses.push(`ASSET:[${params.minAssets / 1000} TO *]`);
  }
  if (params.maxAssets != null) {
    clauses.push(`ASSET:[* TO ${params.maxAssets / 1000}]`);
  }
  if (params.active !== undefined) {
    clauses.push(`ACTIVE:${params.active ? 1 : 0}`);
  }
  if (params.query) {
    clauses.push(`INSTNAME:"*${params.query}*"`);
  }

  return clauses.join(' AND ');
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function mapInstitution(row: Record<string, unknown>): Institution {
  const certNumber = Number(row.CERT);
  return {
    id: `fdic-${certNumber}`,
    cert_number: certNumber,
    source: 'fdic',
    name: str(row.INSTNAME) ?? '',
    legal_name: null,
    charter_type: CHARTER_TYPE_MAP[String(row.BKCLASS)] ?? str(row.BKCLASS),
    active: bool(row.ACTIVE),
    city: str(row.CITY),
    state: str(row.STALP),
    zip: str(row.ZIP),
    county: str(row.COUNTY),
    latitude: num(row.LATITUDE),
    longitude: num(row.LONGITUDE),
    website: str(row.WEBADDR),
    established_date: str(row.ESTYMD),
    regulator: str(row.REGAGENT),
    holding_company: str(row.NAMEHCR),
    holding_company_id: str(row.HCTMULT),
    total_assets: thousands(row.ASSET),
    total_deposits: thousands(row.DEP),
    total_loans: thousands(row.NETLOANS),
    num_branches: num(row.OFFDOM),
    num_employees: num(row.NUMEMP),
    roi: num(row.ROE),
    roa: num(row.ROA),
    equity_capital: thousands(row.EQ),
    net_income: thousands(row.NETINC),
    credit_card_loans: thousands(row.LNCRCD),
    credit_card_charge_offs: thousands(row.NCLNLS),
    data_as_of: str(row.REPDTE),
    last_synced_at: new Date().toISOString(),
    raw_data: row as Record<string, unknown>,
  };
}

function mapFinancialHistory(
  certNumber: number,
  row: Record<string, unknown>,
): FinancialHistory {
  const repdte = str(row.REPDTE) ?? '';
  return {
    id: `fdic-${certNumber}-${repdte}`,
    institution_id: `fdic-${certNumber}`,
    period: repdte,
    total_assets: thousands(row.ASSET),
    total_deposits: thousands(row.DEP),
    total_loans: thousands(row.NETLOANS),
    net_income: thousands(row.NETINC),
    equity_capital: thousands(row.EQ),
    roa: num(row.ROA),
    roi: num(row.ROE),
    credit_card_loans: thousands(row.LNCRCD),
  };
}

function mapBranch(
  certNumber: number,
  row: Record<string, unknown>,
): Branch {
  const uninumbr = str(row.UNINUMBR) ?? '';
  return {
    id: `fdic-br-${certNumber}-${uninumbr}`,
    institution_id: `fdic-${certNumber}`,
    branch_name: str(row.OFFNAME),
    address: str(row.ADDRESBR),
    city: str(row.CITYBR),
    state: str(row.STALPBR),
    zip: str(row.ZIPBR),
    latitude: num(row.LATITUDE),
    longitude: num(row.LONGITUDE),
    established_date: str(row.ESTYMD),
    main_office: bool(row.MAINOFF),
  };
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function fdicFetch<T = Record<string, unknown>>(
  endpoint: string,
  params: Record<string, string>,
): Promise<FdicApiResponse<T>> {
  const url = new URL(`${BASE_URL}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new FdicApiError(
      `FDIC API error: ${res.status} ${res.statusText}`,
      res.status,
      body,
    );
  }

  return res.json() as Promise<FdicApiResponse<T>>;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class FdicApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = 'FdicApiError';
  }
}

// ---------------------------------------------------------------------------
// FDIC Client — public API
// ---------------------------------------------------------------------------

/**
 * Search FDIC institutions with optional filters and pagination.
 */
export async function searchInstitutions(params: SearchParams = {}): Promise<{
  institutions: Institution[];
  total: number;
}> {
  const filters = buildFilters(params);
  const sortField = params.sortBy ?? 'ASSET';
  const sortOrder = params.sortOrder ?? 'DESC';
  const limit = params.limit ?? 25;
  const offset = params.offset ?? 0;

  const response = await fdicFetch('/financials', {
    filters,
    fields: INSTITUTION_FIELDS.join(','),
    sort_by: sortField,
    sort_order: sortOrder,
    limit: String(limit),
    offset: String(offset),
  });

  const institutions = response.data.map((item) =>
    mapInstitution(item.data as Record<string, unknown>),
  );

  const total = response.totals?.count ?? response.meta?.total ?? institutions.length;

  return { institutions, total };
}

/**
 * Get a single institution by FDIC certificate number.
 */
export async function getInstitution(certNumber: number): Promise<Institution | null> {
  const response = await fdicFetch('/financials', {
    filters: `CERT:${certNumber}`,
    fields: INSTITUTION_FIELDS.join(','),
    sort_by: 'REPDTE',
    sort_order: 'DESC',
    limit: '1',
    offset: '0',
  });

  if (!response.data.length) return null;
  return mapInstitution(response.data[0].data as Record<string, unknown>);
}

/**
 * Get financial history for an institution (multiple reporting periods).
 */
export async function getFinancials(
  certNumber: number,
  options: FinancialsOptions = {},
): Promise<FinancialHistory[]> {
  const limit = options.limit ?? 20;
  const sortOrder = options.sortOrder ?? 'DESC';

  const response = await fdicFetch('/financials', {
    filters: `CERT:${certNumber}`,
    fields: FINANCIAL_FIELDS.join(','),
    sort_by: 'REPDTE',
    sort_order: sortOrder,
    limit: String(limit),
    offset: '0',
  });

  return response.data.map((item) =>
    mapFinancialHistory(certNumber, item.data as Record<string, unknown>),
  );
}

/**
 * Get branch / office locations for an institution.
 */
export async function getLocations(certNumber: number): Promise<Branch[]> {
  const response = await fdicFetch('/locations', {
    filters: `CERT:${certNumber}`,
    fields: LOCATION_FIELDS.join(','),
    sort_by: 'MAINOFF',
    sort_order: 'DESC',
    limit: '500',
    offset: '0',
  });

  return response.data.map((item) =>
    mapBranch(certNumber, item.data as Record<string, unknown>),
  );
}

/**
 * Get aggregate summary data from the FDIC summary endpoint.
 */
export async function getSummary(
  filters: string,
): Promise<Record<string, unknown>[]> {
  const response = await fdicFetch('/summary', {
    filters,
    limit: '100',
    offset: '0',
  });

  return response.data.map((item) => item.data as Record<string, unknown>);
}
