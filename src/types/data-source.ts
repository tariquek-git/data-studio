export type DataSourceStatus = 'active' | 'pending' | 'unavailable';

export type DataSourceCategory =
  | 'institution_registry'
  | 'financial_filings'
  | 'holding_company'
  | 'community_reinvestment'
  | 'payments_infrastructure'
  | 'market_data'
  | 'complaint_data'
  | 'corporate_filings'
  | 'licensing_registry';

export type DataSourceCoverageType =
  | 'institutions'
  | 'entities'
  | 'series'
  | 'records'
  | 'filings'
  | 'complaints';

export interface DataSourceSyncJob {
  source: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | string;
  records_processed: number | null;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
}

export interface DataSourceSyncRequirement {
  code: string;
  label: string;
  type: 'env' | 'file' | 'credential' | 'manual';
  ready: boolean;
  optional: boolean;
  docs_url: string | null;
}

export interface DataSourceSyncCapability {
  supported: boolean;
  ready: boolean;
  endpoint: string | null;
  execution_kind: 'script' | 'native' | null;
  script_path: string | null;
  supports_dry_run: boolean;
  requirements: DataSourceSyncRequirement[];
  notes: string[];
}

export interface DataSourceSummary {
  id: string;
  source_key: string;
  display_name: string;
  description: string | null;
  country: string;
  country_label: string;
  regulator_url: string | null;
  data_url: string | null;
  update_frequency: string | null;
  status: DataSourceStatus;
  notes: string | null;
  category: DataSourceCategory;
  category_label: string;
  coverage_type: DataSourceCoverageType;
  coverage_label: string;
  record_count: number | null;
  institution_count: number | null;
  last_synced_at: string | null;
  data_as_of: string | null;
  latest_job_status: string | null;
  loaded: boolean;
  created_at: string | null;
  sync_supported: boolean;
  sync_ready: boolean | null;
  sync_endpoint: string | null;
}

export interface DataSourceDetail extends DataSourceSummary {
  latest_sync_job: DataSourceSyncJob | null;
  sync: DataSourceSyncCapability | null;
}

export interface DataSourcesResponse {
  sources: DataSourceSummary[];
  total: number;
  summary: {
    active: number;
    pending: number;
    unavailable: number;
    loaded: number;
  };
}
