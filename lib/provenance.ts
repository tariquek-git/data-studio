import type { DataProvenance, ProvenanceSource } from '../src/types/entity.js';

/**
 * Validate a data_provenance JSONB value at runtime.
 * Returns the typed object if valid, throws if malformed.
 */
export function validateProvenance(raw: unknown): DataProvenance {
  if (raw == null || typeof raw !== 'object') {
    throw new Error('data_provenance must be an object');
  }

  const obj = raw as Record<string, unknown>;

  if (!Array.isArray(obj.sources)) {
    throw new Error('data_provenance.sources must be an array');
  }

  for (const src of obj.sources) {
    if (typeof src !== 'object' || src == null) {
      throw new Error('Each provenance source must be an object');
    }
    const s = src as Record<string, unknown>;
    if (typeof s.source_key !== 'string' || !s.source_key) {
      throw new Error('provenance source.source_key is required');
    }
    if (typeof s.fetched_at !== 'string' || !s.fetched_at) {
      throw new Error('provenance source.fetched_at is required');
    }
    if (typeof s.confidence !== 'number' || s.confidence < 0 || s.confidence > 100) {
      throw new Error('provenance source.confidence must be a number 0-100');
    }
  }

  if (typeof obj.last_verified_at !== 'string' || !obj.last_verified_at) {
    throw new Error('data_provenance.last_verified_at is required');
  }

  return raw as DataProvenance;
}

/**
 * Build a DataProvenance object from a single sync source.
 * Convenience helper for sync scripts to construct provenance on write.
 */
export function buildProvenance(opts: {
  sourceKey: string;
  sourceUrl: string;
  syncJobId?: string;
  confidence: number;
  verifiedBy?: string;
}): DataProvenance {
  const now = new Date().toISOString();
  const source: ProvenanceSource = {
    source_key: opts.sourceKey,
    source_url: opts.sourceUrl,
    fetched_at: now,
    confidence: opts.confidence,
  };
  if (opts.syncJobId) source.sync_job_id = opts.syncJobId;

  return {
    sources: [source],
    last_verified_at: now,
    verified_by: opts.verifiedBy ?? 'system',
  };
}

/**
 * Merge a new provenance source into an existing DataProvenance object.
 * If the same source_key already exists, it is replaced with the new entry.
 */
export function mergeProvenance(
  existing: DataProvenance | null | undefined,
  newSource: ProvenanceSource
): DataProvenance {
  const base: DataProvenance = existing ?? {
    sources: [],
    last_verified_at: new Date().toISOString(),
  };

  const filtered = base.sources.filter((s) => s.source_key !== newSource.source_key);
  filtered.push(newSource);

  return {
    ...base,
    sources: filtered,
    last_verified_at: new Date().toISOString(),
  };
}
