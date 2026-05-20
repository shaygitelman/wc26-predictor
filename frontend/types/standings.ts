import type { Team } from './match'

export interface GroupStanding {
  team: Team
  played:  number
  won:     number
  drawn:   number
  lost:    number
  goalsFor:     number
  goalsAgainst: number
  points:  number
  qualified?: 'r16' | 'playoff' | 'eliminated'
}

export interface BracketSlot {
  team?: Team
  score?: number
  isWinner?: boolean
}

export type BracketMatchStatus = 'tbd' | 'scheduled' | 'live' | 'finished'

export interface BracketMatch {
  id: string
  label?: string          // e.g. "1A vs 2B"
  home: BracketSlot
  away: BracketSlot
  status: BracketMatchStatus
  scheduledAt?: string
}

export type BracketRound = 'r16' | 'qf' | 'sf' | 'final' | '3rd'

// ── Real API shapes (from /api/groups/standings and /api/groups/bracket) ──

export interface ApiTeamStanding {
  id:               string
  name:             string
  shortCode:        string
  flagUrl:          string | null
  logoUrl:          string | null
  played:           number
  won:              number
  drawn:            number
  lost:             number
  goalsFor:         number
  goalsAgainst:     number
  goalDiff:         number
  points:           number
  isTbd:            boolean   // true for unconfirmed/placeholder team slots
  possiblyQualified: boolean  // true for 3rd-place (best-8-third-place rule)
}

export interface ApiGroupFixture {
  id:          string
  homeCode:    string
  awayCode:    string
  homeName:    string
  awayName:    string
  homeFlag:    string | null
  awayFlag:    string | null
  scheduledAt: string
  status:      string
  homeScore:   number | null
  awayScore:   number | null
}

export interface ApiGroupStandings {
  group:           string
  teams:           ApiTeamStanding[]
  matches:         ApiGroupFixture[]
  hasUnknownTeams: boolean   // true when ≥1 team slot is still TBD
}

export interface ApiBracketSlot {
  code:     string | null
  name:     string | null
  flagUrl:  string | null
  score:    number | null
  isWinner: boolean
}

export interface ApiBracketEntry {
  id:          string
  label:       string | null
  round:       string
  homeSlot:    ApiBracketSlot
  awaySlot:    ApiBracketSlot
  status:      string
  scheduledAt: string | null
}
