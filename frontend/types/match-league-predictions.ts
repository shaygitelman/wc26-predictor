export type PredictionOutcome = 'exact' | 'difference' | 'outcome' | 'wrong' | 'pending'

export interface LeaguePredictionEntry {
  userId:        string
  username:      string
  avatarUrl?:    string | null
  avatarId?:     string | null
  rank:          number | null
  totalPoints:   number | null
  isCurrentUser: boolean
  predictedHome: number
  predictedAway: number
  outcome:       PredictionOutcome | null
  pointsEarned:  number | null
  isAutoPick:    boolean
  submittedAt:   string  // ISO 8601 — when user last saved their pick
}

export interface LeaguePredictionGroup {
  leagueId:       string
  leagueName:     string
  isDefault:      boolean
  totalMembers:   number
  predictedCount: number
  predictions:    LeaguePredictionEntry[]
}

export interface MatchLeaguePredictions {
  matchStatus:      string  // 'scheduled' | 'live' | 'finished'
  matchScheduledAt: string  // ISO 8601 — used for "X before kickoff" calc
  leagues:          LeaguePredictionGroup[]
}
