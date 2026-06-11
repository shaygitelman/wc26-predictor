import { cn } from '@/lib/utils'
import { LiveDot } from './live-dot'
import type { MatchStatus } from '@/types/match'

interface StatusChipProps {
  status:    MatchStatus
  minute?:   number | null
  className?: string
}

const LIVE_CLASSES  = 'text-status-live bg-status-live-bg ring-1 ring-status-live/35 shadow-[0_0_14px_rgba(0,212,106,0.28)]'
const MUTED_CLASSES = 'text-muted-foreground/70 bg-surface-elevated'

export function StatusChip({ status, minute, className }: StatusChipProps) {
  // halftime = live match where the API reports no elapsed minute (break between halves)
  const isHalftime = status === 'live' && (minute === null || minute === undefined)

  const label =
    status === 'scheduled' ? 'UPCOMING'
    : isHalftime           ? 'HT'
    : status === 'live'    ? `${minute}'`
    : /* finished */         'FT'

  const classes =
    status === 'live' ? LIVE_CLASSES : MUTED_CLASSES

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full',
      'text-2xs font-black tracking-widest',
      classes,
      className,
    )}>
      {status === 'live' && !isHalftime && <LiveDot size="sm" />}
      {label}
    </span>
  )
}
