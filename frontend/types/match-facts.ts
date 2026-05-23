import type { DataProvenance } from './provenance'

export type AvailabilityStatus = 'injured' | 'suspended' | 'doubtful'

export type SquadDataSource = 'api-verified' | 'none'
export type SquadConfidence = 'verified' | 'none'

export type StatsDataSource = 'api-football' | 'none'
export type StatsConfidence = 'verified' | 'none'

// Provenance carried on every stats response — matches the backend to_dict() shape.
export interface StatsProvenance {
  source:     string    // e.g. "api-football:/fixtures/statistics"
  fetchedAt:  string    // ISO 8601
  verified:   boolean
  confidence: 'high' | 'medium' | 'low'
  fixtureId:  string
}

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

// Raw shape returned by GET /matches/{id}/stats on the backend.
// Null fields = API did not return a value; never a fabricated fallback.
export interface ApiTeamStats {
  possession:    number | null
  totalShots:    number | null
  shotsOnTarget: number | null
  corners:       number | null
  fouls:         number | null
  yellowCards:   number | null
  redCards:      number | null
  saves:         number | null
  offsides:      number | null
  passes:        number | null
  passAccuracy:  number | null
  xG:            number | null
}

export interface ApiMatchStats {
  matchId:    string
  fixtureId:  string
  source:     string
  fetchedAt:  string
  verified:   boolean
  confidence: 'high' | 'medium' | 'low'
  home:       ApiTeamStats
  away:       ApiTeamStats
}

// ─── Historical form & stats ───────────────────────────────────────
// Derived from the last 5 real internationals via API-Football.
// Fully independent of whether the WC26 match itself has been played.

export interface TeamFormEntry {
  result:      'W' | 'D' | 'L'
  goalsFor:    number
  goalsAgt:    number
  opponent:    string
  date:        string
  competition?: string
}

export type HistoricalConfidence = 'verified' | 'partial' | 'none'

export interface TeamHistoricalStats {
  code:             string
  form:             TeamFormEntry[]
  // Derived from form
  avgGoalsScored:   number | null
  avgGoalsConceded: number | null
  cleanSheets:      number | null  // count out of form.length
  btts:             number | null  // both teams scored
  // From /stats/{side} (per-match averages from real fixtures)
  avgPossession:    number | null
  avgShots:         number | null
  avgCorners:       number | null
  // Provenance
  fixtureCoverage:  number
  confidence:       HistoricalConfidence
  fetchedAt:        string
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

  stats:           StatRow[]
  statsSource:     StatsDataSource    // 'api-football' when real, 'none' when unavailable
  statsConfidence: StatsConfidence    // 'verified' when from real API, 'none' otherwise
  statsFetchedAt?: string             // ISO 8601 timestamp of the API fetch
  statsFixtureId?: string             // API-Football fixture ID that sourced the stats
  statsFallbackUsed: boolean          // true if any stat value was estimated/synthetic

  squadFallbackUsed: boolean          // true if any squad entry was estimated/synthetic

  // Historical form & team statistics — from API-Football historical fixtures.
  // Present for all confirmed matches regardless of tournament status.
  historicalHome?:       TeamHistoricalStats
  historicalAway?:       TeamHistoricalStats
  historicalConfidence?: HistoricalConfidence

  // Unified provenance envelope — always present
  provenance: DataProvenance

  context: MatchContext[]
}
