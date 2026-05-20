import Link from 'next/link'
import { cn } from '@/lib/utils'

interface SectionHeaderProps {
  title: string
  href?: string
  linkLabel?: string
  accent?: 'live' | 'primary' | 'gold'
  className?: string
}

const ACCENT_STYLES = {
  live:    { dot: 'bg-status-live', title: 'text-status-live' },
  primary: { dot: 'bg-primary',     title: 'text-primary'     },
  gold:    { dot: 'bg-gold',        title: 'text-gold'        },
}

export function SectionHeader({
  title,
  href,
  linkLabel = 'See all',
  accent,
  className,
}: SectionHeaderProps) {
  const a = accent ? ACCENT_STYLES[accent] : null

  return (
    <div className={cn('flex items-center justify-between mb-3', className)}>
      <div className="flex items-center gap-2">
        {a && <span className={cn('size-1.5 rounded-full flex-shrink-0', a.dot)} />}
        <h2 className={cn(
          'text-xs font-bold tracking-[0.1em] uppercase',
          a ? a.title : 'text-muted-foreground',
        )}>
          {title}
        </h2>
      </div>
      {href && (
        <Link
          href={href}
          className="text-2xs font-bold text-primary hover:text-primary/80 transition-colors tracking-wide"
        >
          {linkLabel} →
        </Link>
      )}
    </div>
  )
}
