/**
 * No-hallucination guarantee tests for the insights engine.
 *
 * Verifies:
 *  1. No form data → edge.team is 'none', never 'draw' (no synthetic assessment)
 *  2. No form data + knockout → personality is NOT 'tactical-battle' (no label without data)
 *  3. TBD teams → insufficientData=true, edge.team='none'
 *  4. Real form data → edge.team is 'home'|'away'|'draw' based on actual points
 *  5. Tactical insights only fire when specific numeric thresholds are met
 *  6. Zero form data → zero tactical insights (no fabricated observations)
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

// ─── Tests: edge.team='none' when no data ────────────────────────

describe('No-data edge fallback', () => {
  it('returns edge.team="none" when both teams have no form data', () => {
    const facts = baseFacts(emptyTeam('Brazil', 'BRA'), emptyTeam('Argentina', 'ARG'))
    const result = runInsightsEngine(facts)
    expect(result.edge.team).toBe('none')
  })

  it('never returns edge.team="draw" for a no-data match (would be fabricated)', () => {
    const facts = baseFacts(emptyTeam('France', 'FRA'), emptyTeam('Germany', 'GER'))
    const result = runInsightsEngine(facts)
    expect(result.edge.team).not.toBe('draw')
  })

  it('returns confidence="low" when no form data', () => {
    const facts = baseFacts(emptyTeam('Spain', 'ESP'), emptyTeam('Portugal', 'POR'))
    const result = runInsightsEngine(facts)
    expect(result.confidence).toBe('low')
  })
})

// ─── Tests: personality not 'tactical-battle' without data ───────

describe('Personality without data', () => {
  it('does NOT label knockout match as tactical-battle when no form data exists', () => {
    const facts = baseFacts(emptyTeam('USA', 'USA'), emptyTeam('Mexico', 'MEX'), true)
    const result = runInsightsEngine(facts)
    expect(result.personality).not.toBe('tactical-battle')
  })

  it('returns tactical-battle only when knockout AND real form data exists', () => {
    const home  = teamWithForm('Brazil', 'BRA', [
      { r: 'W', gf: 2, ga: 0 }, { r: 'W', gf: 1, ga: 0 }, { r: 'D', gf: 1, ga: 1 },
      { r: 'W', gf: 3, ga: 1 }, { r: 'W', gf: 2, ga: 0 },
    ])
    const away  = teamWithForm('Argentina', 'ARG', [
      { r: 'W', gf: 1, ga: 0 }, { r: 'D', gf: 0, ga: 0 }, { r: 'W', gf: 2, ga: 1 },
      { r: 'L', gf: 0, ga: 1 }, { r: 'W', gf: 1, ga: 0 },
    ])
    const facts = { ...baseFacts(home, away, true), dataConfidence: 'medium' as const }
    const result = runInsightsEngine(facts)
    expect(result.personality).toBe('tactical-battle')
  })
})

// ─── Tests: TBD teams ────────────────────────────────────────────

describe('TBD teams', () => {
  it('returns insufficientData=true for TBD short codes', () => {
    const home  = { ...emptyTeam('TBD', 'TBD') }
    const away  = emptyTeam('Argentina', 'ARG')
    const facts = baseFacts(home, away)
    const result = runInsightsEngine(facts)
    expect(result.insufficientData).toBe(true)
  })

  it('returns edge.team="none" for TBD matches', () => {
    const home  = { ...emptyTeam('Winner Group A', 'TBD') }
    const away  = emptyTeam('Runner-up Group B', 'TBA')
    const facts = baseFacts(home, away)
    const result = runInsightsEngine(facts)
    expect(result.edge.team).toBe('none')
  })

  it('returns empty tactical array for TBD matches', () => {
    const home  = { ...emptyTeam('TBD', 'TBD') }
    const away  = emptyTeam('Germany', 'GER')
    const facts = baseFacts(home, away)
    const result = runInsightsEngine(facts)
    expect(result.tactical).toHaveLength(0)
  })
})

// ─── Tests: zero tactical insights without data ──────────────────

describe('No fabricated tactical insights', () => {
  it('produces zero tactical insights when both teams have no form data', () => {
    const facts = baseFacts(emptyTeam('Italy', 'ITA'), emptyTeam('England', 'ENG'))
    const result = runInsightsEngine(facts)
    expect(result.tactical).toHaveLength(0)
  })

  it('produces zero tactical insights when dataConfidence=insufficient', () => {
    const home  = emptyTeam('Japan', 'JPN')
    const away  = emptyTeam('Morocco', 'MAR')
    const facts: InsightsFacts = {
      matchId:        'test-match-2',
      home,
      away,
      h2h:            null,
      isKnockout:     false,
      dataConfidence: 'insufficient',
    }
    const result = runInsightsEngine(facts)
    expect(result.tactical).toHaveLength(0)
  })
})

// ─── Tests: real edge from real data ─────────────────────────────

describe('Real edge from real form data', () => {
  it('gives home edge when home team has significantly more points', () => {
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
    expect(result.edge.team).toBe('home')
    expect(result.edge.teamName).toBe('Brazil')
  })

  it('gives away edge when away team has significantly more points', () => {
    const home  = teamWithForm('Saudi Arabia', 'KSA', [
      { r: 'L', gf: 0, ga: 3 }, { r: 'L', gf: 1, ga: 2 }, { r: 'L', gf: 0, ga: 1 },
    ]) // 0 pts
    const away  = teamWithForm('Argentina', 'ARG', [
      { r: 'W', gf: 3, ga: 0 }, { r: 'W', gf: 2, ga: 0 }, { r: 'W', gf: 1, ga: 0 },
    ]) // 9 pts
    const facts = { ...baseFacts(home, away), dataConfidence: 'medium' as const }
    const result = runInsightsEngine(facts)
    expect(result.edge.team).toBe('away')
  })

  it('returns draw edge when form is level', () => {
    const home  = teamWithForm('England', 'ENG', [
      { r: 'W', gf: 1, ga: 0 }, { r: 'D', gf: 0, ga: 0 }, { r: 'W', gf: 2, ga: 1 },
    ]) // 7 pts
    const away  = teamWithForm('France', 'FRA', [
      { r: 'D', gf: 0, ga: 0 }, { r: 'W', gf: 2, ga: 0 }, { r: 'W', gf: 1, ga: 0 },
    ]) // 7 pts
    const facts = { ...baseFacts(home, away), dataConfidence: 'medium' as const }
    const result = runInsightsEngine(facts)
    expect(result.edge.team).toBe('draw')
  })
})

// ─── Tests: tactical insights only from real thresholds ──────────

describe('Tactical insights only from real thresholds', () => {
  it('generates a finishing insight only when avgGoalsScored >= 2.0', () => {
    const high  = teamWithForm('Brazil', 'BRA', [
      { r: 'W', gf: 3, ga: 0 }, { r: 'W', gf: 2, ga: 1 }, { r: 'W', gf: 3, ga: 0 },
      { r: 'W', gf: 2, ga: 0 }, { r: 'W', gf: 2, ga: 1 },
    ]) // avg 2.4 goals scored
    const low   = teamWithForm('Saudi Arabia', 'KSA', [
      { r: 'L', gf: 0, ga: 2 }, { r: 'L', gf: 1, ga: 3 }, { r: 'D', gf: 0, ga: 0 },
      { r: 'L', gf: 0, ga: 1 }, { r: 'L', gf: 1, ga: 2 },
    ]) // avg 0.4 goals scored — below threshold
    const facts: InsightsFacts = {
      matchId:        'test-match-3',
      home:           high,
      away:           low,
      h2h:            null,
      isKnockout:     false,
      dataConfidence: 'medium',
    }
    const result = runInsightsEngine(facts)
    const finishingInsights = result.tactical.filter(t => t.category === 'finishing')
    expect(finishingInsights.length).toBeGreaterThan(0)
    // The insight text must reference the actual number — never a fabricated claim
    expect(finishingInsights[0].text).toContain('2.4')
    // Source must point to real data
    expect(finishingInsights[0].source).toContain('avgGoalsScored')
  })

  it('does NOT generate tactical insights when avgGoalsScored < 2.0', () => {
    const home  = teamWithForm('Bolivia', 'BOL', [
      { r: 'L', gf: 1, ga: 2 }, { r: 'D', gf: 0, ga: 0 }, { r: 'L', gf: 0, ga: 1 },
      { r: 'D', gf: 1, ga: 1 }, { r: 'L', gf: 1, ga: 2 },
    ]) // avg 0.6 goals — no threshold met
    const away  = teamWithForm('Panama', 'PAN', [
      { r: 'D', gf: 0, ga: 0 }, { r: 'L', gf: 0, ga: 1 }, { r: 'D', gf: 1, ga: 1 },
      { r: 'L', gf: 0, ga: 2 }, { r: 'L', gf: 1, ga: 3 },
    ]) // avg 0.4 goals — no threshold met
    const facts: InsightsFacts = {
      matchId:        'test-match-4',
      home,
      away,
      h2h:            null,
      isKnockout:     false,
      dataConfidence: 'medium',
    }
    const result = runInsightsEngine(facts)
    const finishingInsights = result.tactical.filter(t => t.category === 'finishing')
    expect(finishingInsights).toHaveLength(0)
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
