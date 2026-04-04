-- Local Postgres warehouse backfill for Data Studio.
--
-- This seeds the entity warehouse tables directly from the mirrored local
-- legacy tables without relying on Supabase/PostgREST.
--
-- Required psql variables:
--   branch_reporting_year

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.data_studio_stable_uuid(seed text)
RETURNS uuid AS $$
  SELECT (
    substr(md5(coalesce(seed, '')), 1, 8) || '-' ||
    substr(md5(coalesce(seed, '')), 9, 4) || '-' ||
    substr(md5(coalesce(seed, '')), 13, 4) || '-' ||
    substr(md5(coalesce(seed, '')), 17, 4) || '-' ||
    substr(md5(coalesce(seed, '')), 21, 12)
  )::uuid;
$$ LANGUAGE sql IMMUTABLE STRICT;

DROP TABLE IF EXISTS tmp_registry_base;

CREATE TEMP TABLE tmp_registry_base AS
SELECT
  public.data_studio_stable_uuid('registry:' || i.source || ':' || i.cert_number::text) AS id,
  i.id AS legacy_institution_id,
  i.cert_number,
  i.source,
  i.name,
  COALESCE(
    NULLIF(BTRIM(i.legal_name), ''),
    NULLIF(BTRIM(i.raw_data->>'en_legal_name'), ''),
    NULLIF(BTRIM(i.raw_data->>'legal_name'), ''),
    i.name
  ) AS legal_name,
  CASE
    WHEN i.source = 'rpaa' THEN 'payment_service_provider'
    WHEN i.source = 'ciro' THEN 'dealer_firm'
    WHEN i.source IN ('fintrac', 'fincen') THEN 'money_services_business'
    ELSE COALESCE(NULLIF(BTRIM(i.charter_type), ''), 'registry_entity')
  END AS entity_subtype,
  COALESCE(i.active, true) AS active,
  COALESCE(
    NULLIF(BTRIM(i.raw_data->>'status'), ''),
    CASE WHEN i.active = false THEN 'inactive' ELSE 'active' END
  ) AS status,
  CASE WHEN i.source = 'fincen' THEN 'US' ELSE 'CA' END AS country,
  i.city,
  i.state,
  i.website,
  i.regulator,
  COALESCE(
    NULLIF(BTRIM(
      CASE
        WHEN i.source = 'rpaa' THEN i.raw_data->>'boc_id'
        WHEN i.source IN ('fintrac', 'fincen') THEN i.raw_data->>'registration_number'
        ELSE NULL
      END
    ), ''),
    NULLIF(BTRIM(i.raw_data->>'registration_number'), ''),
    NULLIF(BTRIM(i.raw_data->>'boc_id'), ''),
    NULLIF(BTRIM(i.raw_data->>'nmls_id'), ''),
    i.cert_number::text
  ) AS registration_number,
  COALESCE(
    NULLIF(BTRIM(i.raw_data->>'group_label'), ''),
    NULLIF(BTRIM(i.raw_data->>'note'), ''),
    CASE
      WHEN i.source = 'rpaa' THEN 'payment_service_provider backfilled from legacy institutions'
      WHEN i.source = 'ciro' THEN 'dealer_firm backfilled from legacy institutions'
      WHEN i.source IN ('fintrac', 'fincen') THEN 'money_services_business backfilled from legacy institutions'
      ELSE 'registry entity backfilled from legacy institutions'
    END
  ) AS description,
  COALESCE(i.raw_data, '{}'::jsonb) || jsonb_build_object(
    'legacy_institution_id', i.id,
    'legacy_cert_number', i.cert_number
  ) AS raw_data,
  i.data_as_of,
  i.last_synced_at
FROM institutions i
WHERE i.source IN ('rpaa', 'ciro', 'fintrac', 'fincen');

INSERT INTO registry_entities (
  id,
  source_key,
  name,
  legal_name,
  entity_subtype,
  active,
  status,
  country,
  city,
  state,
  website,
  regulator,
  registration_number,
  description,
  raw_data,
  data_as_of,
  last_synced_at
)
SELECT
  id,
  source,
  name,
  legal_name,
  entity_subtype,
  active,
  status,
  country,
  city,
  state,
  website,
  regulator,
  registration_number,
  description,
  raw_data,
  data_as_of,
  last_synced_at
FROM tmp_registry_base
ON CONFLICT (id) DO UPDATE SET
  source_key = EXCLUDED.source_key,
  name = EXCLUDED.name,
  legal_name = EXCLUDED.legal_name,
  entity_subtype = EXCLUDED.entity_subtype,
  active = EXCLUDED.active,
  status = EXCLUDED.status,
  country = EXCLUDED.country,
  city = EXCLUDED.city,
  state = EXCLUDED.state,
  website = EXCLUDED.website,
  regulator = EXCLUDED.regulator,
  registration_number = EXCLUDED.registration_number,
  description = EXCLUDED.description,
  raw_data = EXCLUDED.raw_data,
  data_as_of = EXCLUDED.data_as_of,
  last_synced_at = EXCLUDED.last_synced_at,
  updated_at = NOW();

INSERT INTO entity_external_ids (
  id,
  entity_table,
  entity_id,
  id_type,
  id_value,
  is_primary,
  source_url,
  notes
)
WITH institution_ids AS (
  SELECT
    public.data_studio_stable_uuid('ext:' || i.id::text || ':legacy_cert_number:' || i.cert_number::text) AS id,
    'institutions'::text AS entity_table,
    i.id AS entity_id,
    'legacy_cert_number'::text AS id_type,
    i.cert_number::text AS id_value,
    CASE WHEN i.source IN ('fdic', 'ncua') THEN false ELSE true END AS is_primary,
    NULL::text AS source_url,
    'Backfilled from local legacy warehouse activation'::text AS notes
  FROM institutions i

  UNION ALL

  SELECT
    public.data_studio_stable_uuid('ext:' || i.id::text || ':fdic_cert:' || COALESCE(NULLIF(BTRIM(i.raw_data->>'CERT'), ''), i.cert_number::text)) AS id,
    'institutions',
    i.id,
    'fdic_cert',
    COALESCE(NULLIF(BTRIM(i.raw_data->>'CERT'), ''), i.cert_number::text),
    true,
    NULL,
    'Backfilled from local legacy warehouse activation'
  FROM institutions i
  WHERE i.source = 'fdic'

  UNION ALL

  SELECT
    public.data_studio_stable_uuid('ext:' || i.id::text || ':ncua_charter:' || COALESCE(NULLIF(BTRIM(i.raw_data->>'CU_NUMBER'), ''), NULLIF(BTRIM(i.raw_data->>'CREDIT_UNION_NUMBER'), ''), i.cert_number::text)) AS id,
    'institutions',
    i.id,
    'ncua_charter',
    COALESCE(NULLIF(BTRIM(i.raw_data->>'CU_NUMBER'), ''), NULLIF(BTRIM(i.raw_data->>'CREDIT_UNION_NUMBER'), ''), i.cert_number::text),
    true,
    NULL,
    'Backfilled from local legacy warehouse activation'
  FROM institutions i
  WHERE i.source = 'ncua'

  UNION ALL

  SELECT
    public.data_studio_stable_uuid('ext:' || i.id::text || ':rssd_id:' || BTRIM(COALESCE(i.raw_data->>'RSSD', i.raw_data->>'ID_RSSD'))) AS id,
    'institutions',
    i.id,
    'rssd_id',
    BTRIM(COALESCE(i.raw_data->>'RSSD', i.raw_data->>'ID_RSSD')),
    false,
    NULL,
    'Backfilled from local legacy warehouse activation'
  FROM institutions i
  WHERE NULLIF(BTRIM(COALESCE(i.raw_data->>'RSSD', i.raw_data->>'ID_RSSD')), '') IS NOT NULL

  UNION ALL

  SELECT
    public.data_studio_stable_uuid('ext:' || i.id::text || ':lei:' || BTRIM(COALESCE(i.raw_data->>'LEI', i.raw_data->>'id_lei'))) AS id,
    'institutions',
    i.id,
    'lei',
    BTRIM(COALESCE(i.raw_data->>'LEI', i.raw_data->>'id_lei')),
    false,
    NULL,
    'Backfilled from local legacy warehouse activation'
  FROM institutions i
  WHERE NULLIF(BTRIM(COALESCE(i.raw_data->>'LEI', i.raw_data->>'id_lei')), '') IS NOT NULL

  UNION ALL

  SELECT
    public.data_studio_stable_uuid('ext:' || i.id::text || ':routing_number:' || BTRIM(COALESCE(i.raw_data->>'RTNUM', i.raw_data->>'ABA', i.raw_data->>'ROUTING_NUMBER', i.raw_data->>'PrimaryABARoutNumber'))) AS id,
    'institutions',
    i.id,
    'routing_number',
    BTRIM(COALESCE(i.raw_data->>'RTNUM', i.raw_data->>'ABA', i.raw_data->>'ROUTING_NUMBER', i.raw_data->>'PrimaryABARoutNumber')),
    false,
    NULL,
    'Backfilled from local legacy warehouse activation'
  FROM institutions i
  WHERE NULLIF(BTRIM(COALESCE(i.raw_data->>'RTNUM', i.raw_data->>'ABA', i.raw_data->>'ROUTING_NUMBER', i.raw_data->>'PrimaryABARoutNumber')), '') IS NOT NULL

  UNION ALL

  SELECT
    public.data_studio_stable_uuid('ext:' || i.id::text || ':rpaa_id:' || BTRIM(i.raw_data->>'boc_id')) AS id,
    'institutions',
    i.id,
    'rpaa_id',
    BTRIM(i.raw_data->>'boc_id'),
    false,
    NULL,
    'Backfilled from local legacy warehouse activation'
  FROM institutions i
  WHERE NULLIF(BTRIM(i.raw_data->>'boc_id'), '') IS NOT NULL

  UNION ALL

  SELECT
    public.data_studio_stable_uuid('ext:' || i.id::text || ':fincen_id:' || BTRIM(i.raw_data->>'registration_number')) AS id,
    'institutions',
    i.id,
    'fincen_id',
    BTRIM(i.raw_data->>'registration_number'),
    false,
    NULL,
    'Backfilled from local legacy warehouse activation'
  FROM institutions i
  WHERE NULLIF(BTRIM(i.raw_data->>'registration_number'), '') IS NOT NULL

  UNION ALL

  SELECT
    public.data_studio_stable_uuid('ext:' || i.id::text || ':nmls_id:' || BTRIM(i.raw_data->>'nmls_id')) AS id,
    'institutions',
    i.id,
    'nmls_id',
    BTRIM(i.raw_data->>'nmls_id'),
    false,
    NULL,
    'Backfilled from local legacy warehouse activation'
  FROM institutions i
  WHERE NULLIF(BTRIM(i.raw_data->>'nmls_id'), '') IS NOT NULL

  UNION ALL

  SELECT
    public.data_studio_stable_uuid('ext:' || rb.id::text || ':registration_number:' || rb.registration_number) AS id,
    'registry_entities',
    rb.id,
    'registration_number',
    rb.registration_number,
    CASE
      WHEN rb.source = 'rpaa' AND NULLIF(BTRIM(rb.raw_data->>'boc_id'), '') IS NOT NULL AND BTRIM(rb.raw_data->>'boc_id') <> rb.registration_number THEN false
      WHEN rb.source IN ('fintrac', 'fincen') AND NULLIF(BTRIM(rb.raw_data->>'registration_number'), '') IS NOT NULL AND BTRIM(rb.raw_data->>'registration_number') <> rb.registration_number THEN false
      ELSE true
    END,
    NULL,
    'Backfilled from local legacy warehouse activation'
  FROM tmp_registry_base rb

  UNION ALL

  SELECT
    public.data_studio_stable_uuid('ext:' || rb.id::text || ':legacy_cert_number:' || rb.cert_number::text) AS id,
    'registry_entities',
    rb.id,
    'legacy_cert_number',
    rb.cert_number::text,
    false,
    NULL,
    'Backfilled from local legacy warehouse activation'
  FROM tmp_registry_base rb

  UNION ALL

  SELECT
    public.data_studio_stable_uuid('ext:' || rb.id::text || ':rpaa_id:' || BTRIM(rb.raw_data->>'boc_id')) AS id,
    'registry_entities',
    rb.id,
    'rpaa_id',
    BTRIM(rb.raw_data->>'boc_id'),
    true,
    NULL,
    'Backfilled from local legacy warehouse activation'
  FROM tmp_registry_base rb
  WHERE rb.source = 'rpaa'
    AND NULLIF(BTRIM(rb.raw_data->>'boc_id'), '') IS NOT NULL
    AND BTRIM(rb.raw_data->>'boc_id') <> rb.registration_number

  UNION ALL

  SELECT
    public.data_studio_stable_uuid('ext:' || rb.id::text || ':fintrac_id:' || BTRIM(rb.raw_data->>'registration_number')) AS id,
    'registry_entities',
    rb.id,
    'fintrac_id',
    BTRIM(rb.raw_data->>'registration_number'),
    true,
    NULL,
    'Backfilled from local legacy warehouse activation'
  FROM tmp_registry_base rb
  WHERE rb.source = 'fintrac'
    AND NULLIF(BTRIM(rb.raw_data->>'registration_number'), '') IS NOT NULL
    AND BTRIM(rb.raw_data->>'registration_number') <> rb.registration_number

  UNION ALL

  SELECT
    public.data_studio_stable_uuid('ext:' || rb.id::text || ':fincen_id:' || BTRIM(rb.raw_data->>'registration_number')) AS id,
    'registry_entities',
    rb.id,
    'fincen_id',
    BTRIM(rb.raw_data->>'registration_number'),
    true,
    NULL,
    'Backfilled from local legacy warehouse activation'
  FROM tmp_registry_base rb
  WHERE rb.source = 'fincen'
    AND NULLIF(BTRIM(rb.raw_data->>'registration_number'), '') IS NOT NULL
    AND BTRIM(rb.raw_data->>'registration_number') <> rb.registration_number
)
SELECT *
FROM institution_ids
WHERE NULLIF(BTRIM(id_value), '') IS NOT NULL
ON CONFLICT (entity_table, entity_id, id_type, id_value) DO UPDATE SET
  is_primary = EXCLUDED.is_primary,
  source_url = EXCLUDED.source_url,
  notes = EXCLUDED.notes,
  updated_at = NOW();

INSERT INTO entity_tags (
  id,
  entity_table,
  entity_id,
  tag_key,
  tag_value,
  source_kind,
  source_url,
  confidence_score,
  effective_start,
  effective_end,
  notes
)
WITH tag_source AS (
  SELECT
    public.data_studio_stable_uuid('tag:institutions:' || i.id::text || ':charter_family:' || i.charter_type) AS id,
    'institutions'::text AS entity_table,
    i.id AS entity_id,
    'charter_family'::text AS tag_key,
    i.charter_type AS tag_value,
    'curated'::text AS source_kind,
    NULL::text AS source_url,
    0.7::double precision AS confidence_score,
    NULL::date AS effective_start,
    NULL::date AS effective_end,
    'Backfilled from local legacy warehouse activation'::text AS notes
  FROM institutions i
  WHERE NULLIF(BTRIM(i.charter_type), '') IS NOT NULL

  UNION ALL

  SELECT
    public.data_studio_stable_uuid('tag:institutions:' || i.id::text || ':business_role:' ||
      CASE
        WHEN i.source = 'ncua' THEN 'credit_union'
        ELSE 'regulated_institution'
      END
    ) AS id,
    'institutions',
    i.id,
    'business_role',
    CASE
      WHEN i.source = 'ncua' THEN 'credit_union'
      ELSE 'regulated_institution'
    END,
    'curated',
    NULL,
    0.6,
    NULL,
    NULL,
    'Backfilled from local legacy warehouse activation'
  FROM institutions i
  WHERE i.source IN ('fdic', 'ncua', 'osfi')

  UNION ALL

  SELECT
    public.data_studio_stable_uuid('tag:registry_entities:' || rb.id::text || ':business_role:' ||
      CASE
        WHEN rb.source = 'rpaa' THEN 'payment_service_provider'
        WHEN rb.source = 'ciro' THEN 'dealer_firm'
        ELSE 'money_services_business'
      END
    ) AS id,
    'registry_entities',
    rb.id,
    'business_role',
    CASE
      WHEN rb.source = 'rpaa' THEN 'payment_service_provider'
      WHEN rb.source = 'ciro' THEN 'dealer_firm'
      ELSE 'money_services_business'
    END,
    'curated',
    NULL,
    0.8,
    NULL,
    NULL,
    'Backfilled from local legacy warehouse activation'
  FROM tmp_registry_base rb

  UNION ALL

  SELECT
    public.data_studio_stable_uuid('tag:registry_entities:' || rb.id::text || ':charter_family:' ||
      CASE
        WHEN rb.source = 'rpaa' THEN 'payment_service_provider'
        WHEN rb.source = 'ciro' THEN 'dealer_firm'
        ELSE 'money_services_business'
      END
    ) AS id,
    'registry_entities',
    rb.id,
    'charter_family',
    CASE
      WHEN rb.source = 'rpaa' THEN 'payment_service_provider'
      WHEN rb.source = 'ciro' THEN 'dealer_firm'
      ELSE 'money_services_business'
    END,
    'curated',
    NULL,
    0.7,
    NULL,
    NULL,
    'Backfilled from local legacy warehouse activation'
  FROM tmp_registry_base rb
)
SELECT *
FROM tag_source
ON CONFLICT (id) DO UPDATE SET
  tag_key = EXCLUDED.tag_key,
  tag_value = EXCLUDED.tag_value,
  source_kind = EXCLUDED.source_kind,
  source_url = EXCLUDED.source_url,
  confidence_score = EXCLUDED.confidence_score,
  effective_start = EXCLUDED.effective_start,
  effective_end = EXCLUDED.effective_end,
  notes = EXCLUDED.notes,
  updated_at = NOW();

INSERT INTO entity_facts (
  id,
  entity_table,
  entity_id,
  fact_type,
  fact_key,
  fact_value_text,
  fact_value_number,
  fact_value_json,
  fact_unit,
  source_kind,
  source_url,
  observed_at,
  confidence_score,
  notes
)
WITH registry_base AS (
  SELECT
    public.data_studio_stable_uuid('registry:' || i.source || ':' || i.cert_number::text) AS id,
    i.cert_number,
    i.source,
    i.last_synced_at,
    i.raw_data,
    COALESCE(
      NULLIF(BTRIM(i.raw_data->>'status'), ''),
      CASE WHEN i.active = false THEN 'inactive' ELSE 'active' END
    ) AS status
  FROM institutions i
  WHERE i.source IN ('rpaa', 'ciro', 'fintrac', 'fincen')
)
SELECT
  public.data_studio_stable_uuid(
    'fact:registry_entities:' || rb.id::text || ':registration:registration_status:' ||
    COALESCE(rb.status, '') || ':' || COALESCE(rb.last_synced_at::text, '')
  ) AS id,
  'registry_entities'::text AS entity_table,
  rb.id AS entity_id,
  'registration'::text AS fact_type,
  'registration_status'::text AS fact_key,
  rb.status AS fact_value_text,
  NULL::double precision AS fact_value_number,
  jsonb_build_object(
    'source', rb.source,
    'group_label', rb.raw_data->>'group_label',
    'source_strategy', rb.raw_data->>'source_strategy'
  ) AS fact_value_json,
  NULL::text AS fact_unit,
  'curated'::text AS source_kind,
  NULL::text AS source_url,
  rb.last_synced_at AS observed_at,
  0.7::double precision AS confidence_score,
  'Backfilled from local legacy warehouse activation'::text AS notes
  FROM tmp_registry_base rb
ON CONFLICT (id) DO UPDATE SET
  fact_type = EXCLUDED.fact_type,
  fact_key = EXCLUDED.fact_key,
  fact_value_text = EXCLUDED.fact_value_text,
  fact_value_number = EXCLUDED.fact_value_number,
  fact_value_json = EXCLUDED.fact_value_json,
  fact_unit = EXCLUDED.fact_unit,
  source_kind = EXCLUDED.source_kind,
  source_url = EXCLUDED.source_url,
  observed_at = EXCLUDED.observed_at,
  confidence_score = EXCLUDED.confidence_score,
  notes = EXCLUDED.notes,
  updated_at = NOW();

INSERT INTO financial_history_quarterly (
  entity_table,
  entity_id,
  period,
  total_assets,
  total_deposits,
  total_loans,
  net_income,
  equity_capital,
  roa,
  roi,
  credit_card_loans,
  source_kind,
  source_url,
  raw_data
)
SELECT
  'institutions'::text AS entity_table,
  i.id AS entity_id,
  fh.period,
  fh.total_assets,
  fh.total_deposits,
  fh.total_loans,
  fh.net_income,
  fh.equity_capital,
  fh.roa,
  fh.roi,
  fh.credit_card_loans,
  'official'::text AS source_kind,
  NULL::text AS source_url,
  COALESCE(fh.raw_data, '{}'::jsonb) || jsonb_build_object('legacy_cert_number', fh.cert_number) AS raw_data
FROM financial_history fh
JOIN institutions i
  ON i.cert_number = fh.cert_number
ON CONFLICT (entity_table, entity_id, period) DO UPDATE SET
  total_assets = EXCLUDED.total_assets,
  total_deposits = EXCLUDED.total_deposits,
  total_loans = EXCLUDED.total_loans,
  net_income = EXCLUDED.net_income,
  equity_capital = EXCLUDED.equity_capital,
  roa = EXCLUDED.roa,
  roi = EXCLUDED.roi,
  credit_card_loans = EXCLUDED.credit_card_loans,
  source_kind = EXCLUDED.source_kind,
  source_url = EXCLUDED.source_url,
  raw_data = EXCLUDED.raw_data,
  updated_at = NOW();

INSERT INTO branch_history_annual (
  entity_table,
  entity_id,
  reporting_year,
  period,
  branch_count,
  main_office_count,
  total_branch_deposits,
  source_kind,
  source_url,
  raw_data
)
SELECT
  'institutions'::text AS entity_table,
  i.id AS entity_id,
  :'branch_reporting_year'::integer AS reporting_year,
  make_date(:'branch_reporting_year'::integer, 6, 30) AS period,
  COUNT(*)::integer AS branch_count,
  COUNT(*) FILTER (WHERE b.main_office IS TRUE)::integer AS main_office_count,
  COALESCE(SUM(COALESCE(b.total_deposits, 0)), 0)::bigint AS total_branch_deposits,
  'official'::text AS source_kind,
  NULL::text AS source_url,
  jsonb_build_object('legacy_cert_number', b.cert_number) AS raw_data
FROM branches b
JOIN institutions i
  ON i.cert_number = b.cert_number
GROUP BY i.id, b.cert_number
ON CONFLICT (entity_table, entity_id, reporting_year) DO UPDATE SET
  period = EXCLUDED.period,
  branch_count = EXCLUDED.branch_count,
  main_office_count = EXCLUDED.main_office_count,
  total_branch_deposits = EXCLUDED.total_branch_deposits,
  source_kind = EXCLUDED.source_kind,
  source_url = EXCLUDED.source_url,
  raw_data = EXCLUDED.raw_data,
  updated_at = NOW();
