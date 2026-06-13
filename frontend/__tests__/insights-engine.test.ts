/**
 * Integrity tests for the new 4-section insights engine.
 *
 * Verifies:
 *  1. TBD teams → insufficientData=true, empty sections
 *  2. No form data → valid fallback output (no fabricated numbers)
 *  3. Real form data → keyEdge.side reflects stronger team
 *  4. Deciding factors are always present (2–3 items)
 *  5. Story is always a non-empty string
 *  6. Prediction scores are non-negative integers
 *  7. DataProvenance helpers produce correct shapes
 */

import { describe, it, expect } from 'vitest'
import { runInsightsEngine } from '../lib/insights-engine'
import { realProvenance, noProvenance, partialProvenance } from '../types/provenance'
import type { InsightsFacts, TeamFacts } from '../types/insights-facts'

// ─── Fixtures ────────────────────────────────────────────────────

const emptyTeam = (name: string, shortCode: string): TeamFacts => ({
  shortCode,
  name,
  recentForm:        [],
  results:           [],
  avgGoalsScored:    null,
  avgGoalsConceded:  null,
  cleanSheets:       null,
  scoredInMatches:   null,
  concededInMatches: null,
  avgCorners:        null,
  avgPossession:     null,
  avgShots:          null,
  unavailablePlayers: [],
  topScorer:         null,
  topAssister:       null,
})

const teamWithForm = (
  name:      string,
  shortCode: string,
  results:   Array<{ r: 'W'|'D'|'L'; gf: number; ga: number }>,
): TeamFacts => {
  const recs = results.map(r => ({ result: r.r, goalsFor: r.gf, goalsAgt: r.ga }))
  const n    = recs.length
  return {
    shortCode,
    name,
    recentForm:        recs.map(r => r.result),
    results:           recs,
    avgGoalsScored:    n > 0 ? recs.reduce((s, r) => s + r.goalsFor, 0) / n : null,
    avgGoalsConceded:  n > 0 ? recs.reduce((s, r) => s + r.goalsAgt, 0) / n : null,
    cleanSheets:       n > 0 ? recs.filter(r => r.goalsAgt === 0).length  : null,
    scoredInMatches:   n > 0 ? recs.filter(r => r.goalsFor > 0).length   : null,
    concededInMatches: n > 0 ? recs.filter(r => r.goalsAgt > 0).length   : null,
    avgCorners:        null,
    avgPossession:     null,
    avgShots:          null,
    unavailablePlayers: [],
    topScorer:         null,
    topAssister:       null,
  }
}

const baseFacts = (home: TeamFacts, away: TeamFacts, isKnockout = false): InsightsFacts => ({
  matchId:        'test-match-1',
  home,
  away,
  h2h:            null,
  isKnockout,
  dataConfidence: home.results.length > 0 && away.results.length > 0 ? 'medium' : 'insufficient',
})

// ─── Tests: TBD teams ────────────────────────────────────────────

describe('TBD teams', () => {
  it('returns insufficientData=true for TBD short codes', () => {
    const facts = baseFacts({ ...emptyTeam('TBD', 'TBD') }, emptyTeam('Argentina', 'ARG'))
    const result = runInsightsEngine(facts)
    expect(result.insufficientData).toBe(true)
  })

  it('returns insufficientData=true for bracket-label team names', () => {
    const facts = baseFacts(
      { ...emptyTeam('Winner Group A', 'TBD') },
      { ...emptyTeam('Runner-up Group B', 'TBA') },
    )
    const result = runInsightsEngine(facts)
    expect(result.insufficientData).toBe(true)
  })

  it('returns empty story and factors for TBD matches', () => {
    const facts = baseFacts({ ...emptyTeam('TBD', 'TBD') }, emptyTeam('Germany', 'GER'))
    const result = runInsightsEngine(facts)
    expect(result.story).toBe('')
    expect(result.decidingFactors).toHaveLength(0)
  })
})

// ─── Tests: valid structure when no form data ─────────────────────

describe('Fallback structure without form data', () => {
  it('always produces a non-empty story', () => {
    const facts = baseFacts(emptyTeam('Brazil', 'BRA'), emptyTeam('Argentina', 'ARG'))
    const result = runInsightsEngine(facts)
    expect(result.story.length).toBeGreaterThan(20)
  })

  it('always produces 2–3 deciding factors', () => {
    const facts = baseFacts(emptyTeam('France', 'FRA'), emptyTeam('Germany', 'GER'))
    const result = runInsightsEngine(facts)
    expect(result.decidingFactors.length).toBeGreaterThanOrEqual(2)
    expect(result.decidingFactors.length).toBeLessThanOrEqual(3)
  })

  it('always produces a keyEdge with valid side', () => {
    const facts = baseFacts(emptyTeam('Spain', 'ESP'), emptyTeam('Portugal', 'POR'))
    const result = runInsightsEngine(facts)
    expect(['home', 'away']).toContain(result.keyEdge.side)
    expect(result.keyEdge.teamName.length).toBeGreaterThan(0)
    expect(result.keyEdge.label.length).toBeGreaterThan(0)
  })

  it('always produces a prediction with non-negative integer scores', () => {
    const facts = baseFacts(emptyTeam('Italy', 'ITA'), emptyTeam('England', 'ENG'))
    const result = runInsightsEngine(facts)
    expect(result.prediction.homeScore).toBeGreaterThanOrEqual(0)
    expect(result.prediction.awayScore).toBeGreaterThanOrEqual(0)
    expect(Number.isInteger(result.prediction.homeScore)).toBe(true)
    expect(Number.isInteger(result.prediction.awayScore)).toBe(true)
  })

  it('returns low confidence when no form data', () => {
    const facts = baseFacts(emptyTeam('Japan', 'JPN'), emptyTeam('Morocco', 'MAR'))
    const result = runInsightsEngine(facts)
    expect(result.prediction.confidence).toBe('low')
  })
})

// ─── Tests: keyEdge reflects real form data ───────────────────────

describe('KeyEdge from real form data', () => {
  it('sets keyEdge.side="home" when home team has clear form advantage', () => {
    const home  = teamWithForm('Brazil', 'BRA', [
      { r: 'W', gf: 2, ga: 0 }, { r: 'W', gf: 2, ga: 0 }, { r: 'W', gf: 3, ga: 1 },
      { r: 'W', gf: 1, ga: 0 }, { r: 'W', gf: 2, ga: 1 },
    ]) // 15 pts
    const away  = teamWithForm('Cameroon', 'CMR', [
      { r: 'L', gf: 0, ga: 2 }, { r: 'L', gf: 1, ga: 3 }, { r: 'D', gf: 1, ga: 1 },
      { r: 'L', gf: 0, ga: 1 }, { r: 'L', gf: 0, ga: 2 },
    ]) // 1 pt
    const facts = { ...baseFacts(home, away), dataConfidence: 'medium' as const }
    const result = runInsightsEngine(facts)
    expect(result.keyEdge.side).toBe('home')
    expect(result.keyEdge.teamName).toBe('Brazil')
  })

  it('sets keyEdge.side="away" when away team has clear form advantage', () => {
    const home  = teamWithForm('Saudi Arabia', 'KSA', [
      { r: 'L', gf: 0, ga: 3 }, { r: 'L', gf: 1, ga: 2 }, { r: 'L', gf: 0, ga: 1 },
    ]) // 0 pts
    const away  = teamWithForm('Argentina', 'ARG', [
      { r: 'W', gf: 3, ga: 0 }, { r: 'W', gf: 2, ga: 0 }, { r: 'W', gf: 1, ga: 0 },
    ]) // 9 pts
    const facts = { ...baseFacts(home, away), dataConfidence: 'medium' as const }
    const result = runInsightsEngine(facts)
    expect(result.keyEdge.side).toBe('away')
  })

  it('story references the stronger team when form gap exists', () => {
    const home  = teamWithForm('Germany', 'GER', [
      { r: 'W', gf: 3, ga: 0 }, { r: 'W', gf: 2, ga: 0 }, { r: 'W', gf: 1, ga: 0 },
      { r: 'W', gf: 2, ga: 1 }, { r: 'W', gf: 1, ga: 0 },
    ]) // 15 pts
    const away  = teamWithForm('Panama', 'PAN', [
      { r: 'L', gf: 0, ga: 2 }, { r: 'L', gf: 0, ga: 1 }, { r: 'L', gf: 1, ga: 3 },
      { r: 'L', gf: 0, ga: 1 }, { r: 'D', gf: 0, ga: 0 },
    ]) // 1 pt
    const facts = { ...baseFacts(home, away), dataConfidence: 'medium' as const }
    const result = runInsightsEngine(facts)
    expect(result.story).toContain('Germany')
  })
})

// ─── Tests: prediction consistency ───────────────────────────────

describe('Prediction consistency', () => {
  it('produces 1–3 reasoning bullets', () => {
    const home  = teamWithForm('France', 'FRA', [
      { r: 'W', gf: 2, ga: 0 }, { r: 'D', gf: 1, ga: 1 }, { r: 'W', gf: 3, ga: 0 },
    ])
    const away  = teamWithForm('Spain', 'ESP', [
      { r: 'W', gf: 1, ga: 0 }, { r: 'W', gf: 2, ga: 1 }, { r: 'D', gf: 0, ga: 0 },
    ])
    const facts = { ...baseFacts(home, away), dataConfidence: 'medium' as const }
    const result = runInsightsEngine(facts)
    expect(result.prediction.reasoning.length).toBeGreaterThanOrEqual(1)
    expect(result.prediction.reasoning.length).toBeLessThanOrEqual(3)
  })

  it('scores are clamped to 0–4', () => {
    const home  = teamWithForm('Brazil', 'BRA', [
      { r: 'W', gf: 6, ga: 0 }, { r: 'W', gf: 5, ga: 0 }, { r: 'W', gf: 7, ga: 0 },
    ]) // extreme scoring
    const away  = teamWithForm('Panama', 'PAN', [
      { r: 'L', gf: 0, ga: 5 }, { r: 'L', gf: 0, ga: 4 }, { r: 'L', gf: 0, ga: 3 },
    ])
    const facts = { ...baseFacts(home, away), dataConfidence: 'medium' as const }
    const result = runInsightsEngine(facts)
    expect(result.prediction.homeScore).toBeLessThanOrEqual(4)
    expect(result.prediction.awayScore).toBeGreaterThanOrEqual(0)
  })
})

// ─── Tests: form bubbles are preserved ───────────────────────────

describe('Form data in output', () => {
  it('includes recentForm in form.home and form.away', () => {
    const home  = teamWithForm('England', 'ENG', [
      { r: 'W', gf: 1, ga: 0 }, { r: 'D', gf: 0, ga: 0 }, { r: 'W', gf: 2, ga: 1 },
    ])
    const away  = teamWithForm('France', 'FRA', [
      { r: 'W', gf: 2, ga: 0 }, { r: 'L', gf: 0, ga: 1 }, { r: 'W', gf: 1, ga: 0 },
    ])
    const facts = { ...baseFacts(home, away), dataConfidence: 'medium' as const }
    const result = runInsightsEngine(facts)
    expect(result.form.home).toEqual(['W', 'D', 'W'])
    expect(result.form.away).toEqual(['W', 'L', 'W'])
  })

  it('returns empty form arrays when no data', () => {
    const facts = baseFacts(emptyTeam('Italy', 'ITA'), emptyTeam('England', 'ENG'))
    const result = runInsightsEngine(facts)
    expect(result.form.home).toHaveLength(0)
    expect(result.form.away).toHaveLength(0)
  })
})

// ─── Tests: DataProvenance helpers ───────────────────────────────

describe('DataProvenance helpers', () => {
  it('realProvenance sets verified=true and fallbackUsed=false', () => {
    const p = realProvenance('api-football:/stats', '2026-06-01T12:00:00Z')
    expect(p.verified).toBe(true)
    expect(p.confidence).toBe('verified')
    expect(p.fallbackUsed).toBe(false)
    expect(p.fetchedAt).toBe('2026-06-01T12:00:00Z')
  })

  it('noProvenance sets verified=false', () => {
    const p = noProvenance('pending')
    expect(p.verified).toBe(false)
    expect(p.confidence).toBe('none')
    expect(p.fetchedAt).toBeNull()
    expect(p.fallbackUsed).toBe(false)
  })

  it('partialProvenance sets verified=false with partial confidence', () => {
    const p = partialProvenance('backend:/squad', '2026-06-01T12:00:00Z')
    expect(p.verified).toBe(false)
    expect(p.confidence).toBe('partial')
  })

  it('fallbackUsed is never set to true by any helper', () => {
    const helpers = [
      realProvenance('src', '2026-01-01T00:00:00Z'),
      noProvenance('none'),
      partialProvenance('src', '2026-01-01T00:00:00Z'),
    ]
    helpers.forEach(p => expect(p.fallbackUsed).toBe(false))
  })
})
