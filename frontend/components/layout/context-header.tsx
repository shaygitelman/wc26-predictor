import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ContextHeaderProps {
  title: string
  back?: string
  actions?: React.ReactNode
  transparent?: boolean
  className?: string
}

export function ContextHeader({
  title,
  back,
  actions,
  transparent = false,
  className,
}: ContextHeaderProps) {
  return (
    <header
      className={cn(
        'relative sticky top-0 z-40 flex items-center h-14 px-4 gap-3',
        !transparent && 'bg-surface/90 backdrop-blur-md border-b border-border/80',
        className,
      )}
    >
      {back && (
        <Link
          href={back}
          className={cn(
            'flex items-center justify-center size-9 -ml-2 rounded-full',
            'text-muted-foreground hover:text-foreground hover:bg-accent',
            'transition-colors duration-150',
          )}
        >
          <ArrowLeft className="size-5" />
        </Link>
      )}

      <h1 className="flex-1 font-bold text-[17px] text-foreground tracking-tight truncate">
        {title}
      </h1>

      {actions && (
        <div className="flex items-center gap-2">{actions}</div>
      )}

      {/* WC tournament accent */}
      {!transparent && (
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent pointer-events-none" />
      )}
    </header>
  )
}
