-- Failure events warehouse table.
--
-- Stores institution failure records independently from the live institutions
-- table because many failed banks are no longer present in the current-bank
-- registry. This gives the app a durable warehouse-backed failure history.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS failure_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key TEXT NOT NULL DEFAULT 'fdic_failures',
  cert_number BIGINT NOT NULL,
  entity_table TEXT NULL,
  entity_id UUID NULL,
  institution_name TEXT NOT NULL,
  city TEXT NULL,
  state TEXT NULL,
  fail_date DATE NOT NULL,
  resolution_type TEXT NULL,
  insurance_fund TEXT NULL,
  estimated_loss NUMERIC NULL,
  charter_class TEXT NULL,
  source_kind TEXT NOT NULL DEFAULT 'official',
  source_url TEXT NULL,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_failure_events_unique_record
  ON failure_events(source_key, cert_number, fail_date, resolution_type);

CREATE INDEX IF NOT EXISTS idx_failure_events_fail_date
  ON failure_events(fail_date DESC);

CREATE INDEX IF NOT EXISTS idx_failure_events_cert
  ON failure_events(cert_number);

CREATE INDEX IF NOT EXISTS idx_failure_events_entity
  ON failure_events(entity_table, entity_id);

CREATE INDEX IF NOT EXISTS idx_failure_events_raw_data
  ON failure_events USING gin (raw_data);

ALTER TABLE failure_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access on failure_events" ON failure_events;
CREATE POLICY "Public read access on failure_events"
  ON failure_events FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role write access on failure_events" ON failure_events;
CREATE POLICY "Service role write access on failure_events"
  ON failure_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS failure_events_updated_at ON failure_events;
CREATE TRIGGER failure_events_updated_at
  BEFORE UPDATE ON failure_events
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();
