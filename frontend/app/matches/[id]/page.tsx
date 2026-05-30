import { notFound }              from 'next/navigation'
import { apiGet, apiGetCached }  from '@/lib/api-server'
import { computeMatchInsights }  from '@/lib/compute-match-insights'
import { computeMatchFacts }     from '@/lib/compute-match-facts'
import { MatchDetailView }       from './view'
import type { Match }            from '@/types/match'
import type { Prediction }       from '@/types/prediction'
import type { League, LeagueMemberPrediction } from '@/types/league'
import type { ApiGroupStandings } from '@/types/standings'
import type { MatchInsights }    from '@/types/insights'
import type { MatchFacts }       from '@/types/match-facts'

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

  // Round 1 — match identity, user prediction, league memberships
  const [matchRes, predRes, leaguesRes] = await Promise.allSettled([
    apiGetCached<Match>(`/matches/${id}`, 60, { auth: false }),
    apiGet<Prediction | null>(`/predictions/${id}/me`),
    apiGet<League[]>('/leagues'),
  ])

  if (matchRes.status === 'rejected') notFound()

  const match   = matchRes.value
  const leagues = leaguesRes.status === 'fulfilled' ? (leaguesRes.value ?? []) : []

  // Round 2 — card data + picks, all in parallel
  const [standingsRes, insightsRes, factsRes, picksRes] = await Promise.allSettled([
    match.round === 'group' && match.group
      ? fetchGroupStandings(match.group, match.status)
      : Promise.resolve(null),
    computeMatchInsights(match),
    computeMatchFacts(id, match),
    leagues.length > 0
      ? apiGet<LeagueMemberPrediction[]>(`/leagues/${leagues[0].id}/matches/${id}/predictions`).catch(() => undefined)
      : Promise.resolve(undefined),
  ])

  const prediction     = predRes.status      === 'fulfilled' ? predRes.value      ?? undefined : undefined
  const groupStandings = standingsRes.status === 'fulfilled' ? standingsRes.value ?? undefined : undefined
  const insights       = insightsRes.status  === 'fulfilled' ? insightsRes.value  ?? undefined : undefined
  const facts          = factsRes.status     === 'fulfilled' ? factsRes.value     ?? undefined : undefined
  const initialPicks   = picksRes.status     === 'fulfilled' ? picksRes.value                 : undefined

  return (
    <MatchDetailView
      match={match}
      prediction={prediction}
      initialLeagues={leagues}
      initialPicks={initialPicks}
      initialGroupStandings={groupStandings}
      initialInsights={insights}
      initialFacts={facts}
    />
  )
}
