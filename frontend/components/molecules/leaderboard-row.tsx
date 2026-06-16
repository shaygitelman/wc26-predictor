import { cn } from '@/lib/utils'
import { UserAvatar } from '@/components/atoms/user-avatar'

interface LeaderboardRowProps {
  rank:          number | null
  username:      string
  avatarUrl?:    string
  avatarId?:     string
  points:        number | null
  isCurrentUser?: boolean
  className?:    string
  // Optional tournament picks — rendered as a secondary line under the username
  winnerName?:     string | null
  winnerFlagUrl?:  string | null
  scorerName?:     string | null
  scorerPhotoUrl?: string | null
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
  winnerName,
  winnerFlagUrl,
  scorerName,
  scorerPhotoUrl,
}: LeaderboardRowProps) {
  const podium        = rank !== null ? PODIUM[rank] : undefined
  const hasTournament = !!(winnerName || scorerName)

  return (
    <div className={cn(
      'flex items-center gap-3 px-4 rounded-2xl border transition-colors',
      hasTournament ? 'py-2.5' : 'py-3.5',
      isCurrentUser
        ? 'bg-gold-muted border-gold-border shadow-gold'
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

      {/* Username + optional tournament secondary line */}
      <div className="flex-1 min-w-0">
        <span className={cn(
          'font-semibold text-[15px] truncate block',
          isCurrentUser ? 'text-foreground' : 'text-foreground',
        )}>
          {username}
          {isCurrentUser && (
            <span className="ml-1.5 text-xs font-normal text-primary/55">(you)</span>
          )}
        </span>

        {hasTournament && (
          <div className="flex items-center gap-1 mt-[3px] min-w-0">
            {/* Winner: flag + country name */}
            {winnerFlagUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={winnerFlagUrl}
                alt={winnerName ?? ''}
                className="w-3.5 h-[9px] rounded-[2px] object-cover flex-shrink-0"
              />
            )}
            <span className="text-[11px] text-muted-foreground/70 leading-none flex-shrink-0">
              {winnerName ?? '—'}
            </span>

            {/* Separator */}
            {scorerName && (
              <span className="text-[11px] text-muted-foreground/40 leading-none flex-shrink-0"> · </span>
            )}

            {/* Scorer: photo or initials fallback */}
            {scorerName && (
              scorerPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={scorerPhotoUrl}
                  alt={scorerName}
                  className="size-4 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <span className="size-4 rounded-full bg-surface-elevated border border-border/60 flex items-center justify-center text-[8px] font-bold text-muted-foreground flex-shrink-0">
                  {scorerName.split(' ').pop()?.[0]?.toUpperCase() ?? '?'}
                </span>
              )
            )}

            {/* Scorer name — truncates to fill remaining space */}
            {scorerName && (
              <span className="text-[11px] text-muted-foreground/70 leading-none truncate min-w-0">
                {scorerName}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Points */}
      <div className="flex items-baseline gap-1 flex-shrink-0">
        <span className={cn(
          'text-[17px] font-black tabular',
          points === null
            ? 'text-muted-foreground/30'
            : podium ? podium.pts : isCurrentUser ? 'text-gold' : 'text-foreground',
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
