-- Migration: update institutions source CHECK constraint to include all data sources
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/bvznhycwkgouwmaufdpe/sql/new

ALTER TABLE institutions
  DROP CONSTRAINT IF EXISTS institutions_source_check;

ALTER TABLE institutions
  ADD CONSTRAINT institutions_source_check
  CHECK (source IN ('fdic', 'ncua', 'osfi', 'rpaa', 'ciro', 'fintrac', 'fincen'));
