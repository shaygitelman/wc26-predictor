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

  const isKnockout = round !== 'group'

  return (
    <span className={cn(
      'text-2xs font-black tracking-[0.14em]',
      isKnockout
        ? 'text-gold/90'
        : 'text-muted-foreground/75',
      className,
    )}>
      {label}
    </span>
  )
}
