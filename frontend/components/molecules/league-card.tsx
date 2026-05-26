import Link from 'next/link'
import { ChevronRight, Globe } from 'lucide-react'
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

  const isDefault = league.isDefault

  return (
    <Link
      href={`/leagues/${league.id}`}
      className={cn(
        'flex items-center gap-3 rounded-2xl border px-4 py-3.5',
        'hover:border-primary/40 hover:shadow-primary-glow hover:scale-[1.005] active:scale-[0.985] transition-all duration-200',
        isDefault
          ? 'bg-primary/[0.06] border-primary/25 shadow-none'
          : 'bg-card border-border shadow-card',
        className,
      )}
    >
      <div className={cn(
        'size-10 rounded-xl flex items-center justify-center flex-shrink-0',
        isDefault ? 'bg-primary/15' : 'bg-primary-muted',
      )}>
        {isDefault
          ? <Globe className="size-5 text-primary" strokeWidth={1.75} />
          : <span className="text-sm font-black text-primary">{league.name.slice(0, 2).toUpperCase()}</span>
        }
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="font-semibold text-sm text-foreground truncate">{league.name}</p>
          {isDefault && (
            <span className="flex-shrink-0 text-[9px] font-black tracking-[0.08em] uppercase
              px-1.5 py-0.5 rounded-full bg-primary/15 text-primary leading-none">
              Official
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
      </div>

      {userPoints != null && (
        <div className="text-right flex-shrink-0">
          <p className="text-[18px] font-black tabular text-primary leading-none">{userPoints}</p>
          <p className="text-2xs text-muted-foreground mt-0.5">pts</p>
        </div>
      )}

      <ChevronRight className="size-4 text-muted-foreground flex-shrink-0" />
    </Link>
  )
}
