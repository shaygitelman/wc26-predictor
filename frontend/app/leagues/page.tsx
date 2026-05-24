import { ContextHeader } from '@/components/layout/context-header'
import { apiGet } from '@/lib/api-server'
import { LeaguesClient } from './leagues-client'
import type { League } from '@/types/league'

export default async function LeaguesPage() {
  let leagues: League[] = []
  try {
    leagues = await apiGet<League[]>('/leagues/me')
  } catch {
    // unauthenticated or backend unavailable — client renders empty state
  }

  return (
    <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
      <ContextHeader title="Leagues" />
      <LeaguesClient initialLeagues={leagues} />
    </div>
  )
}
