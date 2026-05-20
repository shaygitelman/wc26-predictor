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
    <div className={cn('bg-card rounded-xl border border-border p-4', className)}>
      {/* User identity row */}
      <div className="flex items-center gap-3 mb-4">
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
      <div className="grid grid-cols-3 gap-2">
        <StatBox label="Global Rank" value={`#${stats.globalRank.toLocaleString()}`} accent />
        <StatBox label="Points"      value={stats.totalPoints.toLocaleString()} />
        <StatBox label="Predicted"   value={`${stats.totalPredictions}/104`} />
      </div>
    </div>
  )
}

function StatBox({
  label,
  value,
  accent = false,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-1 bg-surface-elevated rounded-lg py-3 px-1">
      <span className={cn(
        'text-xl font-extrabold tabular leading-none',
        accent ? 'text-primary' : 'text-foreground',
      )}>
        {value}
      </span>
      <span className="text-2xs text-muted-foreground font-medium text-center leading-tight">
        {label}
      </span>
    </div>
  )
}
