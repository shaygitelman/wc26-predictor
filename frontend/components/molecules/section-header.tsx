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
  live:    { bar: 'bg-status-live', title: 'text-status-live' },
  primary: { bar: 'bg-primary',     title: 'text-primary'     },
  gold:    { bar: 'bg-gold',        title: 'text-gold'        },
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
      <div className="flex items-center gap-2.5">
        {a && (
          <span className={cn('w-[3px] h-3.5 rounded-full flex-shrink-0', a.bar)} />
        )}
        <h2 className={cn(
          'text-[11px] font-black tracking-[0.14em] uppercase',
          a ? a.title : 'text-muted-foreground/90',
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
