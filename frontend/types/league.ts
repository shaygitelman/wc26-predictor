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
