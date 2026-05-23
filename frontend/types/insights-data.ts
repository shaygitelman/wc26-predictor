import type { Round } from '@/types/match'

export interface RealFormResult {
  result:    'W' | 'D' | 'L'
  opponent:  string
  goalsFor:  number
  goalsAgt:  number
  date:      string   // ISO 8601
}

export interface RealH2HRecord {
  homeWins:     number
  awayWins:     number
  draws:        number
  totalMatches: number
  lastMeeting?: {
    date:         string
    homeGoals:    number
    awayGoals:    number
    homeTeamName: string
    awayTeamName: string
  }
}

export interface RealPlayerStat {
  name:          string
  teamShortCode: string
  teamName:      string
  position?:     'GK' | 'DEF' | 'MID' | 'FWD'
  goals:         number
  assists:       number
}

// From /matches/:id/stats/home and /stats/away
// Fields are optional: API-Football may not return all stat types for every fixture.
export interface RealTeamStats {
  avgCorners?:    number   // corners earned per match
  avgPossession?: number   // 0–100
  avgShots?:      number   // total shots per match
  fixtureCoverage?: number // how many fixtures were sampled
  source?:        string
  fetchedAt?:     string
  verified?:      boolean
}

// From /matches/:id/injuries or /teams/:id/injuries
export interface RealSquadAvailability {
  injured:   { name: string; detail?: string }[]
  suspended: { name: string; detail?: string }[]
  doubtful:  { name: string; detail?: string }[]
}

export interface InsightsRawData {
  matchId:  string
  homeTeam: { id: string; name: string; shortCode: string }
  awayTeam: { id: string; name: string; shortCode: string }

  homeForm?:    RealFormResult[]    // oldest → newest, up to 5
  awayForm?:    RealFormResult[]
  h2h?:         RealH2HRecord
  homePlayers?: RealPlayerStat[]   // top performers in this tournament
  awayPlayers?: RealPlayerStat[]
  homeStats?:   RealTeamStats      // per-match averages
  awayStats?:   RealTeamStats
  homeSquad?:   RealSquadAvailability
  awaySquad?:   RealSquadAvailability

  round?:      Round
  isKnockout:  boolean
  fetchedAt:   string              // ISO 8601
}
