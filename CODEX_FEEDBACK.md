# Codex Feedback

This memo is for ongoing product/system improvement decisions that do not all need immediate implementation.

## Data / Warehouse Integrity

### major — Warehouse trust is still bottlenecked by sparse confidence/provenance coverage
Why it matters:
- Live read-only Supabase checks still show `registry_entities.data_provenance` coverage at `0` public rows, and sampled `rpaa` rows also have null `data_confidence` and `data_confidence_score`.
- That means the admin trust surface can be visually stronger than the underlying warehouse reality if we do not keep the wording and metrics strict.
Proposed direction:
- Make source-level backfills and native syncs populate confidence + provenance as part of the write contract, not as a later enhancement.
- Add a short “trust minimum” checklist for every writer: `source_key`, `source_url`, freshness timestamp, confidence score, and verification timestamp where applicable.
Needs Claude/user decision:
- Yes. This is architectural and affects how every source writer is judged going forward.

### important — Legacy warehouse backfills were manufacturing auditable rows with null source URLs
Why it matters:
- Backfill-generated tags, facts, quarterly history, branch history, and external IDs become harder to audit and explain when they drop known source URLs.
Proposed direction:
- Keep the new source-url mapping in both backfill helpers.
- Next, review the SQL backfill path and any remaining duplicated transforms so they do not regress to `NULL` provenance metadata.
Needs Claude/user decision:
- No for the JS helper hardening that already landed.
- Yes for whether the SQL backfill path should be upgraded to the same standard now.

### important — Public read-only sync visibility is weak right now
Why it matters:
- The latest public read-only `sync_jobs` query returned an empty array, which makes it hard to independently verify recent source freshness from the outside.
- That may be a permissions choice, an empty table, or an operational gap, but either way it reduces observability.
Proposed direction:
- Decide whether admin-only sync health is sufficient, or whether a limited read-only operational summary should exist for trusted internal users.
Needs Claude/user decision:
- Yes.

## Product Trust UX

### major — Trust UX should reflect data reality, not just interface confidence
Why it matters:
- The project vision depends on users believing the system because it is inspectable, not because it looks polished.
- If a card looks high-confidence while provenance is sparse, the UX can accidentally over-claim.
Proposed direction:
- Standardize one reusable trust module across entity/admin surfaces:
  source, freshness, confidence, verification status, and evidence gap state.
- Use explicit “not yet verified” language where coverage is missing.
Needs Claude/user decision:
- Yes. This affects system-wide UI language and component strategy.

### important — Audit dashboard should distinguish “loaded” from “trusted”
Why it matters:
- A source having rows is not the same as those rows being explainable or decision-grade.
Proposed direction:
- Add a clear separation in the admin model and UI:
  availability, freshness, provenance completeness, confidence quality, and sync readiness.
- Avoid collapsing those into a single implied health state.
Needs Claude/user decision:
- Yes, but it can be staged.

## AI / Reasoning / Explainability

### major — The product needs a first-class evidence-to-claim chain
Why it matters:
- The long-term moat is not just collecting data, but showing why a classification, score, or recommendation exists.
- Without a visible reasoning chain, AI summaries risk feeling decorative rather than trustworthy.
Proposed direction:
- Define a normalized evidence model that every AI explanation can cite:
  claim, supporting records, source URLs, freshness, confidence, and unresolved gaps.
- Require AI-generated summaries to degrade gracefully when evidence is partial.
Needs Claude/user decision:
- Yes. This is a cross-cutting product/architecture decision.

### idea — Add “reasoning mode” to admin before adding it broadly to user-facing pages
Why it matters:
- Admin is the safest place to prove the explainability model before exposing it as a core experience.
Proposed direction:
- Start with an internal “why this exists / why this score” panel on key admin records.
- Use that internal version to refine data contracts before public rollout.
Needs Claude/user decision:
- Yes.

## Brand / Positioning / Information Design

### important — The strongest brand signal is disciplined evidence, not generic fintech polish
Why it matters:
- The project is aiming at a Bloomberg/Palantir-like trust posture for financial intelligence, but for a community-learning context first.
- That brand promise is earned through exactness, auditability, and good information hierarchy more than through visual flourish alone.
Proposed direction:
- Keep the visual language confident and modern, but let the brand center on:
  “searchable financial truth,” “auditable intelligence,” and “evidence-backed discovery.”
- Prefer interfaces that make uncertainty legible over interfaces that merely look premium.
Needs Claude/user decision:
- Yes, at the messaging/system level.

### idea — Make searchability the hero, not just the data source count
Why it matters:
- Users will remember finding “banks with these characteristics” faster than they will remember how many tables were loaded.
Proposed direction:
- Prioritize memorable compound queries, saved screens, explainable filters, and peer-comparison flows as the product narrative.
- Treat source expansion as an enabler for search quality, not the headline by itself.
Needs Claude/user decision:
- Yes, but this should inform roadmap prioritization rather than block integrity work.
