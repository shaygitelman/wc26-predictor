import { ContextHeader } from '@/components/layout/context-header'
import { apiGetCached } from '@/lib/api-server'
import { GroupsClient } from './groups-client'
import type { ApiGroupStandings, ApiBracketEntry } from '@/types/standings'

export default async function GroupsPage() {
  const [standings, bracket] = await Promise.all([
    apiGetCached<ApiGroupStandings[]>('/groups/standings', 300).catch(() => [] as ApiGroupStandings[]),
    apiGetCached<ApiBracketEntry[]>('/groups/bracket', 60).catch(() => [] as ApiBracketEntry[]),
  ])

  return (
    <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
      <ContextHeader title="Tournament" />
      <GroupsClient standings={standings} bracket={bracket} />
    </div>
  )
}
