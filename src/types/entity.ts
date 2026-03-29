export type EntityStorageTable = 'institutions' | 'registry_entities' | 'ecosystem_entities';

export type EntityProfileKind =
  | 'regulated_institution'
  | 'registry_entity'
  | 'ecosystem_entity';

export type EntitySourceKind = 'official' | 'company' | 'curated';

export interface EntityMetricSnapshot {
  total_assets: number | null;
  total_deposits: number | null;
  total_loans: number | null;
  net_income: number | null;
  roa: number | null;
  roi: number | null;
}

export interface EntitySummary {
  id: string;
  storage_table: EntityStorageTable;
  profile_kind: EntityProfileKind;
  source_key: string;
  source_authority: string;
  source_kind: EntitySourceKind;
  name: string;
  legal_name: string | null;
  description: string | null;
  country: string;
  country_label: string;
  city: string | null;
  state: string | null;
  website: string | null;
  regulator: string | null;
  entity_type: string;
  charter_family: string | null;
  business_roles: string[];
  market_roles: string[];
  status: string;
  active: boolean;
  confidence_score: number | null;
  data_as_of: string | null;
  last_synced_at: string | null;
  context_summary: string;
  metrics: EntityMetricSnapshot;
  cert_number: number | null;
}

export interface EntityDetail extends EntitySummary {
  aliases: string[];
  parent_name: string | null;
  holding_company: string | null;
  raw_data: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
  external_ids: EntityExternalId[];
  tags: EntityTag[];
}

export interface EntityTag {
  id?: string;
  entity_table: EntityStorageTable;
  entity_id: string;
  tag_key: string;
  tag_value: string;
  source_kind: EntitySourceKind | string;
  source_url: string | null;
  confidence_score: number | null;
  effective_start: string | null;
  effective_end: string | null;
  notes: string | null;
}

export interface EntityExternalId {
  id?: string;
  entity_table: EntityStorageTable;
  entity_id: string;
  id_type: string;
  id_value: string;
  is_primary: boolean;
  source_url: string | null;
}

export interface EntityRelationship {
  id: string;
  relationship_type: string;
  relationship_label: string | null;
  direction: 'outbound' | 'inbound';
  active: boolean;
  effective_start: string | null;
  effective_end: string | null;
  source_kind: string | null;
  source_url: string | null;
  confidence_score: number | null;
  notes: string | null;
  counterparty: Pick<
    EntitySummary,
    | 'id'
    | 'storage_table'
    | 'profile_kind'
    | 'name'
    | 'country'
    | 'country_label'
    | 'regulator'
    | 'entity_type'
    | 'charter_family'
    | 'source_key'
    | 'source_authority'
  >;
}

export interface EntitySourceRecord {
  label: string;
  url: string | null;
  source_key: string | null;
  source_kind: EntitySourceKind | string;
  authority: string;
  confidence_label: string;
  freshness: string | null;
  notes: string | null;
}

export interface EntityHistoryPoint {
  period: string;
  total_assets: number | null;
  total_deposits: number | null;
  total_loans: number | null;
  net_income: number | null;
  equity_capital: number | null;
  roa: number | null;
  roi: number | null;
  credit_card_loans: number | null;
}

export interface EntityContextItem {
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'caution' | 'critical';
  url?: string | null;
}

export interface EntityContextSection {
  key:
    | 'identity'
    | 'regulatory'
    | 'business_model'
    | 'financial'
    | 'relationships'
    | 'market'
    | 'sources'
    | 'ai';
  title: string;
  summary: string;
  items: EntityContextItem[];
}

export interface EntityContextResponse {
  context_completeness: number;
  sections: EntityContextSection[];
}

export interface EntitySearchAggregations {
  by_country: Record<string, number>;
  by_profile_kind: Record<EntityProfileKind, number>;
  by_source_key: Record<string, number>;
}

export interface EntitySearchResponse {
  entities: EntitySummary[];
  total: number;
  page: number;
  per_page: number;
  aggregations: EntitySearchAggregations;
}
