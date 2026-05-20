import { cn } from '@/lib/utils'

interface LiveDotProps {
  size?: 'sm' | 'md'
  className?: string
}

export function LiveDot({ size = 'md', className }: LiveDotProps) {
  const dim   = size === 'md' ? 'size-3'          : 'size-2'
  const outer = size === 'md' ? 'size-3'          : 'size-2'
  const inner = size === 'md' ? 'size-[9px]'      : 'size-[5px]'
  const glow  = size === 'md' ? 'size-5 opacity-30' : null

  return (
    <span className={cn('relative flex items-center justify-center flex-shrink-0', dim, className)}>
      {/* Outer glow halo — md only */}
      {glow && (
        <span className={cn(
          'absolute rounded-full bg-status-live animate-glow-breathe pointer-events-none',
          glow,
        )} />
      )}
      {/* Pulse ring */}
      <span className={cn('absolute rounded-full bg-status-live animate-live-pulse opacity-50', outer)} />
      {/* Solid core */}
      <span className={cn('relative rounded-full bg-status-live flex-shrink-0', inner)} />
    </span>
  )
}
