import type { Institution } from './institution';

export interface SearchFilters {
  query: string;
  country: 'US' | 'CA' | null;  // null = All
  states: string[];
  source: ('fdic' | 'ncua' | 'osfi' | 'rpaa' | 'ciro' | 'fintrac' | 'fincen')[];
  charter_types: string[];
  regulators: string[];
  min_assets: number | null;
  max_assets: number | null;
  min_deposits: number | null;
  max_deposits: number | null;
  min_branches: number | null;
  max_branches: number | null;
  has_credit_card_program: boolean | null;
  min_roa: number | null;
  max_roa: number | null;
  min_roi: number | null;
  max_roi: number | null;
  sort_by: SortField;
  sort_dir: 'asc' | 'desc';
  page: number;
  per_page: number;
}

export type SortField =
  | 'name'
  | 'total_assets'
  | 'total_deposits'
  | 'total_loans'
  | 'num_branches'
  | 'roi'
  | 'roa'
  | 'net_income'
  | 'credit_card_loans'
  | 'equity_capital'
  | 'state';

export interface SearchResult {
  institutions: Institution[];
  total: number;
  page: number;
  per_page: number;
  aggregations: SearchAggregations;
}

export interface SearchAggregations {
  total_count: number;
  total_assets_sum: number;
  total_deposits_sum: number;
  avg_assets: number;
  by_state: Record<string, number>;
  by_charter_type: Record<string, number>;
}

// Default empty filters
export const DEFAULT_FILTERS: SearchFilters = {
  query: '',
  country: null,
  states: [],
  source: [],
  charter_types: [],
  regulators: [],
  min_assets: null,
  max_assets: null,
  min_deposits: null,
  max_deposits: null,
  min_branches: null,
  max_branches: null,
  has_credit_card_program: null,
  min_roa: null,
  max_roa: null,
  min_roi: null,
  max_roi: null,
  sort_by: 'total_assets',
  sort_dir: 'desc',
  page: 1,
  per_page: 25,
};

// US state codes for filter dropdowns
export const US_STATES = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' }, { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
  { code: 'DC', name: 'District of Columbia' },
  { code: 'PR', name: 'Puerto Rico' }, { code: 'GU', name: 'Guam' },
  { code: 'VI', name: 'Virgin Islands' }, { code: 'AS', name: 'American Samoa' },
] as const;

// Canadian provinces
export const CA_PROVINCES = [
  { code: 'AB', name: 'Alberta' }, { code: 'BC', name: 'British Columbia' },
  { code: 'MB', name: 'Manitoba' }, { code: 'NB', name: 'New Brunswick' },
  { code: 'NL', name: 'Newfoundland and Labrador' }, { code: 'NS', name: 'Nova Scotia' },
  { code: 'NT', name: 'Northwest Territories' }, { code: 'NU', name: 'Nunavut' },
  { code: 'ON', name: 'Ontario' }, { code: 'PE', name: 'Prince Edward Island' },
  { code: 'QC', name: 'Quebec' }, { code: 'SK', name: 'Saskatchewan' },
  { code: 'YT', name: 'Yukon' },
] as const;
