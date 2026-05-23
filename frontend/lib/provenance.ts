/**
 * Runtime invariant enforcement for verified data.
 *
 * Call assertVerified() at every render boundary where unverified data must not
 * be shown to the user. It logs a structured error — never throws — so a guard
 * failure degrades gracefully rather than crashing the page.
 */
import type { DataProvenance } from '@/types/provenance'

export interface VerificationContext {
  renderPath: string   // e.g. "MatchFactsCard > StatsSection"
  matchId?:   string
  field?:     string   // e.g. "possession", "home.topScorer"
}

/**
 * Asserts that a payload is verified before it reaches a render boundary.
 * Logs a structured error (with stack trace in dev) if the invariant is broken.
 * Always returns the provenance for chaining.
 */
export function assertVerified(
  provenance: DataProvenance | undefined | null,
  ctx:        VerificationContext,
): boolean {
  if (!provenance || !provenance.verified) {
    const payload = JSON.stringify({ provenance, ctx })
    const stack   = process.env.NODE_ENV === 'development'
      ? new Error().stack
      : undefined

    console.error(
      `[InvariantViolation] Unverified data reached render boundary\n` +
      `  renderPath: ${ctx.renderPath}\n` +
      `  matchId:    ${ctx.matchId ?? 'unknown'}\n` +
      `  field:      ${ctx.field ?? 'unknown'}\n` +
      `  payload:    ${payload}\n` +
      (stack ? `  stack:\n${stack}` : ''),
    )
    return false
  }
  return true
}

/**
 * Returns true only when all provenance fields indicate real verified data.
 * Stricter than assertVerified — also rejects 'partial' confidence.
 */
export function isFullyVerified(provenance: DataProvenance | undefined | null): boolean {
  return (
    provenance !== null &&
    provenance !== undefined &&
    provenance.verified === true &&
    provenance.confidence === 'verified' &&
    provenance.fallbackUsed === false
  )
}
