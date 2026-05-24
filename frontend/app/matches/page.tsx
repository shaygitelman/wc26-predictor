import { apiGetCached, apiGet } from '@/lib/api-server'
import { MatchesClient } from './matches-client'
import type { Match } from '@/types/match'
import type { Prediction } from '@/types/prediction'

export default async function MatchesPage() {
  const [matches, predictions] = await Promise.all([
    apiGetCached<Match[]>('/matches', 60, { auth: false }).catch(() => [] as Match[]),
    apiGet<Prediction[]>('/predictions/me').catch(() => [] as Prediction[]),
  ])

  return <MatchesClient initialMatches={matches} initialPredictions={predictions} />
}
