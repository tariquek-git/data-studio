/**
 * Signal types — how raw entity_facts rows become scored signals in the UI.
 *
 * An `EntityFactRow` is the shape returned by the database for a row in
 * entity_facts. A `SignalFact` wraps that row with the registry metadata
 * attached (display name, weight, category) and the computed contribution
 * to the Brim score (weight × freshness_decay × confidence).
 */

import type { SignalCategory, SignalDefinition } from '@/lib/signals/registry';

export interface EntityFactRow {
  id: string;
  entity_table: 'institutions' | 'registry_entities' | 'ecosystem_entities';
  entity_id: string;
  fact_type: string;
  fact_key: string | null;
  fact_value_text: string | null;
  fact_value_number: number | null;
  fact_value_json: unknown | null;
  fact_unit: string | null;
  source_kind: 'official' | 'company' | 'curated';
  source_url: string | null;
  observed_at: string | null;
  confidence_score: number | null;
  notes: string | null;
  sync_job_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SignalFact {
  /** The underlying fact row. */
  fact: EntityFactRow;
  /** Registry definition for this signal. */
  definition: SignalDefinition;
  /** Decay factor applied to weight, 0–1, based on `observed_at` and `freshness_days`. */
  freshness_decay: number;
  /** Final contribution to the Brim score: weight × decay × confidence. */
  contribution: number;
  /** Age of the signal in days at compute time. */
  age_days: number;
}

export interface BrimScoreBreakdown {
  entity_id: string;
  score: number;
  tier: 'A' | 'B' | 'C' | 'D' | 'F';
  signals: SignalFact[];
  disqualifiers: SignalFact[];
  computed_at: string;
}

export interface SignalCoverageStat {
  fact_type: string;
  category: SignalCategory;
  display_name: string;
  count: number;
  avg_confidence: number;
  oldest: string | null;
  freshest: string | null;
  stale_count: number;
}
