import { notFound } from 'next/navigation'
import { apiGet, apiGetCached } from '@/lib/api-server'
import { MatchDetailView } from './view'
import type { Match } from '@/types/match'
import type { Prediction } from '@/types/prediction'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function MatchDetailPage({ params }: PageProps) {
  const { id } = await params

  let match: Match
  try {
    match = await apiGetCached<Match>(`/matches/${id}`, 60, { auth: false })
  } catch {
    notFound()
  }

  let prediction: Prediction | undefined
  try {
    prediction = await apiGet<Prediction | null>(`/predictions/${id}/me`) ?? undefined
  } catch {
    // unauthenticated or no prediction — proceed without one
  }

  return <MatchDetailView match={match} prediction={prediction} />
}
