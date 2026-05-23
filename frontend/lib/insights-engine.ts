// Layer 3: AI interpretation — summarize, compare, and contextualize real data.
//
// RULES:
//   - Every generated sentence must reference a real measured value.
//   - No static team profiles. No fabricated narratives. No synthetic momentum.
//   - If data does not exist, the insight is omitted — not replaced with a guess.
//   - Confidence reflects actual data availability, not perceived match importance.

import type { InsightsFacts, TeamFacts } from '@/types/insights-facts'
import type {
  MatchInsights, MatchPersonality, SectionKey,
  TacticalInsight, InsightBullet, NarrativeInsight,
  FormResult, ConfidenceLevel, InsightDataPoint,
} from '@/types/insights'

// ─── Helpers ──────────────────────────────────────────────────────

// Codes that unambiguously mean "team not yet determined"
const _TBD_CODES = new Set(['TBD', 'TBA', '', 'N/A', 'NONE', 'NULL'])

// Bracket-placeholder patterns stored in team names by the seed service:
//   "1st Group A", "2nd Group B", "Best 3rd Place", "TBD", "Winner …" etc.
const _TBD_NAME_RE =
  /^\s*(tbd|tba|winner|loser|runner-?up|\d+(?:st|nd|rd|th)\s+group|best\s+3rd|match\s+\d)/i

/**
 * Returns true only when a team slot is genuinely unresolved.
 * Accepts null/undefined safely — a missing shortCode is itself a TBD signal.
 * Passes matchId for debug logging.
 */
function isTBD(
  shortCode: string | null | undefined,
  teamName:  string | null | undefined,
  matchId:   string,
): boolean {
  const code = (shortCode ?? '').toUpperCase().trim()

  if (_TBD_CODES.has(code)) {
    console.warn(
      `[InsightsEngine] TBD by shortCode — match: ${matchId}, ` +
      `shortCode: ${JSON.stringify(shortCode)}, name: ${JSON.stringify(teamName)}`,
    )
    return true
  }

  // Secondary signal: bracket-label team name (e.g. "1st Group A", "Best 3rd Place")
  if (teamName && _TBD_NAME_RE.test(teamName)) {
    console.warn(
      `[InsightsEngine] TBD by team name — match: ${matchId}, ` +
      `shortCode: ${JSON.stringify(shortCode)}, name: ${JSON.stringify(teamName)}`,
    )
    return true
  }

  return false
}

function formPoints(form: FormResult[]): number {
  return form.reduce((s, r) => s + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0)
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n !== 1 ? 's' : ''}`
}

// ─── Tactical insights — strictly from measured statistics ────────
//
// Each insight requires a specific numeric threshold to be met.
// The text always states the actual number so the claim is self-evidencing.

function buildTacticalInsights(home: TeamFacts, away: TeamFacts): TacticalInsight[] {
  const all: TacticalInsight[] = []

  // ── Scoring output ──
  if (home.avgGoalsScored !== null && home.avgGoalsScored >= 2.0) {
    const dp: InsightDataPoint[] = [
      { teamName: home.name, value: `${home.avgGoalsScored.toFixed(1)} g/game`, side: 'home' },
      ...(away.avgGoalsScored !== null ? [{ teamName: away.name, value: `${away.avgGoalsScored.toFixed(1)} g/game`, side: 'away' as const }] : []),
    ]
    all.push({
      category:   'finishing',
      text:       `${home.name} have averaged ${home.avgGoalsScored.toFixed(1)} goals per match across their last ${home.results.length} — consistent attacking output is a confirmed pattern.`,
      highlight:  'positive',
      source:     'home.avgGoalsScored',
      dataPoints: dp,
    })
  }
  if (away.avgGoalsScored !== null && away.avgGoalsScored >= 2.0) {
    const dp: InsightDataPoint[] = [
      ...(home.avgGoalsScored !== null ? [{ teamName: home.name, value: `${home.avgGoalsScored.toFixed(1)} g/game`, side: 'home' as const }] : []),
      { teamName: away.name, value: `${away.avgGoalsScored.toFixed(1)} g/game`, side: 'away' },
    ]
    all.push({
      category:   'finishing',
      text:       `${away.name} have averaged ${away.avgGoalsScored.toFixed(1)} goals per match in their last ${away.results.length} — they have been consistently dangerous in the final third.`,
      highlight:  'positive',
      source:     'away.avgGoalsScored',
      dataPoints: dp,
    })
  }

  // ── Defensive solidity ──
  if (home.cleanSheets !== null && home.results.length >= 4 && home.cleanSheets >= 3) {
    all.push({
      category:   'defensive-shape',
      text:       `${home.name} have kept ${plural(home.cleanSheets, 'clean sheet')} in their last ${home.results.length} — defensive solidity is a confirmed structural feature.`,
      highlight:  'positive',
      source:     'home.cleanSheets',
      dataPoints: [{ teamName: home.name, value: `${home.cleanSheets}/${home.results.length} clean sheets`, side: 'home' }],
    })
  }
  if (away.cleanSheets !== null && away.results.length >= 4 && away.cleanSheets >= 3) {
    all.push({
      category:   'defensive-shape',
      text:       `${away.name} have kept ${plural(away.cleanSheets, 'clean sheet')} in their last ${away.results.length} — their defensive record has been exceptional.`,
      highlight:  'positive',
      source:     'away.cleanSheets',
      dataPoints: [{ teamName: away.name, value: `${away.cleanSheets}/${away.results.length} clean sheets`, side: 'away' }],
    })
  }

  // ── Defensive vulnerability ──
  if (home.avgGoalsConceded !== null && home.avgGoalsConceded >= 1.8 &&
      !(home.cleanSheets !== null && home.results.length >= 4 && home.cleanSheets >= 3)) {
    all.push({
      category:   'defensive-shape',
      text:       `${home.name} have conceded ${home.avgGoalsConceded.toFixed(1)} goals per match — defensive gaps have been a recurring pattern in recent fixtures.`,
      highlight:  'warning',
      source:     'home.avgGoalsConceded',
      dataPoints: [{ teamName: home.name, value: `${home.avgGoalsConceded.toFixed(1)} conceded/game`, side: 'home' }],
    })
  }
  if (away.avgGoalsConceded !== null && away.avgGoalsConceded >= 1.8 &&
      !(away.cleanSheets !== null && away.results.length >= 4 && away.cleanSheets >= 3)) {
    all.push({
      category:   'defensive-shape',
      text:       `${away.name} have conceded ${away.avgGoalsConceded.toFixed(1)} goals per match in their last ${away.results.length} — ${home.name} will target a backline with confirmed vulnerabilities.`,
      highlight:  'warning',
      source:     'away.avgGoalsConceded',
      dataPoints: [{ teamName: away.name, value: `${away.avgGoalsConceded.toFixed(1)} conceded/game`, side: 'away' }],
    })
  }

  // ── Possession contrast — only when BOTH teams have real possession data ──
  if (home.avgPossession !== null && away.avgPossession !== null) {
    const hP = home.avgPossession
    const aP = away.avgPossession
    const possDp: InsightDataPoint[] = [
      { teamName: home.name, value: `${hP.toFixed(0)}% possession`, side: 'home' },
      { teamName: away.name, value: `${aP.toFixed(0)}% possession`, side: 'away' },
    ]
    if (hP >= 57 && aP <= 44) {
      all.push({
        category:   'possession',
        text:       `${home.name} average ${hP.toFixed(0)}% possession versus ${away.name}'s ${aP.toFixed(0)}% — if that pattern holds, ${home.name} will look to control tempo through sustained territorial pressure.`,
        highlight:  'neutral',
        source:     'home.avgPossession,away.avgPossession',
        dataPoints: possDp,
      })
    } else if (aP >= 57 && hP <= 44) {
      all.push({
        category:   'possession',
        text:       `${away.name} average ${aP.toFixed(0)}% possession versus ${home.name}'s ${hP.toFixed(0)}% — territorial control through the ball is ${away.name}'s established system.`,
        highlight:  'neutral',
        source:     'home.avgPossession,away.avgPossession',
        dataPoints: possDp,
      })
    }
  }

  // ── Set-piece platform — only when corners data exists ──
  if (home.avgCorners !== null && home.avgCorners >= 6.0) {
    all.push({
      category:   'set-pieces',
      text:       `${home.name} earn an average of ${home.avgCorners.toFixed(1)} corners per match — dead-ball delivery is a confirmed attacking platform.`,
      highlight:  'positive',
      source:     'home.avgCorners',
      dataPoints: [{ teamName: home.name, value: `${home.avgCorners.toFixed(1)} corners/match`, side: 'home' }],
    })
  }
  if (away.avgCorners !== null && away.avgCorners >= 6.0) {
    all.push({
      category:   'set-pieces',
      text:       `${away.name} average ${away.avgCorners.toFixed(1)} corners per match — their set-piece delivery is a threat ${home.name} must specifically prepare for.`,
      highlight:  'warning',
      source:     'away.avgCorners',
      dataPoints: [{ teamName: away.name, value: `${away.avgCorners.toFixed(1)} corners/match`, side: 'away' }],
    })
  }

  // ── Open-game signal — both teams scoring AND conceding ──
  if (
    home.avgGoalsScored !== null && away.avgGoalsScored !== null &&
    home.avgGoalsConceded !== null && away.avgGoalsConceded !== null &&
    home.avgGoalsScored >= 1.8 && away.avgGoalsScored >= 1.8 &&
    home.avgGoalsConceded >= 1.2 && away.avgGoalsConceded >= 1.2
  ) {
    all.push({
      category:   'transition',
      text:       `Both teams average over 1.8 goals scored and over 1.2 conceded per match — data from both sides points to an open fixture where both ends will be active.`,
      highlight:  'neutral',
      source:     'home.avgGoalsScored,away.avgGoalsScored,home.avgGoalsConceded,away.avgGoalsConceded',
      dataPoints: [
        { teamName: home.name, value: `${home.avgGoalsScored!.toFixed(1)} scored, ${home.avgGoalsConceded!.toFixed(1)} conceded`, side: 'home' },
        { teamName: away.name, value: `${away.avgGoalsScored!.toFixed(1)} scored, ${away.avgGoalsConceded!.toFixed(1)} conceded`, side: 'away' },
      ],
    })
  }

  // ── Clean-sheet streak ──
  if (home.scoredInMatches !== null &&
      home.results.length >= 4 &&
      home.scoredInMatches === home.results.length) {
    all.push({
      category:   'finishing',
      text:       `${home.name} have scored in all ${home.results.length} of their recent matches — they have not been held scoreless in this run.`,
      highlight:  'positive',
      source:     'home.scoredInMatches',
      dataPoints: [{ teamName: home.name, value: `Scored in ${home.results.length}/${home.results.length} games`, side: 'home' }],
    })
  }

  // ── Squad disruption — only when confirmed injury data exists ──
  if (home.unavailablePlayers.length >= 2) {
    const names = home.unavailablePlayers.slice(0, 3).map(p => p.name).join(', ')
    all.push({
      category:   'key-duel',
      text:       `${home.name} are missing ${plural(home.unavailablePlayers.length, 'confirmed player')} (${names}) — squad depth and system flexibility will be tested.`,
      highlight:  'warning',
      source:     'home.unavailablePlayers',
      dataPoints: [{ teamName: home.name, value: `${home.unavailablePlayers.length} absent`, side: 'home' }],
    })
  }
  if (away.unavailablePlayers.length >= 2) {
    const names = away.unavailablePlayers.slice(0, 3).map(p => p.name).join(', ')
    all.push({
      category:   'key-duel',
      text:       `${away.name} are without ${plural(away.unavailablePlayers.length, 'confirmed player')} (${names}) — the absentees may shift their tactical shape and available options.`,
      highlight:  'warning',
      source:     'away.unavailablePlayers',
      dataPoints: [{ teamName: away.name, value: `${away.unavailablePlayers.length} absent`, side: 'away' }],
    })
  }

  // Cap at 3 — prefer warnings first (higher stakes), then positives
  const sorted = [
    ...all.filter(i => i.highlight === 'warning'),
    ...all.filter(i => i.highlight === 'positive'),
    ...all.filter(i => i.highlight === 'neutral'),
  ]
  return sorted.slice(0, 3)
}

// ─── H2H section — from real historical record only ──────────────

function buildH2HBullets(
  homeName: string,
  awayName: string,
  h2h:      InsightsFacts['h2h'],
): InsightBullet[] {
  if (!h2h || h2h.totalMeetings === 0) return []

  const { homeWins, awayWins, draws, totalMeetings, lastMeeting } = h2h
  const bullets: InsightBullet[] = []

  if (homeWins > awayWins && homeWins > draws) {
    bullets.push({
      text:      `${homeName} lead the all-time record — ${homeWins}W ${draws}D ${awayWins}L across ${plural(totalMeetings, 'meeting')}`,
      highlight: 'positive',
      source:    'h2h.record',
    })
  } else if (awayWins > homeWins && awayWins > draws) {
    bullets.push({
      text:      `${awayName} hold the historical advantage — ${awayWins}W ${draws}D ${homeWins}L across ${plural(totalMeetings, 'meeting')}`,
      highlight: 'neutral',
      source:    'h2h.record',
    })
  } else if (draws >= homeWins && draws >= awayWins && draws > 0) {
    bullets.push({
      text:      `${draws} of ${totalMeetings} previous meetings have ended level — a closely balanced historical record`,
      highlight: 'neutral',
      source:    'h2h.record',
    })
  } else {
    bullets.push({
      text:      `${plural(totalMeetings, 'previous meeting')}: ${homeName} ${homeWins}W ${draws}D ${awayWins}L`,
      highlight: 'neutral',
      source:    'h2h.record',
    })
  }

  if (lastMeeting) {
    const date = new Date(lastMeeting.date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    bullets.push({
      text:      `Last meeting (${date}): ${lastMeeting.homeTeamName} ${lastMeeting.homeGoals}–${lastMeeting.awayGoals} ${lastMeeting.awayTeamName}`,
      highlight: 'neutral',
      source:    'h2h.lastMeeting',
    })
  }

  return bullets
}

// ─── Key players — from real tournament stats only ────────────────
//
// A player is only mentioned when they have a confirmed goal or assist tally.
// The team name always precedes the player name.

function buildKeyPlayerBullets(home: TeamFacts, away: TeamFacts): InsightBullet[] {
  const bullets: InsightBullet[] = []

  if (home.topScorer) {
    const { name, teamName, goals } = home.topScorer
    bullets.push({
      text:      `${teamName}'s ${name} — ${plural(goals, 'goal')} in this tournament`,
      highlight: 'positive',
      source:    'home.topScorer.goals',
    })
  } else if (home.topAssister) {
    const { name, teamName, assists } = home.topAssister
    bullets.push({
      text:      `${teamName}'s ${name} — ${plural(assists, 'assist')} in this tournament`,
      highlight: 'positive',
      source:    'home.topAssister.assists',
    })
  }

  if (away.topScorer) {
    const { name, teamName, goals } = away.topScorer
    bullets.push({
      text:      `${teamName}'s ${name} — ${plural(goals, 'goal')} in this tournament`,
      highlight: 'positive',
      source:    'away.topScorer.goals',
    })
  } else if (away.topAssister) {
    const { name, teamName, assists } = away.topAssister
    bullets.push({
      text:      `${teamName}'s ${name} — ${plural(assists, 'assist')} in this tournament`,
      highlight: 'positive',
      source:    'away.topAssister.assists',
    })
  }

  return bullets
}

// ─── Personality — from real data patterns only ───────────────────

function derivePersonality(
  home:       TeamFacts,
  away:       TeamFacts,
  isKnockout: boolean,
): MatchPersonality {
  const hasData = home.results.length > 0 || away.results.length > 0

  // Only apply the knockout label when we have real form data to back it up.
  // Without data the label would be a synthetic assertion — fall through to 'balanced'.
  if (isKnockout && hasData) return 'tactical-battle'

  const hAvg = home.avgGoalsScored
  const aAvg = away.avgGoalsScored
  const hCon = home.avgGoalsConceded
  const aCon = away.avgGoalsConceded

  // Explosive: both teams scoring at high rates
  if (hAvg !== null && aAvg !== null && hAvg > 2.0 && aAvg > 2.0) return 'explosive'

  // Defensive grind: both teams rarely concede
  if (hCon !== null && aCon !== null && hCon < 0.8 && aCon < 0.8) return 'defensive-grind'

  if (
    home.cleanSheets !== null && away.cleanSheets !== null &&
    home.results.length >= 4 && away.results.length >= 4 &&
    home.cleanSheets >= 3 && away.cleanSheets >= 3
  ) return 'defensive-grind'

  // Upset alert: large form-points gap
  if (home.recentForm.length >= 4 && away.recentForm.length >= 4) {
    if (Math.abs(formPoints(home.recentForm) - formPoints(away.recentForm)) >= 6) return 'upset-alert'
  }

  // Star power: both teams have high-scoring forwards confirmed
  if (home.topScorer && away.topScorer &&
      home.topScorer.goals >= 3 && away.topScorer.goals >= 3) {
    return 'star-power'
  }

  return 'balanced'
}

// ─── Narrative — knockout stakes only (factual, not emotional) ────

function buildNarrative(facts: InsightsFacts): NarrativeInsight | null {
  if (!facts.isKnockout) return null
  return {
    headline: 'Knockout Stage',
    body:     'One match. Defeat ends the tournament. With elimination on the line, defensive structure and the capacity to manage risk typically take precedence — teams that have been open in the group stage tend to tighten, and the first goal carries disproportionate weight.',
  }
}

// ─── Edge — from real form only, text always references numbers ───

function buildEdge(
  home: TeamFacts,
  away: TeamFacts,
): Pick<MatchInsights, 'edge' | 'confidence' | 'upsetAlert' | 'edgeNote'> {
  const hasForm = home.recentForm.length > 0 && away.recentForm.length > 0

  if (!hasForm) {
    return {
      edge:       { team: 'none', teamName: 'No Data', strength: 'slight' },
      confidence: 'low',
      upsetAlert: false,
      edgeNote:   'Insufficient match data to assess a statistical edge — analysis will update as the tournament progresses.',
    }
  }

  const homePoints = formPoints(home.recentForm)
  const awayPoints = formPoints(away.recentForm)
  const diff       = homePoints - awayPoints
  const n          = Math.min(home.results.length, away.results.length)

  let edge:       MatchInsights['edge']
  let confidence: ConfidenceLevel
  let upsetAlert  = false
  let edgeNote:   string

  if (Math.abs(diff) <= 2) {
    edge       = { team: 'draw', teamName: 'Either Side', strength: 'slight' }
    confidence = n >= 5 ? 'medium' : 'low'

    if (home.avgGoalsScored !== null && away.avgGoalsScored !== null &&
        home.avgGoalsScored > 1.8 && away.avgGoalsScored > 1.8) {
      edgeNote = `Form is level (${homePoints}pts vs ${awayPoints}pts in last ${n} matches) — both sides have been scoring freely, which points to an open and unpredictable contest.`
    } else {
      edgeNote = `Form is level (${homePoints}pts vs ${awayPoints}pts in last ${n} matches) — no statistical edge separates these teams on current evidence.`
    }
  } else if (diff > 0) {
    const strength = diff >= 5 ? 'clear' : 'slight'
    edge       = { team: 'home', teamName: home.name, strength }
    confidence = strength === 'clear' && n >= 4 ? 'medium' : 'low'
    edgeNote   = `${home.name} hold a form advantage — ${homePoints}pts vs ${awayPoints}pts from their last ${n} matches`

    if (home.avgGoalsScored !== null) {
      edgeNote += `, averaging ${home.avgGoalsScored.toFixed(1)} goals scored per game`
    }
    if (away.avgGoalsConceded !== null && away.avgGoalsConceded >= 1.5) {
      edgeNote += `. ${away.name} have conceded ${away.avgGoalsConceded.toFixed(1)} goals per match — this compounds the form gap.`
    } else {
      edgeNote += '.'
    }
  } else {
    const strength = Math.abs(diff) >= 5 ? 'clear' : 'slight'
    edge       = { team: 'away', teamName: away.name, strength }
    confidence = strength === 'clear' && n >= 4 ? 'medium' : 'low'
    edgeNote   = `${away.name} arrive with stronger form — ${awayPoints}pts vs ${homePoints}pts from their last ${n} matches`

    if (away.avgGoalsScored !== null) {
      edgeNote += `, averaging ${away.avgGoalsScored.toFixed(1)} goals scored per game`
    }
    if (home.avgGoalsConceded !== null && home.avgGoalsConceded >= 1.5) {
      edgeNote += `. ${home.name} have conceded ${home.avgGoalsConceded.toFixed(1)} goals per match — this compounds the form gap.`
    } else {
      edgeNote += '.'
    }
  }

  // Upset alert: the trailing-form side has a meaningful attacking record
  if (edge.team !== 'draw') {
    const favPts     = edge.team === 'home' ? homePoints : awayPoints
    const undPts     = edge.team === 'home' ? awayPoints : homePoints
    const undAvgGoal = edge.team === 'home' ? away.avgGoalsScored : home.avgGoalsScored
    upsetAlert = undPts >= favPts - 4 && undAvgGoal !== null && undAvgGoal >= 1.8
  }

  return { edge, confidence, upsetAlert, edgeNote }
}

// ─── Section order ────────────────────────────────────────────────

function buildSectionOrder(
  personality:    MatchPersonality,
  hasForm:        boolean,
  hasTactical:    boolean,
  hasNarrative:   boolean,
  hasKeyPlayers:  boolean,
  hasH2H:         boolean,
): SectionKey[] {
  const maybe = (key: SectionKey, cond: boolean): SectionKey | false => cond ? key : false
  const filter = (keys: (SectionKey | false)[]): SectionKey[] =>
    keys.filter((k): k is SectionKey => k !== false)

  switch (personality) {
    case 'explosive':
      return filter([maybe('key-players', hasKeyPlayers), maybe('form', hasForm),    maybe('tactical', hasTactical), maybe('narrative', hasNarrative), maybe('head-to-head', hasH2H)])
    case 'tactical-battle':
      return filter([maybe('tactical', hasTactical),      maybe('form', hasForm),    maybe('narrative', hasNarrative), maybe('key-players', hasKeyPlayers), maybe('head-to-head', hasH2H)])
    case 'defensive-grind':
      return filter([maybe('form', hasForm),              maybe('tactical', hasTactical), maybe('head-to-head', hasH2H), maybe('narrative', hasNarrative), maybe('key-players', hasKeyPlayers)])
    case 'upset-alert':
      return filter([maybe('form', hasForm),              maybe('tactical', hasTactical), maybe('narrative', hasNarrative), maybe('key-players', hasKeyPlayers), maybe('head-to-head', hasH2H)])
    case 'star-power':
      return filter([maybe('key-players', hasKeyPlayers), maybe('form', hasForm),    maybe('tactical', hasTactical), maybe('narrative', hasNarrative), maybe('head-to-head', hasH2H)])
    default:
      return filter([maybe('form', hasForm),              maybe('tactical', hasTactical), maybe('narrative', hasNarrative), maybe('key-players', hasKeyPlayers), maybe('head-to-head', hasH2H)])
  }
}

// ─── Personality labels ───────────────────────────────────────────

const PERSONALITY_LABELS: Record<MatchPersonality, string> = {
  'explosive':       'Explosive',
  'tactical-battle': 'Tactical',
  'defensive-grind': 'Defensive',
  'upset-alert':     'Upset Alert',
  'star-power':      'Star Power',
  'balanced':        'Open Game',
}

// ─── Main engine ──────────────────────────────────────────────────

export function runInsightsEngine(facts: InsightsFacts): MatchInsights {
  const { matchId, home, away, isKnockout, dataConfidence } = facts

  // Genuinely unresolved teams — return placeholder, no analysis
  if (isTBD(home.shortCode, home.name, matchId) || isTBD(away.shortCode, away.name, matchId)) {
    console.warn(`[InsightsEngine] Returning placeholder for match ${matchId} — one or both teams are unresolved.`)
    return {
      matchId,
      generatedAt:      new Date().toISOString(),
      insufficientData: true,
      personality:      'balanced',
      personalityLabel: 'Pending',
      volatility:       0,
      form:             { home: [], away: [] },
      formSampleSize:   { home: 0, away: 0 },
      tactical:         [],
      narrative:        null,
      coachingHint:     null,
      keyPlayers:       [],
      headToHead:       [],
      edge:             { team: 'none', teamName: 'No Data', strength: 'slight' },
      confidence:       'low',
      upsetAlert:       false,
      edgeNote:         'Analysis becomes available once both teams are confirmed.',
      sectionOrder:     [],
    }
  }

  // Confirmed teams with no form data yet — degraded analysis, NOT a placeholder
  if (dataConfidence === 'insufficient') {
    console.warn(
      `[InsightsEngine] Confirmed match ${matchId} has no form data — ` +
      `home.results: ${home.results.length}, away.results: ${away.results.length}. ` +
      `Rendering limited analysis (not placeholder).`,
    )
  }

  // Build all sections — empty arrays / null means the section is simply omitted
  // Skip tactical when there is genuinely no data to draw from (avoids empty-shell output)
  const tactical    = dataConfidence !== 'insufficient' ? buildTacticalInsights(home, away) : []
  const headToHead  = buildH2HBullets(home.name, away.name, facts.h2h)
  const keyPlayers  = buildKeyPlayerBullets(home, away)
  const narrative   = buildNarrative(facts)
  const personality = derivePersonality(home, away, isKnockout)
  const edgeMeta    = buildEdge(home, away)

  const sectionOrder = buildSectionOrder(
    personality,
    home.recentForm.length > 0,
    tactical.length > 0,
    narrative !== null,
    keyPlayers.length > 0,
    headToHead.length > 0,
  )

  return {
    matchId,
    generatedAt:      new Date().toISOString(),
    insufficientData: false,   // only true in the TBD early return above
    personality,
    personalityLabel: PERSONALITY_LABELS[personality],
    volatility:       0,
    form:             { home: home.recentForm, away: away.recentForm },
    formSampleSize:   { home: home.results.length, away: away.results.length },
    tactical,
    narrative,
    coachingHint:     null,
    keyPlayers,
    headToHead,
    ...edgeMeta,
    sectionOrder,
  }
}
