import Image from 'next/image'
import { cn } from '@/lib/utils'
import type { Team } from '@/types/match'

interface TeamFlagProps {
  team: Team
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  showCode?: boolean
  className?: string
}

const SIZE = {
  sm:  { w: 24,  h: 16,  text: 'text-2xs'  },
  md:  { w: 32,  h: 22,  text: 'text-xs'   },
  lg:  { w: 44,  h: 30,  text: 'text-sm'   },
  xl:  { w: 64,  h: 43,  text: 'text-base' },
  '2xl': { w: 84, h: 56, text: 'text-lg'   },
}

export function TeamFlag({ team, size = 'md', showCode = false, className }: TeamFlagProps) {
  const { w, h, text } = SIZE[size]

  return (
    <span className={cn('flex flex-col items-center gap-1', className)}>
      {team.flagUrl ? (
        <Image
          src={team.flagUrl}
          alt={team.name}
          width={w}
          height={h}
          className="rounded-sm object-cover"
          style={{ width: w, height: h }}
        />
      ) : (
        <span
          className={cn(
            'rounded-sm bg-surface-elevated flex items-center justify-center',
            'font-bold text-muted-foreground',
            text,
          )}
          style={{ width: w, height: h }}
        >
          {team.shortCode}
        </span>
      )}

      {showCode && (
        <span className={cn(text, 'font-semibold text-foreground')}>
          {team.shortCode}
        </span>
      )}
    </span>
  )
}
