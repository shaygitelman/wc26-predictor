export interface TopScorerNominee {
  id: string
  name: string
  teamShortCode: string
  teamName: string
  flagUrl?: string
}

export interface ScorerInfo {
  id:            string
  name:          string
  photoUrl?:     string
  teamName?:     string
  teamShortCode?: string
  teamFlagUrl?:  string
}

export interface TournamentPick {
  winnerId?:    string
  topScorerId?: string
  scorer?:      ScorerInfo
  submittedAt?: string
  isLocked:     boolean
  lockTime?:    string  // ISO-8601 UTC — first match kickoff
}
