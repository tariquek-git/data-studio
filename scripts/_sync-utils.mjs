#!/usr/bin/env node

import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { isAbsolute, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = join(__dirname, '..');

export function loadEnvLocal() {
  const envPath = join(PROJECT_ROOT, '.env.local');
  const env = {};

  if (!existsSync(envPath)) return env;

  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
  }

  return env;
}

export function getEnvValue(env, key, fallback = null) {
  return process.env[key] ?? env[key] ?? fallback;
}

export function createSupabaseServiceClient(env) {
  const url = getEnvValue(env, 'SUPABASE_URL');
  const serviceRoleKey = getEnvValue(env, 'SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }

  return createClient(url, serviceRoleKey);
}

export async function startSyncJob(supabase, source) {
  const { data, error } = await supabase
    .from('sync_jobs')
    .insert({ source, status: 'running', started_at: new Date().toISOString() })
    .select()
    .single();

  if (error) throw new Error(`Unable to create sync job for ${source}: ${error.message}`);
  return data?.id ?? null;
}

export async function finishSyncJob(supabase, jobId, payload) {
  if (!jobId) return;
  const update = {
    completed_at: new Date().toISOString(),
    ...payload,
  };

  const { error } = await supabase
    .from('sync_jobs')
    .update(update)
    .eq('id', jobId);

  if (error) {
    console.warn(`Unable to update sync job ${jobId}: ${error.message}`);
  }
}

export async function tableExists(supabase, table, probeColumn = 'id') {
  const { error } = await supabase
    .from(table)
    .select(probeColumn)
    .limit(1);

  if (!error) return true;
  if (
    error.code === '42P01' ||
    error.code === '42703' ||
    error.code === 'PGRST205' ||
    /relation .* does not exist/i.test(error.message ?? '') ||
    /schema cache/i.test(error.message ?? '')
  ) return false;
  throw new Error(`Unable to probe table ${table}: ${error.message}`);
}

export async function updateDataSourceSnapshot(supabase, sourceKey, patch) {
  const { error } = await supabase
    .from('data_sources')
    .update(patch)
    .eq('source_key', sourceKey);

  if (error && error.code !== '42P01' && error.code !== 'PGRST205') {
    throw new Error(`Unable to update data_sources for ${sourceKey}: ${error.message}`);
  }
}

export function chunkArray(values, size = 500) {
  const chunks = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

export function stableUuid(seed) {
  const hash = createHash('sha1').update(String(seed)).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function normalizeHeader(header) {
  return String(header ?? '').replace(/^\uFEFF/, '').trim();
}

export function parseDelimited(text, delimiter = ',') {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === delimiter) {
      row.push(field);
      field = '';
      continue;
    }

    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    if (char === '\r') {
      continue;
    }

    field += char;
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((current) => current.some((value) => String(value ?? '').trim() !== ''));
}

export function rowsToObjects(rows) {
  if (rows.length === 0) return [];
  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).map((row) => {
    const entry = {};
    headers.forEach((header, index) => {
      entry[header] = row[index] ?? '';
    });
    return entry;
  });
}

function resolveInputPath(input) {
  if (isAbsolute(input)) return input;
  return join(PROJECT_ROOT, input);
}

function readZipText(filePath, preferredPattern = null) {
  const entries = execFileSync('unzip', ['-Z1', filePath], {
    encoding: 'utf-8',
    maxBuffer: 32 * 1024 * 1024,
  })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const entryName =
    entries.find((entry) => preferredPattern && preferredPattern.test(entry)) ??
    entries.find((entry) => !entry.endsWith('/')) ??
    null;

  if (!entryName) {
    throw new Error(`No readable files found inside ZIP archive: ${filePath}`);
  }

  return execFileSync('unzip', ['-p', filePath, entryName], {
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

export async function readTextSource(source, options = {}) {
  if (!source) {
    throw new Error('A file path or URL is required');
  }

  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source, {
      headers: {
        'User-Agent': 'DataStudio/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Fetch failed for ${source}: HTTP ${response.status}`);
    }

    return response.text();
  }

  const filePath = resolveInputPath(source);
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  if (filePath.toLowerCase().endsWith('.zip')) {
    return readZipText(filePath, options.preferredPattern ?? null);
  }

  return readFileSync(filePath, 'utf-8');
}

export async function readJsonSource(source) {
  const text = await readTextSource(source, { preferredPattern: /\.json$/i });
  return JSON.parse(text);
}

export function formatUsDateToIso(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return trimmed;
  const [, month, day, year] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export function booleanFlag(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'y' || normalized === 'yes';
}

export function slugify(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
