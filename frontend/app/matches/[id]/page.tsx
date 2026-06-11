import { notFound }              from 'next/navigation'
import { apiGet, apiGetCached }  from '@/lib/api-server'
import { computeMatchInsights }  from '@/lib/compute-match-insights'
import { computeMatchFacts }     from '@/lib/compute-match-facts'
import { MatchDetailView }       from './view'
import type { Match }            from '@/types/match'
import type { Prediction }       from '@/types/prediction'
import type { ApiGroupStandings } from '@/types/standings'
import type { MatchInsights }    from '@/types/insights'
import type { MatchFacts }       from '@/types/match-facts'
import type { MatchLeaguePredictions } from '@/types/match-league-predictions'

interface PageProps {
  params: Promise<{ id: string }>
}

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function fetchGroupStandings(group: string, status: string): Promise<ApiGroupStandings | null> {
  try {
    const isLive = status === 'live'
    const res = await fetch(`${API_BASE}/groups/standings`, {
      next: { revalidate: isLive ? 30 : 300 },
    })
    if (!res.ok) return null
    const all = await res.json() as ApiGroupStandings[]
    return all.find(g => g.group === group) ?? null
  } catch {
    return null
  }
}

export default async function MatchDetailPage({ params }: PageProps) {
  const { id } = await params

  // Round 1 — match + own prediction
  const [matchRes, predRes] = await Promise.allSettled([
    apiGetCached<Match>(`/matches/${id}`, 60, { auth: false }),
    apiGet<Prediction | null>(`/predictions/${id}/me`),
  ])

  if (matchRes.status === 'rejected') notFound()

  const match = matchRes.value

  // Round 2 — all secondary data in parallel (no serial waterfall)
  const [standingsRes, insightsRes, factsRes, leaguePredRes] = await Promise.allSettled([
    match.round === 'group' && match.group
      ? fetchGroupStandings(match.group, match.status)
      : Promise.resolve(null),
    computeMatchInsights(match),
    computeMatchFacts(id, match),
    apiGet<MatchLeaguePredictions>(`/matches/${id}/league-predictions`).catch(() => undefined),
  ])

  const prediction        = predRes.status       === 'fulfilled' ? predRes.value       ?? undefined : undefined
  const groupStandings    = standingsRes.status  === 'fulfilled' ? standingsRes.value  ?? undefined : undefined
  const insights          = insightsRes.status   === 'fulfilled' ? insightsRes.value   ?? undefined : undefined
  const facts             = factsRes.status      === 'fulfilled' ? factsRes.value      ?? undefined : undefined
  const leaguePredictions = leaguePredRes.status === 'fulfilled' ? leaguePredRes.value ?? undefined : undefined

  return (
    <MatchDetailView
      match={match}
      prediction={prediction}
      initialGroupStandings={groupStandings}
      initialInsights={insights}
      initialFacts={facts}
      initialLeaguePredictions={leaguePredictions}
    />
  )
}
