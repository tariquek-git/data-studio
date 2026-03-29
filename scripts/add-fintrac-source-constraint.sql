-- Migration: expand institutions.source CHECK constraint to include fintrac, fincen, fintech_ca
-- Run in: Supabase Dashboard SQL Editor or via Management API
-- Safe to re-run (idempotent)

ALTER TABLE institutions
  DROP CONSTRAINT IF EXISTS institutions_source_check;

ALTER TABLE institutions
  ADD CONSTRAINT institutions_source_check
  CHECK (source IN ('fdic', 'ncua', 'osfi', 'rpaa', 'ciro', 'fintrac', 'fincen', 'fintech_ca'));
