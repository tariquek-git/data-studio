export interface Institution {
  id: string;
  cert_number: number;
  source: 'fdic' | 'ncua' | 'osfi' | 'rpaa' | 'ciro' | 'fintrac' | 'fincen';
  name: string;
  legal_name: string | null;
  charter_type: string | null; // 'commercial', 'savings', 'savings_association', 'credit_union', etc.
  active: boolean;
  city: string | null;
  state: string | null;
  zip: string | null;
  county: string | null;
  latitude: number | null;
  longitude: number | null;
  website: string | null;
  established_date: string | null;
  regulator: string | null; // 'OCC', 'FDIC', 'FRB', 'NCUA', 'OSFI'
  holding_company: string | null;
  holding_company_id: string | null;
  // Key financials
  total_assets: number | null;
  total_deposits: number | null;
  total_loans: number | null;
  num_branches: number | null;
  num_employees: number | null;
  roi: number | null;
  roa: number | null;
  equity_capital: number | null;
  net_income: number | null;
  // Credit card specific (key for sales targeting)
  credit_card_loans: number | null;
  credit_card_charge_offs: number | null;
  // Metadata
  country: string | null;  // 'US' or 'CA' — null treated as 'US'
  data_as_of: string | null;
  last_synced_at: string | null;
  raw_data: Record<string, unknown> | null;
}

export interface FinancialHistory {
  id: string;
  institution_id: string;
  period: string; // YYYY-MM-DD
  total_assets: number | null;
  total_deposits: number | null;
  total_loans: number | null;
  net_income: number | null;
  equity_capital: number | null;
  roa: number | null;
  roi: number | null;
  credit_card_loans: number | null;
}

export interface Branch {
  id: string;
  institution_id: string;
  branch_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  established_date: string | null;
  main_office: boolean;
}
