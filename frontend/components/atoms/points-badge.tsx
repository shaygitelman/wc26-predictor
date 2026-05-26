import { cn } from '@/lib/utils'
import type { PredictionOutcome } from '@/types/prediction'

interface PointsBadgeProps {
  points: number
  outcome?: PredictionOutcome
  className?: string
}

const CONFIG: Record<PredictionOutcome, { color: string; bg: string; ring: string; prefix: string }> = {
  exact:      { color: 'text-gold font-black',           bg: 'bg-gold-muted',        ring: 'ring-1 ring-gold-border shadow-gold', prefix: '+' },
  difference: { color: 'text-status-partial font-bold',  bg: 'bg-status-partial-bg', ring: '',                                    prefix: '+' },
  outcome:    { color: 'text-status-partial font-bold',  bg: 'bg-status-partial-bg', ring: '',                                    prefix: '+' },
  wrong:      { color: 'text-status-lost font-bold',     bg: 'bg-status-lost-bg',    ring: '',                                    prefix: ''  },
  pending:    { color: 'text-muted-foreground font-semibold', bg: 'bg-surface-elevated', ring: '', prefix: '+' },
}

export function PointsBadge({ points, outcome = 'pending', className }: PointsBadgeProps) {
  const { color, bg, ring, prefix } = CONFIG[outcome]

  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-1 rounded-full',
      'text-xs tabular',
      outcome === 'exact' && 'animate-score-pop',
      color, bg, ring,
      className,
    )}>
      {prefix}{points} pts
    </span>
  )
}
