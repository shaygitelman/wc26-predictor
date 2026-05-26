import { notFound } from 'next/navigation'
import { apiGet, apiGetCached } from '@/lib/api-server'
import { LeagueDetailClient } from './league-detail-client'
import type { League, LeagueStanding } from '@/types/league'
import type { Match } from '@/types/match'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function LeagueDetailPage({ params }: PageProps) {
  const { id } = await params

  const [leagueRes, standingsRes, matchesRes] = await Promise.allSettled([
    apiGet<League>(`/leagues/${id}`),
    apiGet<LeagueStanding[]>(`/leagues/${id}/standings`),
    apiGetCached<Match[]>('/matches', 30, { auth: false }),
  ])

  if (leagueRes.status === 'rejected') notFound()

  const league         = leagueRes.value
  const standings      = standingsRes.status === 'fulfilled' ? standingsRes.value : []
  const hasLiveMatches = matchesRes.status === 'fulfilled'
    ? matchesRes.value.some(m => m.status === 'live')
    : false

  return <LeagueDetailClient league={league} initialStandings={standings} hasLiveMatches={hasLiveMatches} />
}
