import pg from 'pg';
import { getEnvValue, loadEnvLocal } from './_sync-utils.mjs';

const { Client } = pg;
const env = loadEnvLocal();

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function sqlValue(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && !Array.isArray(value)) return JSON.stringify(value);
  return value;
}

export function localConnectionConfig() {
  const connectionString = process.env.LOCAL_PG_URL || getEnvValue(env, 'LOCAL_PG_URL');
  if (connectionString) return { connectionString };

  return {
    host: process.env.LOCAL_PG_HOST || getEnvValue(env, 'LOCAL_PG_HOST', 'localhost'),
    port: Number(process.env.LOCAL_PG_PORT || getEnvValue(env, 'LOCAL_PG_PORT', '5432')),
    database: process.env.LOCAL_PG_DB || getEnvValue(env, 'LOCAL_PG_DB', 'data_studio_local'),
    user: process.env.LOCAL_PG_USER || getEnvValue(env, 'LOCAL_PG_USER', undefined),
    password: process.env.LOCAL_PG_PASSWORD || getEnvValue(env, 'LOCAL_PG_PASSWORD', undefined),
  };
}

export async function connectLocalPg() {
  const client = new Client(localConnectionConfig());
  await client.connect();
  return client;
}

export async function localTableExists(client, table) {
  const { rows } = await client.query(
    `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
      LIMIT 1
    `,
    [table]
  );
  return rows.length > 0;
}

export async function startLocalSyncJob(client, source) {
  const { rows } = await client.query(
    `
      INSERT INTO sync_jobs (source, status, started_at)
      VALUES ($1, 'running', now())
      RETURNING id
    `,
    [source]
  );
  return rows[0]?.id ?? null;
}

export async function finishLocalSyncJob(client, jobId, payload) {
  if (!jobId) return;

  const sets = ['completed_at = now()'];
  const values = [];
  let index = 1;

  for (const [key, value] of Object.entries(payload)) {
    sets.push(`${quoteIdentifier(key)} = $${index}`);
    values.push(sqlValue(value));
    index += 1;
  }

  values.push(jobId);
  await client.query(
    `UPDATE sync_jobs SET ${sets.join(', ')} WHERE id = $${index}`,
    values
  );
}

export async function updateLocalDataSourceSnapshot(client, sourceKey, patch) {
  const sets = [];
  const values = [];
  let index = 1;

  for (const [key, value] of Object.entries(patch)) {
    sets.push(`${quoteIdentifier(key)} = $${index}`);
    values.push(sqlValue(value));
    index += 1;
  }

  if (sets.length === 0) return;

  values.push(sourceKey);
  await client.query(
    `UPDATE data_sources SET ${sets.join(', ')} WHERE source_key = $${index}`,
    values
  );
}

export async function batchUpsert(client, table, columns, conflictColumns, rows, updateColumns = null, chunkSize = 250) {
  if (!rows.length) return;

  const quotedColumns = columns.map(quoteIdentifier).join(', ');
  const conflictClause = conflictColumns.map(quoteIdentifier).join(', ');
  const updateTargets = (updateColumns ?? columns.filter((column) => !conflictColumns.includes(column)));
  const updateClause =
    updateTargets.length > 0
      ? updateTargets.map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`).join(', ')
      : `${quoteIdentifier(conflictColumns[0])} = EXCLUDED.${quoteIdentifier(conflictColumns[0])}`;

  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const batch = rows.slice(offset, offset + chunkSize);
    const values = [];
    const valueGroups = batch.map((row, rowIndex) => {
      const placeholders = columns.map((column, columnIndex) => {
        values.push(sqlValue(row[column]));
        return `$${rowIndex * columns.length + columnIndex + 1}`;
      });
      return `(${placeholders.join(', ')})`;
    });

    await client.query(
      `
        INSERT INTO ${quoteIdentifier(table)} (${quotedColumns})
        VALUES ${valueGroups.join(', ')}
        ON CONFLICT (${conflictClause})
        DO UPDATE SET ${updateClause}
      `,
      values
    );
  }
}
