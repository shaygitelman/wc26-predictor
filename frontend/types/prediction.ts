export type PredictionOutcome =
  | 'exact'       // correct score → 7 pts
  | 'difference'  // correct goal diff → 4 pts
  | 'outcome'     // correct W/D/L → 2 pts
  | 'wrong'       // no points
  | 'pending'     // match not finished yet

export interface Prediction {
  id: string
  userId: string
  matchId: string
  predictedHome: number
  predictedAway: number
  pointsEarned?: number
  outcome?: PredictionOutcome
  lockedAt: string
  createdAt: string
}
