import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { ContextHeader } from '@/components/layout/context-header'
import { UserAvatar } from '@/components/atoms/user-avatar'
import { LiveRefresh } from '@/components/atoms/live-refresh'
import { apiGet, apiGetCached } from '@/lib/api-server'
import { SESSION_COOKIE } from '@/lib/session'
import { cn } from '@/lib/utils'
import type { Match } from '@/types/match'

interface LeaderboardEntry {
  rank:        number
  userId:      string
  username:    string
  avatarId:    string | null
  avatarUrl:   string | null
  totalPoints: number
  isMe:        boolean
}

export default async function LeaderboardPage() {
  const store = await cookies()
  if (!store.get(SESSION_COOKIE)?.value) redirect('/login')

  const [entriesRes, matchesRes] = await Promise.allSettled([
    apiGet<LeaderboardEntry[]>('/users/leaderboard'),
    apiGetCached<Match[]>('/matches', 30, { auth: false }),
  ])
  const entries        = entriesRes.status === 'fulfilled' ? entriesRes.value : []
  const hasLiveMatches = matchesRes.status === 'fulfilled'
    ? matchesRes.value.some(m => m.status === 'live')
    : false

  const top3   = entries.slice(0, 3)
  const meRank = entries.find(e => e.isMe)?.rank ?? null

  return (
    <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
      <LiveRefresh active={hasLiveMatches} />
      <ContextHeader title="Rankings" />

      {entries.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center">
          <p className="text-sm text-muted-foreground">No rankings yet. Predict some matches!</p>
        </div>
      ) : (
        <div className="flex flex-col">

          {/* ── Podium ───────────────────────────────────── */}
          {top3.length >= 1 && (
            <div className="px-4 pt-6 pb-4">
              <div className="flex items-end justify-center gap-3">
                {top3[1] && <PodiumSlot entry={top3[1]} height="h-20" medal="🥈" />}
                <PodiumSlot entry={top3[0]} height="h-28" medal="🥇" highlight />
                {top3[2] && <PodiumSlot entry={top3[2]} height="h-14" medal="🥉" />}
              </div>
            </div>
          )}

          {/* ── My rank banner (if outside top 3) ────────── */}
          {meRank && meRank > 3 && (
            <div className="mx-4 mb-3 flex items-center gap-3 px-4 py-3 rounded-2xl bg-primary/[0.08] border border-primary/20">
              <span className="text-sm font-black text-primary">#{meRank}</span>
              <p className="text-sm font-semibold text-foreground flex-1">Your ranking</p>
              <span className="text-sm font-black text-primary">
                {entries.find(e => e.isMe)?.totalPoints ?? 0} pts
              </span>
            </div>
          )}

          {/* ── Full list ─────────────────────────────────── */}
          <div className="flex flex-col px-4 gap-1 pb-4">
            {entries.map(entry => (
              <LeaderboardRow key={entry.userId} entry={entry} />
            ))}
          </div>

        </div>
      )}
    </div>
  )
}

function PodiumSlot({
  entry, height, medal, highlight,
}: {
  entry:      LeaderboardEntry
  height:     string
  medal:      string
  highlight?: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-2 flex-1">
      <span className="text-xl">{medal}</span>
      <UserAvatar
        username={entry.username}
        avatarId={entry.avatarId ?? undefined}
        avatarUrl={entry.avatarUrl ?? undefined}
        size={highlight ? 'lg' : 'md'}
      />
      <p className={cn(
        'text-xs font-bold text-center truncate w-full px-1',
        entry.isMe ? 'text-primary' : 'text-foreground',
      )}>
        {entry.username}
      </p>
      <p className="text-xs text-muted-foreground">{entry.totalPoints} pts</p>
      <div className={cn(
        'w-full rounded-t-lg flex items-center justify-center',
        height,
        highlight
          ? 'bg-primary/20 border border-primary/30'
          : 'bg-surface-elevated border border-border',
      )}>
        <span className={cn(
          'text-2xl font-black',
          highlight ? 'text-primary' : 'text-muted-foreground',
        )}>
          {entry.rank}
        </span>
      </div>
    </div>
  )
}

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  const isTop3 = entry.rank <= 3
  return (
    <div className={cn(
      'flex items-center gap-3 px-3 py-2.5 rounded-xl',
      entry.isMe
        ? 'bg-primary/[0.08] border border-primary/20'
        : 'hover:bg-surface-elevated',
    )}>
      <span className={cn(
        'w-7 text-center text-sm font-black flex-shrink-0',
        isTop3     ? 'text-gold'    :
        entry.isMe ? 'text-primary' : 'text-muted-foreground',
      )}>
        {entry.rank}
      </span>
      <UserAvatar
        username={entry.username}
        avatarId={entry.avatarId ?? undefined}
        avatarUrl={entry.avatarUrl ?? undefined}
        size="sm"
      />
      <p className={cn(
        'flex-1 text-sm font-semibold truncate',
        entry.isMe ? 'text-primary' : 'text-foreground',
      )}>
        {entry.username}
        {entry.isMe && (
          <span className="ml-1.5 text-2xs font-bold text-primary/60">you</span>
        )}
      </p>
      <span className={cn(
        'text-sm font-black tabular flex-shrink-0',
        entry.isMe ? 'text-primary' : 'text-foreground',
      )}>
        {entry.totalPoints}
        <span className="text-2xs font-medium text-muted-foreground ml-0.5">pts</span>
      </span>
    </div>
  )
}
