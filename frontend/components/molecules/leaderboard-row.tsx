import { cn } from '@/lib/utils'
import { UserAvatar } from '@/components/atoms/user-avatar'

interface LeaderboardRowProps {
  rank: number | null
  username: string
  avatarUrl?: string
  avatarId?: string
  points: number | null
  isCurrentUser?: boolean
  className?: string
}

const PODIUM: Record<number, {
  card: string
  rankText: string
  medal: string
}> = {
  1: {
    card:     'bg-gold-muted border-gold-border shadow-gold',
    rankText: 'text-gold font-black',
    medal:    '🥇',
  },
  2: {
    card:     'bg-card border-border',
    rankText: 'text-foreground font-black',
    medal:    '🥈',
  },
  3: {
    card:     'bg-card border-border',
    rankText: 'text-status-partial font-black',
    medal:    '🥉',
  },
}

export function LeaderboardRow({
  rank,
  username,
  avatarUrl,
  avatarId,
  points,
  isCurrentUser = false,
  className,
}: LeaderboardRowProps) {
  // rank=null means the member has show_stats disabled — don't apply podium treatment
  const podium = rank !== null ? PODIUM[rank] : undefined

  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors',
      isCurrentUser
        ? 'bg-primary-muted border-primary/25 shadow-primary-glow'
        : podium
          ? podium.card
          : 'bg-card border-border',
      className,
    )}>

      {/* Rank */}
      <span className={cn(
        'w-7 text-center text-sm tabular flex-shrink-0',
        rank === null
          ? 'text-muted-foreground/35 font-semibold'
          : podium ? podium.rankText : 'text-muted-foreground font-semibold',
      )}>
        {rank === null ? '—' : podium ? podium.medal : `#${rank}`}
      </span>

      {/* Avatar */}
      <UserAvatar username={username} avatarId={avatarId} avatarUrl={avatarUrl} size="sm" />

      {/* Username */}
      <span className={cn(
        'flex-1 font-semibold text-[15px] truncate',
        isCurrentUser ? 'text-primary' : 'text-foreground',
      )}>
        {username}
        {isCurrentUser && (
          <span className="ml-1.5 text-xs font-normal text-primary/60">(you)</span>
        )}
      </span>

      {/* Points */}
      <span className={cn(
        'text-[15px] font-black tabular flex-shrink-0',
        points === null
          ? 'text-muted-foreground/35'
          : rank === 1 ? 'text-gold' : 'text-foreground',
      )}>
        {points === null
          ? '—'
          : points.toLocaleString()
        }
        {points !== null && (
          <span className="text-xs font-medium text-muted-foreground ml-1">pts</span>
        )}
      </span>
    </div>
  )
}
