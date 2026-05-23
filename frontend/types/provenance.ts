/**
 * Unified data-provenance contract for every verified payload in MatchPoint26.
 *
 * Rules:
 *  - verified === true  → data came from a named external API and was validated
 *  - verified === false → data is absent, synthetic, or could not be validated
 *  - confidence         → 'verified' | 'partial' | 'none'
 *  - fallbackUsed       → true when any field was filled from a default/estimate
 *
 * Every response that carries statistics, squad news, insights, rankings, or
 * standings MUST include a DataProvenance block. The UI uses it to decide whether
 * to render data or the appropriate no-data fallback.
 *
 * Invariant: if fallbackUsed === true, confidence MUST NOT be 'verified'.
 */

export type ProvenanceConfidence = 'verified' | 'partial' | 'none'

export interface DataProvenance {
  verified:     boolean
  source:       string               // e.g. "api-football:/fixtures/statistics"
  fetchedAt:    string | null        // ISO 8601 — null when not fetched
  confidence:   ProvenanceConfidence
  fallbackUsed: boolean              // true when any value is synthetic/estimated
}

/** Build a provenance block for real API data. */
export function realProvenance(
  source:    string,
  fetchedAt: string,
): DataProvenance {
  return { verified: true, source, fetchedAt, confidence: 'verified', fallbackUsed: false }
}

/** Build a provenance block for absent/unavailable data. */
export function noProvenance(source: string): DataProvenance {
  return { verified: false, source, fetchedAt: null, confidence: 'none', fallbackUsed: false }
}

/** Build a provenance block for partial data (some fields real, some missing). */
export function partialProvenance(
  source:    string,
  fetchedAt: string,
): DataProvenance {
  return { verified: false, source, fetchedAt, confidence: 'partial', fallbackUsed: false }
}
