import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { League } from '@/types/league'

interface LeagueCardProps {
  league: League
  userPoints?: number
  leaderUsername?: string
  leaderPoints?: number
  className?: string
}

export function LeagueCard({
  league,
  userPoints,
  leaderUsername,
  leaderPoints,
  className,
}: LeagueCardProps) {
  const subtitle = leaderUsername
    ? `Leader: ${leaderUsername}${leaderPoints != null ? ` · ${leaderPoints} pts` : ''}`
    : `${league.memberCount} members`

  return (
    <Link
      href={`/leagues/${league.id}`}
      className={cn(
        'flex items-center gap-3 bg-card rounded-2xl border border-border px-4 py-3.5',
        'hover:border-primary/30 active:scale-[0.985] transition-all shadow-card',
        className,
      )}
    >
      <div className="size-10 rounded-xl bg-primary-muted flex items-center justify-center flex-shrink-0">
        <span className="text-sm font-black text-primary">
          {league.name.slice(0, 2).toUpperCase()}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-foreground truncate">{league.name}</p>
        <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
      </div>

      {userPoints != null && (
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-black tabular text-primary">{userPoints}</p>
          <p className="text-xs text-muted-foreground">pts</p>
        </div>
      )}

      <ChevronRight className="size-4 text-muted-foreground flex-shrink-0" />
    </Link>
  )
}
