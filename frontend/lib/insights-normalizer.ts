// Layer 2: Normalize raw API responses into validated, typed factual structures.
// No inference, no defaults, no fabrication — every field is real data or null.

import type { InsightsRawData, RealPlayerStat, RealTeamStats, RealSquadAvailability } from '@/types/insights-data'
import type { InsightsFacts, TeamFacts, H2HFacts, DataConfidence, ResultDetail } from '@/types/insights-facts'
import type { FormResult } from '@/types/insights'

function round1dp(n: number): number {
  return Math.round(n * 10) / 10
}

function buildTeamFacts(
  teamInfo: { id: string; name: string; shortCode: string },
  form?:    InsightsRawData['homeForm'],
  stats?:   RealTeamStats,
  players?: RealPlayerStat[],
  squad?:   RealSquadAvailability,
): TeamFacts {
  // Derive computed statistics from real result records
  const results: ResultDetail[] = (form ?? []).slice(-5).map(f => ({
    result:    f.result as FormResult,
    goalsFor:  f.goalsFor,
    goalsAgt:  f.goalsAgt,
    opponent:  f.opponent,
    date:      f.date,
  }))

  const n = results.length

  const avgGoalsScored    = n > 0 ? round1dp(results.reduce((s, r) => s + r.goalsFor, 0) / n) : null
  const avgGoalsConceded  = n > 0 ? round1dp(results.reduce((s, r) => s + r.goalsAgt, 0) / n) : null
  const cleanSheets       = n > 0 ? results.filter(r => r.goalsAgt === 0).length               : null
  const scoredInMatches   = n > 0 ? results.filter(r => r.goalsFor > 0).length                 : null
  const concededInMatches = n > 0 ? results.filter(r => r.goalsAgt > 0).length                 : null

  // Top performers — only populated when real stats are present with actual contributions
  let topScorer:   TeamFacts['topScorer']   = null
  let topAssister: TeamFacts['topAssister'] = null

  if (players && players.length > 0) {
    const byGoals   = [...players].sort((a, b) => b.goals   - a.goals)
    const byAssists = [...players].sort((a, b) => b.assists - a.assists)
    if (byGoals[0].goals     > 0) topScorer   = { name: byGoals[0].name,   teamName: teamInfo.name, goals:   byGoals[0].goals   }
    if (byAssists[0].assists > 0) topAssister = { name: byAssists[0].name, teamName: teamInfo.name, assists: byAssists[0].assists }
  }

  // Unavailable players from confirmed injury/suspension lists
  const unavailablePlayers: TeamFacts['unavailablePlayers'] = []
  if (squad) {
    squad.injured.forEach(p   => unavailablePlayers.push({ name: p.name, status: 'injured'   }))
    squad.suspended.forEach(p => unavailablePlayers.push({ name: p.name, status: 'suspended' }))
    squad.doubtful.forEach(p  => unavailablePlayers.push({ name: p.name, status: 'doubtful'  }))
  }

  return {
    shortCode: teamInfo.shortCode,
    name:      teamInfo.name,
    recentForm:        results.map(r => r.result),
    results,
    avgGoalsScored,
    avgGoalsConceded,
    cleanSheets,
    scoredInMatches,
    concededInMatches,
    avgCorners:    stats?.avgCorners    ?? null,
    avgPossession: stats?.avgPossession ?? null,
    avgShots:      stats?.avgShots      ?? null,
    unavailablePlayers,
    topScorer,
    topAssister,
  }
}

function buildH2HFacts(h2h?: InsightsRawData['h2h']): H2HFacts | null {
  if (!h2h || h2h.totalMatches === 0) return null

  return {
    homeWins:      h2h.homeWins,
    awayWins:      h2h.awayWins,
    draws:         h2h.draws,
    totalMeetings: h2h.totalMatches,
    lastMeeting:   h2h.lastMeeting ? {
      date:         h2h.lastMeeting.date,
      homeTeamName: h2h.lastMeeting.homeTeamName,
      awayTeamName: h2h.lastMeeting.awayTeamName,
      homeGoals:    h2h.lastMeeting.homeGoals,
      awayGoals:    h2h.lastMeeting.awayGoals,
    } : undefined,
  }
}

function assessConfidence(home: TeamFacts, away: TeamFacts, h2h: H2HFacts | null): DataConfidence {
  const hN = home.results.length
  const aN = away.results.length

  if (hN === 0 && aN === 0) return 'insufficient'
  if (hN < 3 || aN < 3)     return 'low'
  if (hN >= 5 && aN >= 5)   return h2h ? 'high' : 'medium'
  return 'medium'
}

export function normalizeInsightsFacts(raw: InsightsRawData): InsightsFacts {
  const home = buildTeamFacts(raw.homeTeam, raw.homeForm, raw.homeStats, raw.homePlayers, raw.homeSquad)
  const away = buildTeamFacts(raw.awayTeam, raw.awayForm, raw.awayStats, raw.awayPlayers, raw.awaySquad)
  const h2h  = buildH2HFacts(raw.h2h)

  return {
    matchId:        raw.matchId,
    home,
    away,
    h2h,
    isKnockout:     raw.isKnockout,
    dataConfidence: assessConfidence(home, away, h2h),
  }
}
