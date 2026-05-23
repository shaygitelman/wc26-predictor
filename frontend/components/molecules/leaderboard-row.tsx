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
  card:     string
  rankText: string
  medal:    string
  pts:      string
}> = {
  1: {
    card:     'bg-gradient-to-r from-gold-muted/80 to-gold-muted/30 border-gold-border shadow-gold',
    rankText: 'text-gold font-black text-base',
    medal:    '🥇',
    pts:      'text-gold',
  },
  2: {
    card:     'bg-card border-border/80',
    rankText: 'text-foreground/90 font-black text-base',
    medal:    '🥈',
    pts:      'text-foreground',
  },
  3: {
    card:     'bg-card border-border/80',
    rankText: 'text-status-partial font-black text-base',
    medal:    '🥉',
    pts:      'text-status-partial',
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
  const podium = rank !== null ? PODIUM[rank] : undefined

  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-colors',
      isCurrentUser
        ? 'bg-primary-muted border-primary/30 shadow-primary-glow'
        : podium
          ? podium.card
          : 'bg-card border-border',
      className,
    )}>

      {/* Rank */}
      <span className={cn(
        'w-8 text-center tabular flex-shrink-0',
        rank === null
          ? 'text-muted-foreground/30 text-sm font-semibold'
          : podium
            ? podium.rankText
            : 'text-muted-foreground text-sm font-bold',
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
          <span className="ml-1.5 text-xs font-normal text-primary/55">(you)</span>
        )}
      </span>

      {/* Points */}
      <div className="flex items-baseline gap-1 flex-shrink-0">
        <span className={cn(
          'text-[17px] font-black tabular',
          points === null
            ? 'text-muted-foreground/30'
            : podium ? podium.pts : isCurrentUser ? 'text-primary' : 'text-foreground',
        )}>
          {points === null ? '—' : points.toLocaleString()}
        </span>
        {points !== null && (
          <span className="text-[11px] font-semibold text-muted-foreground/60">pts</span>
        )}
      </div>
    </div>
  )
}
