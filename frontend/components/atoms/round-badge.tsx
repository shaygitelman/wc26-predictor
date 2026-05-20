import { cn } from '@/lib/utils'
import { ROUND_LABELS, type Round } from '@/types/match'

interface RoundBadgeProps {
  round: Round
  group?: string
  className?: string
}

export function RoundBadge({ round, group, className }: RoundBadgeProps) {
  const label = round === 'group' && group
    ? `GROUP ${group}`
    : ROUND_LABELS[round].toUpperCase()

  return (
    <span className={cn(
      'text-2xs font-bold tracking-widest text-muted-foreground',
      className,
    )}>
      {label}
    </span>
  )
}
