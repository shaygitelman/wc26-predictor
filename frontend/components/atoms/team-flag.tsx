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
  sm:  { w: 24,  h: 16,  text: 'text-2xs', res: 80  },
  md:  { w: 32,  h: 22,  text: 'text-xs',  res: 80  },
  lg:  { w: 44,  h: 30,  text: 'text-sm',  res: 160 },
  xl:  { w: 64,  h: 43,  text: 'text-base',res: 160 },
  '2xl': { w: 84, h: 56, text: 'text-lg',  res: 320 },
}

// Upgrade flagcdn.com URLs to the right resolution for crisp retina rendering.
// flagcdn.com supports /w80/, /w160/, /w320/ — we pick based on display size.
function hqFlag(url: string | null | undefined, res: number): string | null {
  if (!url) return null
  return url.includes('flagcdn.com') ? url.replace(/\/w\d+\//, `/w${res}/`) : url
}

export function TeamFlag({ team, size = 'md', showCode = false, className }: TeamFlagProps) {
  const { w, h, text, res } = SIZE[size]
  const src = hqFlag(team.flagUrl, res)

  return (
    <span className={cn('flex flex-col items-center gap-1', className)}>
      {src ? (
        <Image
          src={src}
          alt={team.name}
          width={w}
          height={h}
          sizes={`${w}px`}
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
