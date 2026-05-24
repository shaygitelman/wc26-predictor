import { apiGetCached, apiGet } from '@/lib/api-server'
import { MatchesClient } from './matches-client'
import type { Match } from '@/types/match'
import type { Prediction } from '@/types/prediction'
import type { ApiGroupStandings } from '@/types/standings'

export default async function MatchesPage() {
  const [matches, predictions, standings] = await Promise.all([
    apiGetCached<Match[]>('/matches', 30, { auth: false }).catch(() => [] as Match[]),
    apiGet<Prediction[]>('/predictions/me').catch(() => [] as Prediction[]),
    apiGetCached<ApiGroupStandings[]>('/groups/standings', 300).catch(() => [] as ApiGroupStandings[]),
  ])

  return <MatchesClient initialMatches={matches} initialPredictions={predictions} initialStandings={standings} />
}
