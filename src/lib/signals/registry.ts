/**
 * Signal Registry — the controlled vocabulary for Brim BD intelligence.
 *
 * Every signal in Nexus is stored in `entity_facts` with `fact_type` set to one
 * of the keys below. The registry is the single source of truth for:
 *   - What signals exist
 *   - What they measure
 *   - How they're weighted in the Brim score
 *   - How quickly they decay (freshness_days)
 *   - Whether they're a hard disqualifier
 *
 * The SQL mirror in `scripts/schema/signal_registry.sql` is seeded from this file.
 * Keep both in sync — the compute_brim_score() SQL function joins against the
 * SQL table, and the UI reads the TS const.
 */

export type SignalCategory =
  | 'program_fit'
  | 'timing'
  | 'growth'
  | 'risk'
  | 'peer';

export type SignalCollectionMethod =
  | 'fdic_call_report'
  | 'ncua_call_report'
  | 'charter_events'
  | 'financial_history_delta'
  | 'occ_enforcement'
  | 'fdic_enforcement'
  | 'ncua_letters'
  | 'sec_edgar_8k'
  | 'bank_capabilities_derived'
  | 'manual_curation'
  | 'entity_relationships';

export interface SignalDefinition {
  /** The fact_type value written into entity_facts. Must be namespaced `signal.*`. */
  fact_type: string;
  category: SignalCategory;
  display_name: string;
  description: string;
  /** Unit for fact_value_number, e.g. 'usd', 'count', 'percent'. null for boolean/text. */
  unit: string | null;
  /** Weight contribution to brim_score when the signal is present and fresh. Negative for risk signals. */
  weight: number;
  /** Days after observed_at the signal is considered fully fresh. Linear decay to 0 by 2× this value. */
  freshness_days: number;
  how_collected: SignalCollectionMethod;
  /** If true, presence of this signal hard-excludes the institution from Brim tier ranking. */
  disqualifier?: boolean;
  /** Which v ships this signal. v1 = ships now. */
  version: 'v1' | 'v2';
}

export const SIGNAL_REGISTRY: SignalDefinition[] = [
  // ── A. Program-fit signals ─────────────────────────────────────────────────
  {
    fact_type: 'signal.card_portfolio_size',
    category: 'program_fit',
    display_name: 'Card portfolio size',
    description: 'Dollar value of credit card loans on the balance sheet. Larger = more reason to modernize.',
    unit: 'usd',
    weight: 25,
    freshness_days: 120, // quarterly refresh
    how_collected: 'fdic_call_report',
    version: 'v1',
  },
  {
    fact_type: 'signal.agent_bank_dependency',
    category: 'program_fit',
    display_name: 'Agent bank dependency',
    description: 'Institution currently runs its card program through Elan, TCM Bank, FNBO, or a similar agent. Prime migration target.',
    unit: null,
    weight: 30,
    freshness_days: 365,
    how_collected: 'bank_capabilities_derived',
    version: 'v1',
  },
  {
    fact_type: 'signal.core_processor_fit',
    category: 'program_fit',
    display_name: 'Core processor fit',
    description: 'Brim integration compatibility with the institution\'s core processor (Jack Henry, Fiserv, FIS, Symitar, etc.).',
    unit: null,
    weight: 15,
    freshness_days: 365,
    how_collected: 'bank_capabilities_derived',
    version: 'v1',
  },
  {
    fact_type: 'signal.card_network_membership',
    category: 'program_fit',
    display_name: 'Card network membership',
    description: 'Visa or Mastercard principal member status — signals existing card network relationships.',
    unit: null,
    weight: 5,
    freshness_days: 365,
    how_collected: 'bank_capabilities_derived',
    version: 'v1',
  },
  {
    fact_type: 'signal.asset_band_fit',
    category: 'program_fit',
    display_name: 'Asset band fit',
    description: 'Total assets fall within Brim\'s ICP sweet spot ($1–10B). Full weight at the center of the band, linear falloff outside.',
    unit: 'usd',
    weight: 10,
    freshness_days: 120,
    how_collected: 'financial_history_delta',
    version: 'v1',
  },

  // ── B. Timing signals ──────────────────────────────────────────────────────
  {
    fact_type: 'signal.post_merger_window',
    category: 'timing',
    display_name: 'Post-merger window',
    description: 'Completed M&A event within the last 24 months — vendor decisions are typically re-opened after integration.',
    unit: null,
    weight: 20,
    freshness_days: 730, // 24 months
    how_collected: 'charter_events',
    version: 'v1',
  },
  {
    fact_type: 'signal.core_conversion',
    category: 'timing',
    display_name: 'Core conversion',
    description: 'Core processor changed year-over-year — adjacent vendor decisions (cards, payments) often follow.',
    unit: null,
    weight: 15,
    freshness_days: 540,
    how_collected: 'financial_history_delta',
    version: 'v1',
  },
  {
    fact_type: 'signal.exec_transition',
    category: 'timing',
    display_name: 'Executive transition',
    description: 'New CFO, COO, or CEO within the last 12 months (SEC 8-K Item 5.02). New executives drive strategic refreshes.',
    unit: null,
    weight: 15,
    freshness_days: 365,
    how_collected: 'sec_edgar_8k',
    version: 'v1',
  },
  {
    fact_type: 'signal.rfp_active',
    category: 'timing',
    display_name: 'Active RFP',
    description: 'Public procurement notice for a card vendor, processor, or adjacent service.',
    unit: null,
    weight: 20,
    freshness_days: 180,
    how_collected: 'manual_curation',
    version: 'v2',
  },
  {
    fact_type: 'signal.card_program_decline',
    category: 'timing',
    display_name: 'Card program decline',
    description: 'Year-over-year drop in credit card loans of 10% or more — signals an underperforming program.',
    unit: 'percent',
    weight: 10,
    freshness_days: 180,
    how_collected: 'financial_history_delta',
    version: 'v1',
  },

  // ── C. Growth signals (v2) ─────────────────────────────────────────────────
  {
    fact_type: 'signal.deposit_growth_yoy',
    category: 'growth',
    display_name: 'Deposit growth YoY',
    description: 'Deposit growth above peer median — signals an ambitious institution investing in new capabilities.',
    unit: 'percent',
    weight: 10,
    freshness_days: 180,
    how_collected: 'financial_history_delta',
    version: 'v2',
  },
  {
    fact_type: 'signal.digital_banking_maturity',
    category: 'growth',
    display_name: 'Digital banking maturity',
    description: 'Mobile app presence, online account opening, digital-first posture.',
    unit: null,
    weight: 5,
    freshness_days: 365,
    how_collected: 'manual_curation',
    version: 'v2',
  },
  {
    fact_type: 'signal.fintech_partnership',
    category: 'growth',
    display_name: 'Fintech partnership',
    description: 'Named fintech partner — BaaS sponsor bank, embedded finance, or program manager relationship.',
    unit: null,
    weight: 10,
    freshness_days: 365,
    how_collected: 'entity_relationships',
    version: 'v2',
  },

  // ── D. Risk / disqualifier signals ─────────────────────────────────────────
  {
    fact_type: 'signal.enforcement_action',
    category: 'risk',
    display_name: 'Enforcement action',
    description: 'Active OCC, FDIC, or NCUA enforcement action. Not an automatic disqualifier but raises procurement friction.',
    unit: null,
    weight: -20,
    freshness_days: 730,
    how_collected: 'occ_enforcement',
    version: 'v1',
  },
  {
    fact_type: 'signal.regulatory_capital_stress',
    category: 'risk',
    display_name: 'Regulatory capital stress',
    description: 'Tier 1 capital ratio below the well-capitalized threshold. Institutions in stress defer discretionary spend.',
    unit: 'percent',
    weight: -15,
    freshness_days: 120,
    how_collected: 'fdic_call_report',
    version: 'v1',
  },
  {
    fact_type: 'signal.captive_card_arm',
    category: 'risk',
    display_name: 'Captive card arm',
    description: 'Holding company already operates a captive card program (e.g., Capital One, Discover). Hard exclude.',
    unit: null,
    weight: 0,
    freshness_days: 3650,
    how_collected: 'manual_curation',
    disqualifier: true,
    version: 'v1',
  },
  {
    fact_type: 'signal.acquisition_target',
    category: 'risk',
    display_name: 'Acquisition target',
    description: 'Announced as the acquiree in a pending M&A deal. Vendor decisions frozen until close.',
    unit: null,
    weight: 0,
    freshness_days: 540,
    how_collected: 'charter_events',
    disqualifier: true,
    version: 'v1',
  },
  {
    fact_type: 'signal.existing_brim_customer',
    category: 'risk',
    display_name: 'Existing Brim customer',
    description: 'Already signed with Brim. Hard exclude from prospecting.',
    unit: null,
    weight: 0,
    freshness_days: 3650,
    how_collected: 'manual_curation',
    disqualifier: true,
    version: 'v1',
  },

  // ── E. Peer & relationship signals (v2) ────────────────────────────────────
  {
    fact_type: 'signal.peer_migrated',
    category: 'peer',
    display_name: 'Peer migrated',
    description: 'A comparable institution (similar size, geography, charter) modernized its card program recently.',
    unit: null,
    weight: 10,
    freshness_days: 540,
    how_collected: 'manual_curation',
    version: 'v2',
  },
  {
    fact_type: 'signal.holding_co_sibling_is_customer',
    category: 'peer',
    display_name: 'Sibling is Brim customer',
    description: 'A sibling under the same holding company is already a Brim customer. Warm intro path.',
    unit: null,
    weight: 15,
    freshness_days: 3650,
    how_collected: 'entity_relationships',
    version: 'v2',
  },
];

/** v1 signals only — the set that ships in the first release. */
export const V1_SIGNALS = SIGNAL_REGISTRY.filter((s) => s.version === 'v1');

/** Quick lookup by fact_type. */
export const SIGNAL_BY_FACT_TYPE: Record<string, SignalDefinition> = Object.fromEntries(
  SIGNAL_REGISTRY.map((s) => [s.fact_type, s]),
);

/** Brim tier thresholds. Applied to the final weighted score (0–100).
 *  Recalibrated 2026-04-14: realistic ceilings without bank_capabilities data
 *  are ~37/100, so thresholds are set to match observed distribution.
 *  Must stay in sync with compute_brim_score() SQL function. */
export const BRIM_TIERS = {
  A: 55,
  B: 40,
  C: 25,
  D: 15,
} as const;

export function scoreToTier(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= BRIM_TIERS.A) return 'A';
  if (score >= BRIM_TIERS.B) return 'B';
  if (score >= BRIM_TIERS.C) return 'C';
  if (score >= BRIM_TIERS.D) return 'D';
  return 'F';
}

/**
 * Freshness decay: 1.0 at observed_at, linear fade to 0.0 at observed_at + 2×freshness_days.
 * Used by both the TS preview path and the SQL compute_brim_score() function.
 */
export function freshnessDecay(observedAt: Date, freshnessDays: number, now: Date = new Date()): number {
  const ageDays = (now.getTime() - observedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays <= 0) return 1;
  if (ageDays >= freshnessDays * 2) return 0;
  if (ageDays <= freshnessDays) return 1;
  return 1 - (ageDays - freshnessDays) / freshnessDays;
}
