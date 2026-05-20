import { cn } from '@/lib/utils'
import type { PredictionOutcome } from '@/types/prediction'

interface PointsBadgeProps {
  points: number
  outcome?: PredictionOutcome
  className?: string
}

const CONFIG: Record<PredictionOutcome, { color: string; bg: string; ring: string; prefix: string }> = {
  exact:      { color: 'text-gold',            bg: 'bg-gold-muted',       ring: 'ring-1 ring-gold-border', prefix: '+' },
  difference: { color: 'text-status-partial',  bg: 'bg-status-partial-bg', ring: '',                        prefix: '+' },
  outcome:    { color: 'text-status-partial',  bg: 'bg-status-partial-bg', ring: '',                        prefix: '+' },
  wrong:      { color: 'text-status-lost',     bg: 'bg-status-lost-bg',    ring: '',                        prefix: ''  },
  pending:    { color: 'text-muted-foreground', bg: 'bg-surface-elevated', ring: '',                        prefix: '+' },
}

export function PointsBadge({ points, outcome = 'pending', className }: PointsBadgeProps) {
  const { color, bg, ring, prefix } = CONFIG[outcome]

  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full',
      'text-xs font-bold tabular',
      color, bg, ring,
      className,
    )}>
      {prefix}{points} pts
    </span>
  )
}
