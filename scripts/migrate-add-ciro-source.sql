-- Migration: add 'ciro' to the institutions source CHECK constraint
-- Run this in the Supabase SQL Editor before running sync-ciro.mjs
--
-- Dashboard URL: https://supabase.com/dashboard/project/bvznhycwkgouwmaufdpe/sql/new

ALTER TABLE institutions
  DROP CONSTRAINT IF EXISTS institutions_source_check;

ALTER TABLE institutions
  ADD CONSTRAINT institutions_source_check
  CHECK (source IN ('fdic', 'ncua', 'osfi', 'rpaa', 'ciro'));
