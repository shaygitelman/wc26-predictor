import type { FormResult } from '@/types/insights'

// Layer 2: Normalized, validated factual structures derived from real data.
// Every field is either a confirmed fact or null — never an estimate or a default.

export interface ResultDetail {
  result:    FormResult
  goalsFor:  number
  goalsAgt:  number
  opponent?: string
  date?:     string
}

export interface TeamFacts {
  shortCode: string
  name:      string

  // Derived from real recent results — null when no data
  recentForm:         FormResult[]    // up to 5, oldest → newest
  results:            ResultDetail[]  // raw records (for further computation)
  avgGoalsScored:     number | null
  avgGoalsConceded:   number | null
  cleanSheets:        number | null   // count (of results.length matches)
  scoredInMatches:    number | null   // how many matches they scored ≥ 1 goal
  concededInMatches:  number | null   // how many matches they conceded ≥ 1 goal

  // From stats API — null when endpoint is unavailable
  avgCorners:    number | null
  avgPossession: number | null   // 0–100
  avgShots:      number | null

  // From squad/injury data
  unavailablePlayers: { name: string; status: 'injured' | 'suspended' | 'doubtful' }[]

  // From player stats — null when no data or no contributions
  topScorer?:   { name: string; teamName: string; goals: number }   | null
  topAssister?: { name: string; teamName: string; assists: number } | null
}

export interface H2HFacts {
  homeWins:      number
  awayWins:      number
  draws:         number
  totalMeetings: number
  lastMeeting?:  {
    date:         string
    homeTeamName: string
    awayTeamName: string
    homeGoals:    number
    awayGoals:    number
  }
}

// Reflects how much real data is available for this match
export type DataConfidence = 'high' | 'medium' | 'low' | 'insufficient'

export interface InsightsFacts {
  matchId:        string
  home:           TeamFacts
  away:           TeamFacts
  h2h:            H2HFacts | null
  isKnockout:     boolean
  dataConfidence: DataConfidence
}
