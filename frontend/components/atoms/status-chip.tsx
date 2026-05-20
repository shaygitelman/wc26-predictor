import { cn } from '@/lib/utils'
import { LiveDot } from './live-dot'
import type { MatchStatus } from '@/types/match'

interface StatusChipProps {
  status: MatchStatus
  minute?: number
  className?: string
}

const CONFIG: Record<MatchStatus, { label: string; classes: string }> = {
  scheduled: {
    label:   'UPCOMING',
    classes: 'text-muted-foreground bg-surface-elevated',
  },
  live: {
    label:   'LIVE',
    classes: 'text-status-live bg-status-live-bg ring-1 ring-status-live/30 shadow-[0_0_10px_rgba(0,212,106,0.22)]',
  },
  finished: {
    label:   'FT',
    classes: 'text-muted-foreground bg-surface-elevated',
  },
}

export function StatusChip({ status, minute, className }: StatusChipProps) {
  const { label, classes } = CONFIG[status]

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full',
      'text-2xs font-bold tracking-widest',
      classes,
      className,
    )}>
      {status === 'live' && <LiveDot size="sm" />}
      {status === 'live' && minute ? `${minute}'` : label}
    </span>
  )
}
