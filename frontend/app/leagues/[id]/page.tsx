import { notFound } from 'next/navigation'
import { apiGet } from '@/lib/api-server'
import { LeagueDetailClient } from './league-detail-client'
import type { League, LeagueStanding } from '@/types/league'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function LeagueDetailPage({ params }: PageProps) {
  const { id } = await params

  const [leagueRes, standingsRes] = await Promise.allSettled([
    apiGet<League>(`/leagues/${id}`),
    apiGet<LeagueStanding[]>(`/leagues/${id}/standings`),
  ])

  if (leagueRes.status === 'rejected') notFound()

  const league    = leagueRes.value
  const standings = standingsRes.status === 'fulfilled' ? standingsRes.value : []

  return <LeagueDetailClient league={league} initialStandings={standings} />
}
