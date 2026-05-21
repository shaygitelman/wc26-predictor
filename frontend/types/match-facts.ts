export type AvailabilityStatus = 'injured' | 'suspended' | 'doubtful'

export type SquadDataSource = 'api-verified' | 'none'
export type SquadConfidence = 'verified' | 'none'

export interface PlayerStatus {
  name:    string
  status:  AvailabilityStatus
  detail?: string   // "Hamstring", "Yellow card accumulation", "Minor knock"

  // Validation provenance — present only when sourced from a real API response.
  // Absent when the entry came from a legacy/mock source.
  source?:         string   // endpoint URL that returned this player
  fetchedAt?:      string   // ISO 8601 timestamp of the fetch
  freshnessAgeMs?: number   // ms between fetchedAt and match kick-off
  validated?:      boolean  // true = passed all schema + dedup checks
}

export interface SquadFetchLog {
  endpoint:         string
  httpStatus:       number | 'network-error'
  playerCount:      number
  fetchedAt:        string
  freshnessAgeMs:   number
  validationResult: 'pass' | 'empty' | 'fail-schema' | 'fail-players' | 'endpoint-missing'
}

export interface TeamSquadStatus {
  injured:   PlayerStatus[]
  suspended: PlayerStatus[]
  doubtful:  PlayerStatus[]
}

export interface StatRow {
  label:          string
  home:           number
  away:           number
  unit:           string         // "" | "%" | "/g"
  higherIsBetter: boolean
  format:         'integer' | 'decimal'
}

export type ContextType =
  | 'rivalry'
  | 'must-win'
  | 'elimination-risk'
  | 'group-decider'
  | 'knockout-pressure'
  | 'upset-alert'
  | 'high-stakes'

export interface MatchContext {
  type:    ContextType
  label:   string
  detail?: string
}

export interface MatchFacts {
  matchId:     string
  generatedAt: string
  pendingData?: boolean   // true when one or both teams are not yet confirmed

  // Squad availability
  squad: {
    home: TeamSquadStatus
    away: TeamSquadStatus
  }

  // Provenance: how squad data was obtained
  squadSource:     SquadDataSource
  squadConfidence: SquadConfidence
  squadFetchedAt?: string

  // Debug logs — always present so the route can log them, not surfaced in UI
  squadLogs?: {
    home: SquadFetchLog
    away: SquadFetchLog
  }

  stats:   StatRow[]
  context: MatchContext[]
}
