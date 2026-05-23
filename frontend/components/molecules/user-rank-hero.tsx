import { TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { UserAvatar } from '@/components/atoms/user-avatar'
import type { User, UserStats } from '@/types/user'

interface UserRankHeroProps {
  user: User
  stats: UserStats
  className?: string
}

export function UserRankHero({ user, stats, className }: UserRankHeroProps) {
  const hasRankChange = stats.rankChange && stats.rankChange !== 0

  return (
    <div className={cn(
      'relative bg-card rounded-2xl border border-border p-4 overflow-hidden shadow-card',
      className,
    )}>
      {/* Subtle atmospheric glow */}
      <div className="absolute inset-0 bg-championship-atmosphere pointer-events-none" />

      {/* User identity row */}
      <div className="relative flex items-center gap-3 mb-4">
        <UserAvatar username={user.username} avatarId={user.avatarId} avatarUrl={user.avatarUrl} size="md" />
        <div>
          <p className="font-bold text-[15px] text-foreground">{user.username}</p>
          {hasRankChange && (
            <div className={cn(
              'flex items-center gap-1 text-xs font-semibold',
              stats.rankChange! > 0 ? 'text-status-won' : 'text-status-lost',
            )}>
              <TrendingUp className="size-3" />
              <span>
                {stats.rankChange! > 0 ? '+' : ''}{stats.rankChange} places today
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="relative grid grid-cols-3 gap-2">
        <StatBox label="Points"    value={stats.totalPoints.toLocaleString()} variant="primary" />
        <StatBox label="Exact"     value={stats.exactScores.toLocaleString()} />
        <StatBox label="Predicted" value={`${stats.totalPredictions}/104`} />
      </div>
    </div>
  )
}

function StatBox({
  label,
  value,
  variant,
}: {
  label:    string
  value:    string
  variant?: 'gold' | 'primary'
}) {
  return (
    <div className="flex flex-col items-center gap-1 bg-surface-elevated rounded-xl py-3.5 px-1 border border-border/50">
      <span className={cn(
        'text-xl font-black tabular leading-none',
        variant === 'gold'    ? 'text-gold-gradient'  :
        variant === 'primary' ? 'text-primary'        :
        'text-foreground',
      )}>
        {value}
      </span>
      <span className="text-2xs text-muted-foreground/80 font-medium text-center leading-tight">
        {label}
      </span>
    </div>
  )
}
