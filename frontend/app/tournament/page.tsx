import { apiGet, apiGetCached } from '@/lib/api-server'
import { TournamentClient } from './tournament-client'
import type { TeamDetail, Player } from '@/types/match'
import type { TournamentPick } from '@/types/tournament'

export default async function TournamentPage() {
  const [teamsRes, pickRes, favoritesRes] = await Promise.allSettled([
    apiGetCached<TeamDetail[]>('/teams', 300, { auth: false }),
    apiGet<TournamentPick>('/tournament/picks/me'),
    apiGetCached<Player[]>('/players/favorites', 60),
  ])

  const rawTeams  = teamsRes.status     === 'fulfilled' ? teamsRes.value     : []
  const pick      = pickRes.status      === 'fulfilled' ? pickRes.value      : null
  const favorites = favoritesRes.status === 'fulfilled' ? favoritesRes.value : []

  return <TournamentClient rawTeams={rawTeams} initialPick={pick} initialFavorites={favorites} />
}
