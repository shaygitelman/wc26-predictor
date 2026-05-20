export type AvailabilityStatus = 'injured' | 'suspended' | 'doubtful'

export interface PlayerStatus {
  name:    string
  status:  AvailabilityStatus
  detail?: string   // "Hamstring", "Yellow card accumulation", "Minor knock"
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

  squad: {
    home: TeamSquadStatus
    away: TeamSquadStatus
  }

  stats:   StatRow[]
  context: MatchContext[]
}
