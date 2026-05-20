import Link from 'next/link'
import { Users, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { League } from '@/types/league'

interface LeagueCardProps {
  league: League
  userRank?: number
  userPoints?: number
  leaderUsername?: string
  leaderPoints?: number
  className?: string
}

export function LeagueCard({
  league,
  userRank,
  userPoints,
  leaderUsername,
  leaderPoints,
  className,
}: LeagueCardProps) {
  return (
    <Link
      href={`/leagues/${league.id}`}
      className={cn(
        'block bg-card rounded-xl border border-border p-4',
        'hover:border-primary/30 active:scale-[0.985]',
        'transition-all duration-150',
        className,
      )}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="size-9 rounded-lg bg-primary-muted flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-black text-primary">
              {league.name.slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="font-bold text-[15px] text-foreground truncate">
              {league.name}
            </p>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Users className="size-3" />
              <span className="text-2xs font-medium">{league.memberCount} members</span>
            </div>
          </div>
        </div>
        <ChevronRight className="size-4 text-muted-foreground flex-shrink-0 mt-0.5" />
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-2">
        {userRank && (
          <div className="flex items-center gap-1.5 bg-surface-elevated rounded-full px-2.5 py-1">
            <span className="text-2xs font-bold text-primary">#{userRank}</span>
            <span className="text-2xs text-muted-foreground">your rank</span>
          </div>
        )}
        {userPoints !== undefined && (
          <div className="flex items-center gap-1.5 bg-surface-elevated rounded-full px-2.5 py-1">
            <span className="text-2xs font-bold text-foreground tabular">{userPoints}</span>
            <span className="text-2xs text-muted-foreground">pts</span>
          </div>
        )}
        {leaderUsername && (
          <div className="flex items-center gap-1 bg-surface-elevated rounded-full px-2.5 py-1 ml-auto">
            <span className="text-2xs text-muted-foreground">Leader:</span>
            <span className="text-2xs font-bold text-foreground truncate max-w-[80px]">
              {leaderUsername}
            </span>
            {leaderPoints && (
              <span className="text-2xs font-bold text-primary tabular">{leaderPoints}</span>
            )}
          </div>
        )}
      </div>
    </Link>
  )
}
