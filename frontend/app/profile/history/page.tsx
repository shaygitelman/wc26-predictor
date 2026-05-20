import { ContextHeader } from '@/components/layout/context-header'
import { PredictionResultCard } from '@/components/molecules/prediction-result-card'
import { apiGet, apiGetCached } from '@/lib/api-server'
import type { Prediction } from '@/types/prediction'
import type { Match } from '@/types/match'

export default async function PredictionHistoryPage() {
  const [predictions, matches] = await Promise.allSettled([
    apiGet<Prediction[]>('/predictions/me'),
    apiGetCached<Match[]>('/matches', 60, { auth: false }),
  ])

  const predList   = predictions.status === 'fulfilled' ? predictions.value   : []
  const matchList  = matches.status     === 'fulfilled' ? matches.value       : []

  const matchMap = new Map(matchList.map(m => [m.id, m]))

  const rows = predList
    .map(p => ({ prediction: p, match: matchMap.get(p.matchId) }))
    .filter((x): x is { prediction: Prediction; match: Match } => x.match !== undefined)

  return (
    <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
      <ContextHeader title="Prediction History" back="/profile" />

      <div className="flex flex-col gap-3 p-4">
        {rows.length > 0 ? (
          rows.map(({ prediction, match }) => (
            <PredictionResultCard
              key={prediction.id}
              match={match}
              prediction={prediction}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
            <p className="text-sm text-muted-foreground">No predictions yet.</p>
            <a href="/matches" className="text-xs font-bold text-primary">
              Browse matches →
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
