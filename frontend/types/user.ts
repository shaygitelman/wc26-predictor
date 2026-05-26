export interface User {
  id: string
  username: string
  name?: string
  avatarUrl?: string
  avatarId?: string
  bio?: string
  createdAt: string
}

export interface UserStats {
  totalPoints:        number
  globalRank:         number
  totalUsers:         number
  exactScores:        number
  correctPredictions: number
  totalPredictions:   number
  exactScoreAccuracy: number
  rankChange?:        number  // optional, future use
}
