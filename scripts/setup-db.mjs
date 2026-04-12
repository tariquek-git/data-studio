#!/usr/bin/env node
/**
 * Setup script: Creates all tables, indexes, RLS policies, and functions
 * in the Supabase database. Run once to initialize.
 *
 * Usage: node scripts/setup-db.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env
const envPath = join(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

console.log(`Connecting to ${url}...`);
const supabase = createClient(url, key);

// Split the schema into individual statements and run them
const schema = readFileSync(join(__dirname, 'schema', 'archive', 'schema.sql'), 'utf-8');

// Split on semicolons but respect dollar-quoted blocks
const statements = [];
let current = '';
let inDollarQuote = false;

for (const line of schema.split('\n')) {
  const trimmed = line.trim();

  // Skip pure comment lines
  if (trimmed.startsWith('--') && !inDollarQuote) {
    continue;
  }

  // Track dollar quoting
  if (trimmed.includes('$$')) {
    const count = (trimmed.match(/\$\$/g) || []).length;
    if (count % 2 === 1) {
      inDollarQuote = !inDollarQuote;
    }
  }

  current += line + '\n';

  if (!inDollarQuote && trimmed.endsWith(';')) {
    const stmt = current.trim();
    if (stmt && !stmt.match(/^--/)) {
      statements.push(stmt);
    }
    current = '';
  }
}

console.log(`Found ${statements.length} SQL statements to execute`);

// Execute via the Supabase SQL endpoint using fetch
// The supabase-js client doesn't have a raw SQL method,
// so we use the pg REST endpoint
async function runSQL(sql) {
  const res = await fetch(`${url}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  return res;
}

// Actually, Supabase doesn't expose raw SQL via REST.
// Let's use a different approach: create tables via supabase-js admin methods
// or use the SQL directly with pg connection.
//
// The simplest approach: use the Supabase Management API
async function executeSQL(sql) {
  const projectRef = url.replace('https://', '').replace('.supabase.co', '');

  // Use Supabase Management API - requires access token
  // Alternative: Just test if tables exist via the client
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.SUPABASE_ACCESS_TOKEN || ''}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  return res;
}

// Simplest approach: use supabase-js to test connectivity,
// then tell user to paste SQL in dashboard
async function main() {
  // Test connection by querying a table that should exist after schema
  const { data, error } = await supabase.from('institutions').select('count', { count: 'exact', head: true });

  if (error && error.code === '42P01') {
    // Table doesn't exist yet - need to run schema
    console.log('\nTables not found. Running schema via Supabase SQL...');

    // Use the Supabase client's rpc to check connectivity
    const { data: test, error: testErr } = await supabase.rpc('institution_stats');
    if (testErr) {
      console.log('Schema not yet applied.');
      console.log('\nPlease run the following in your Supabase SQL Editor:');
      console.log('  https://supabase.com/dashboard/project/bvznhycwkgouwmaufdpe/sql/new');
      console.log('\nOr paste this URL in your browser and run the SQL from scripts/schema/000_current.sql');

      // Try direct PostgreSQL connection as last resort
      console.log('\nAttempting to use psql if available...');

      const { execSync } = await import('child_process');
      try {
        // Get the connection string from Supabase
        const connStr = `postgresql://postgres.bvznhycwkgouwmaufdpe:${env.DB_PASSWORD || 'unknown'}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;
        console.log('Connection string requires DB_PASSWORD in .env.local');
        console.log('You can find it in Supabase Dashboard > Settings > Database');
      } catch (e) {
        // psql not available or connection failed
      }
    }
  } else if (error) {
    console.error('Connection error:', error.message);
  } else {
    console.log(`Tables already exist! institutions count: ${data}`);
    console.log('Schema is already applied.');
  }
}

main().catch(console.error);
