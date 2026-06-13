// Layer 3: Rule-based fallback engine.
//
// RULES:
//   - Every generated sentence must reference a real measured value.
//   - No static team profiles. No fabricated narratives. No synthetic momentum.
//   - If data does not exist, acknowledge it honestly — never guess.
//   - This output is the fallback when Groq is unavailable. Groq is preferred.

import type { InsightsFacts, TeamFacts } from '@/types/insights-facts'
import type { MatchInsights, FormResult, ConfidenceLevel, KeyEdge, AIPrediction } from '@/types/insights'

// ─── Helpers ──────────────────────────────────────────────────────

const _TBD_CODES = new Set(['TBD', 'TBA', '', 'N/A', 'NONE', 'NULL'])
const _TBD_NAME_RE =
  /^\s*(tbd|tba|winner|loser|runner-?up|\d+(?:st|nd|rd|th)\s+group|best\s+3rd|match\s+\d)/i

function isTBD(shortCode: string | null | undefined, teamName: string | null | undefined, matchId: string): boolean {
  const code = (shortCode ?? '').toUpperCase().trim()
  if (_TBD_CODES.has(code)) {
    console.warn(`[InsightsEngine] TBD by shortCode — match: ${matchId}, shortCode: ${JSON.stringify(shortCode)}`)
    return true
  }
  if (teamName && _TBD_NAME_RE.test(teamName)) {
    console.warn(`[InsightsEngine] TBD by name — match: ${matchId}, name: ${JSON.stringify(teamName)}`)
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

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

// ─── Story ────────────────────────────────────────────────────────

function buildStory(home: TeamFacts, away: TeamFacts, h2h: InsightsFacts['h2h'], isKnockout: boolean): string {
  const hasForm = home.results.length >= 3 && away.results.length >= 3

  const h2hNote = h2h && h2h.totalMeetings >= 2
    ? ` Their ${plural(h2h.totalMeetings, 'previous meeting')} gives ${
        h2h.homeWins > h2h.awayWins ? home.name : h2h.awayWins > h2h.homeWins ? away.name : 'neither side'
      } the historical edge.`
    : ''

  const knockoutNote = isKnockout
    ? ' With elimination on the line, defensive discipline and moment-management become decisive.'
    : ''

  if (!hasForm) {
    return (
      `${home.name} and ${away.name} step out at the World Cup with limited recent competitive data to draw from.` +
      `${h2hNote}` +
      ` The contest is genuinely open before a ball has been kicked.` +
      `${knockoutNote}`
    )
  }

  const homePoints = formPoints(home.recentForm)
  const awayPoints = formPoints(away.recentForm)
  const diff       = homePoints - awayPoints
  const n          = Math.min(home.results.length, away.results.length)

  if (Math.abs(diff) <= 2) {
    const bothScoring =
      home.avgGoalsScored !== null && away.avgGoalsScored !== null &&
      home.avgGoalsScored >= 1.8 && away.avgGoalsScored >= 1.8
    const goalNote = bothScoring
      ? ` Both sides have averaged over ${Math.min(home.avgGoalsScored!, away.avgGoalsScored!).toFixed(1)} goals per game — the data points to an open contest.`
      : ' On current numbers, this is genuinely difficult to call.'
    return (
      `${home.name} and ${away.name} arrive evenly matched — ${homePoints}pts versus ${awayPoints}pts across their last ${n} outings.` +
      `${goalNote}${h2hNote}${knockoutNote}`
    )
  }

  const stronger    = diff > 0 ? home : away
  const weaker      = diff > 0 ? away : home
  const strongerPts = diff > 0 ? homePoints : awayPoints
  const weakerPts   = diff > 0 ? awayPoints : homePoints
  const attackNote  = stronger.avgGoalsScored !== null
    ? ` They have averaged ${stronger.avgGoalsScored.toFixed(1)} goals per match in that run.`
    : ''

  return (
    `${stronger.name} arrive as the clear form side — ${strongerPts}pts from their last ${n} outings to ${weaker.name}'s ${weakerPts}pts.` +
    `${attackNote}${h2hNote}${knockoutNote}`
  )
}

// ─── Key Edge ─────────────────────────────────────────────────────

function buildKeyEdge(home: TeamFacts, away: TeamFacts): KeyEdge {
  const hasForm = home.recentForm.length > 0 && away.recentForm.length > 0

  if (!hasForm) {
    // Fall back to attack comparison
    const hGoals = home.avgGoalsScored ?? 0
    const aGoals = away.avgGoalsScored ?? 0
    if (Math.abs(hGoals - aGoals) >= 0.4) {
      const stronger  = hGoals >= aGoals ? home : away
      const side      = hGoals >= aGoals ? 'home' : 'away'
      const conceded  = hGoals >= aGoals ? away.avgGoalsConceded : home.avgGoalsConceded
      return {
        teamCode:    stronger.shortCode,
        teamName:    stronger.name,
        side,
        label:       'Attacking Output',
        explanation: `${stronger.name} have averaged ${Math.max(hGoals, aGoals).toFixed(1)} goals per match in recent outings${
          conceded !== null ? `, while their opponents have conceded ${conceded.toFixed(1)} per game` : ''
        }. The attacking data marginally favours ${stronger.name} ahead of this fixture.`,
      }
    }
    return {
      teamCode:    home.shortCode,
      teamName:    home.name,
      side:        'home',
      label:       'Home Advantage',
      explanation: `Without clear statistical separation, the familiarity of the home side with local conditions and crowd support provides a marginal edge. Both teams enter this match on level terms in terms of recent data.`,
    }
  }

  const homePoints = formPoints(home.recentForm)
  const awayPoints = formPoints(away.recentForm)
  const diff       = homePoints - awayPoints
  const n          = Math.min(home.results.length, away.results.length)

  const stronger = diff >= 0 ? home : away
  const weaker   = diff >= 0 ? away : home
  const side     = diff >= 0 ? 'home' : 'away'
  const sPts     = diff >= 0 ? homePoints : awayPoints
  const wPts     = diff >= 0 ? awayPoints : homePoints
  const absDiff  = Math.abs(diff)

  // Pick label based on what drives the advantage
  let label: string
  const hasDefAdv  = stronger.cleanSheets !== null && stronger.results.length >= 4 && stronger.cleanSheets >= 3
  const hasAttAdv  = stronger.avgGoalsScored !== null && stronger.avgGoalsScored >= 2.0
  const formGapBig = absDiff >= 5

  if (hasDefAdv)      label = 'Defensive Solidity'
  else if (hasAttAdv) label = 'Attacking Output'
  else if (formGapBig) label = 'Superior Recent Form'
  else                label = 'Slight Form Edge'

  const defNote =
    stronger.cleanSheets !== null && stronger.results.length >= 4 && stronger.cleanSheets >= 3
      ? ` They have kept ${plural(stronger.cleanSheets, 'clean sheet')} in their last ${stronger.results.length} — defensive reliability backs the form numbers.`
      : ''

  const attNote =
    stronger.avgGoalsScored !== null
      ? ` ${stronger.name} average ${stronger.avgGoalsScored.toFixed(1)} goals per game, adding consistent attacking output to their form advantage.`
      : ''

  return {
    teamCode:    stronger.shortCode,
    teamName:    stronger.name,
    side,
    label,
    explanation:
      `${stronger.name} hold a clear form edge — ${sPts}pts versus ${weaker.name}'s ${wPts}pts across their last ${n} outings.` +
      `${defNote || attNote}${
        weaker.avgGoalsConceded !== null && weaker.avgGoalsConceded >= 1.5
          ? ` ${weaker.name} have conceded ${weaker.avgGoalsConceded.toFixed(1)} goals per game, compounding the gap.`
          : ''
      }`,
  }
}

// ─── Deciding Factors ─────────────────────────────────────────────

function buildDecidingFactors(home: TeamFacts, away: TeamFacts, h2h: InsightsFacts['h2h']): string[] {
  const factors: string[] = []

  // Attacking efficiency if either side scores
  if ((home.avgGoalsScored ?? 0) >= 1.5 || (away.avgGoalsScored ?? 0) >= 1.5)
    factors.push('Finishing quality and final-third efficiency')

  // Defensive contrast
  const hCon = home.avgGoalsConceded ?? 0
  const aCon = away.avgGoalsConceded ?? 0
  if (hCon >= 1.5 || aCon >= 1.5)
    factors.push('Defensive organisation under sustained pressure')
  else if (hCon < 1.0 && aCon < 1.0)
    factors.push('Which backline holds firm in a low-scoring contest')

  // Set pieces
  if ((home.avgCorners ?? 0) >= 5.5 || (away.avgCorners ?? 0) >= 5.5)
    factors.push('Dead-ball delivery and aerial duels from set pieces')

  // Possession contrast
  if (home.avgPossession !== null && away.avgPossession !== null && Math.abs(home.avgPossession - away.avgPossession) >= 10)
    factors.push('Midfield control and ball retention under pressure')

  // Squad disruptions
  if (home.unavailablePlayers.length >= 2 || away.unavailablePlayers.length >= 2)
    factors.push('Depth and tactical adaptability with key absences')

  // H2H-driven factor
  if (h2h && h2h.totalMeetings >= 3 && h2h.draws >= 2)
    factors.push('Breaking the pattern — these teams have drawn more than half their previous meetings')

  // Fillers if not enough
  if (factors.length < 2) factors.push('Transition speed and counter-attacking execution')
  if (factors.length < 3) factors.push('Goalkeeper performance and shot-stopping in key moments')

  return factors.slice(0, 3)
}

// ─── Prediction ───────────────────────────────────────────────────

function buildPrediction(home: TeamFacts, away: TeamFacts): AIPrediction {
  const hasForm = home.results.length >= 3 && away.results.length >= 3

  // Expected goals: average of scored-per-game vs opponent's conceded-per-game
  const hScored   = home.avgGoalsScored    ?? 1.2
  const aScored   = away.avgGoalsScored    ?? 1.2
  const hConceded = home.avgGoalsConceded  ?? 1.2
  const aConceded = away.avgGoalsConceded  ?? 1.2

  let homeXG = (hScored + aConceded) / 2
  let awayXG = (aScored + hConceded) / 2

  // Form bias: up to 15% if 5+ point gap
  if (hasForm) {
    const homePoints = formPoints(home.recentForm)
    const awayPoints = formPoints(away.recentForm)
    const diff       = homePoints - awayPoints
    const bias       = clamp(Math.abs(diff) / 15, 0, 0.15)
    if (diff > 2)  homeXG *= (1 + bias)
    if (diff < -2) awayXG *= (1 + bias)
  }

  const homeScore = clamp(Math.round(homeXG), 0, 4)
  const awayScore = clamp(Math.round(awayXG), 0, 4)

  const confidence: ConfidenceLevel =
    home.results.length >= 5 && away.results.length >= 5 ? 'medium'
    : home.results.length >= 3 && away.results.length >= 3 ? 'low'
    : 'low'

  const reasoning: string[] = []

  if (home.avgGoalsScored !== null || away.avgGoalsScored !== null) {
    const hG = home.avgGoalsScored !== null ? `${home.name} averaging ${home.avgGoalsScored.toFixed(1)} goals/game` : null
    const aG = away.avgGoalsScored !== null ? `${away.name} at ${away.avgGoalsScored.toFixed(1)} goals/game` : null
    if (hG && aG) reasoning.push(`${hG} vs ${aG} — expected output suggests ${homeScore > awayScore ? home.name : awayScore > homeScore ? away.name : 'a close contest'}`)
    else if (hG)  reasoning.push(`${hG} backs a score in favour of the home side`)
    else if (aG)  reasoning.push(`${aG} backs a stronger away contribution`)
  }

  if (hasForm) {
    const hp = formPoints(home.recentForm)
    const ap = formPoints(away.recentForm)
    const n  = Math.min(home.results.length, away.results.length)
    reasoning.push(`Form points: ${home.name} ${hp}pts vs ${away.name} ${ap}pts from last ${n} games`)
  }

  if (home.cleanSheets !== null && home.results.length >= 4 && home.cleanSheets >= 3)
    reasoning.push(`${home.name} have kept ${plural(home.cleanSheets, 'clean sheet')} in ${home.results.length} recent outings — defensive record backs a low away tally`)
  else if (away.cleanSheets !== null && away.results.length >= 4 && away.cleanSheets >= 3)
    reasoning.push(`${away.name} have kept ${plural(away.cleanSheets, 'clean sheet')} in ${away.results.length} recent outings — strong defensive form backs a low home tally`)

  if (reasoning.length === 0)
    reasoning.push(`Limited data available — prediction is based on estimated expected output`)
  if (reasoning.length < 2)
    reasoning.push(`Confidence is low given sparse match data ahead of the tournament`)
  if (reasoning.length < 3)
    reasoning.push(`Score may vary significantly as World Cup form data becomes available`)

  return {
    homeScore,
    awayScore,
    homeTeamName: home.name,
    awayTeamName: away.name,
    reasoning:    reasoning.slice(0, 3),
    confidence,
  }
}

// ─── TBD placeholder ─────────────────────────────────────────────

function tbdInsights(matchId: string): MatchInsights {
  return {
    matchId,
    generatedAt:      new Date().toISOString(),
    insufficientData: true,
    story:            '',
    keyEdge:          { teamCode: '', teamName: '', side: 'home', label: '', explanation: '' },
    decidingFactors:  [],
    prediction:       { homeScore: 0, awayScore: 0, homeTeamName: '', awayTeamName: '', reasoning: [], confidence: 'low' },
    form:             { home: [], away: [] },
  }
}

// ─── Main engine ──────────────────────────────────────────────────

export function runInsightsEngine(facts: InsightsFacts): MatchInsights {
  const { matchId, home, away, isKnockout, dataConfidence } = facts

  if (isTBD(home.shortCode, home.name, matchId) || isTBD(away.shortCode, away.name, matchId)) {
    console.warn(`[InsightsEngine] Returning placeholder for match ${matchId} — one or both teams are unresolved.`)
    return tbdInsights(matchId)
  }

  if (dataConfidence === 'insufficient') {
    console.warn(
      `[InsightsEngine] Match ${matchId} has no form data — ` +
      `home.results: ${home.results.length}, away.results: ${away.results.length}. ` +
      `Rendering limited analysis.`,
    )
  }

  const story          = buildStory(home, away, facts.h2h, isKnockout)
  const keyEdge        = buildKeyEdge(home, away)
  const decidingFactors = buildDecidingFactors(home, away, facts.h2h)
  const prediction     = buildPrediction(home, away)

  return {
    matchId,
    generatedAt:      new Date().toISOString(),
    insufficientData: false,
    story,
    keyEdge,
    decidingFactors,
    prediction,
    form:             { home: home.recentForm, away: away.recentForm },
  }
}
