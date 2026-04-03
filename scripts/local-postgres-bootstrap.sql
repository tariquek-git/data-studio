-- Local Postgres compatibility bootstrap for Data Studio
-- Creates the minimal Supabase-style pieces needed by the repo SQL files.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text AS $$
  SELECT COALESCE(current_setting('app.current_role', true), 'service_role');
$$ LANGUAGE sql STABLE;
