export interface League {
  id: string
  name: string
  inviteCode: string
  createdBy: string | null
  memberCount: number
  createdAt: string
  isDefault?: boolean
  isSystem?: boolean
}

export interface LeagueStanding {
  userId: string
  username: string
  avatarUrl?: string
  avatarId?: string
  rank: number | null
  totalPoints: number | null
  joinedAt: string
}

export interface MemberPick {
  hidden: boolean
  predictedHome: number | null
  predictedAway: number | null
  outcome: 'exact' | 'difference' | 'outcome' | 'wrong' | 'pending' | null
  pointsEarned: number | null
  isAutoPick?: boolean | null
  submittedAt?: string | null  // ISO 8601 — when user last saved their pick
}

export interface LeagueMemberTournamentPick {
  userId:          string
  username:        string
  avatarUrl?:      string | null
  avatarId?:       string | null
  winnerId?:       string | null
  winnerName?:     string | null
  winnerFlagUrl?:  string | null
  topScorerId?:    string | null
  scorerName?:     string | null
  scorerPhotoUrl?: string | null
  scorerTeamFlag?: string | null
  scorerTeamCode?: string | null
}

export interface MostPicked {
  id:          string
  name:        string
  count:       number
  flagUrl?:    string | null
  photoUrl?:   string | null
  teamFlagUrl?: string | null
  teamCode?:   string | null
}

export interface LeagueTournamentPicksData {
  isLocked:         boolean
  picks:            LeagueMemberTournamentPick[]
  mostPickedWinner?: MostPicked | null
  mostPickedScorer?: MostPicked | null
}

export interface LeagueMemberPrediction {
  userId: string
  username: string
  avatarUrl?: string | null
  avatarId?: string | null
  rank: number | null
  totalPoints: number | null
  isCurrentUser: boolean
  prediction: MemberPick | null
}

export interface LeagueActivityPrediction {
  userId: string
  username: string
  avatarUrl?: string | null
  avatarId?: string | null
  predictedHome: number | null
  predictedAway: number | null
  outcome: 'exact' | 'difference' | 'outcome' | 'wrong' | null
  pointsEarned: number | null
  isAutoPick: boolean
  isCurrentUser: boolean
}

export interface LeagueActivityMatch {
  matchId: string
  homeTeam: string
  homeFlagUrl: string | null
  homeCode: string
  awayTeam: string
  awayFlagUrl: string | null
  awayCode: string
  homeScore: number
  awayScore: number
  round: string
  scheduledAt: string
  predictions: LeagueActivityPrediction[]
}
