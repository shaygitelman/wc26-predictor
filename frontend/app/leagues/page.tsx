import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { ContextHeader } from '@/components/layout/context-header'
import { apiGet } from '@/lib/api-server'
import { SESSION_COOKIE } from '@/lib/session'
import { LeaguesClient } from './leagues-client'
import type { League } from '@/types/league'

export default async function LeaguesPage() {
  const store = await cookies()
  if (!store.get(SESSION_COOKIE)?.value) redirect('/login')

  let leagues: League[] = []
  try {
    leagues = await apiGet<League[]>('/leagues/me')
  } catch {
    // backend unavailable — client renders empty state
  }

  return (
    <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
      <ContextHeader title="Leagues" />
      <LeaguesClient initialLeagues={leagues} />
    </div>
  )
}
