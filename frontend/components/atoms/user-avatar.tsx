import Image from 'next/image'
import { cn, getInitials, getAvatarColor } from '@/lib/utils'
import { getAvatarById } from '@/lib/avatars'

interface UserAvatarProps {
  username: string
  avatarUrl?: string
  avatarId?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const SIZE = {
  xs: { px: 24,  text: 'text-2xs',  emoji: 12 },
  sm: { px: 32,  text: 'text-xs',   emoji: 16 },
  md: { px: 40,  text: 'text-sm',   emoji: 20 },
  lg: { px: 56,  text: 'text-base', emoji: 26 },
  xl: { px: 80,  text: 'text-xl',   emoji: 36 },
}

export function UserAvatar({ username, avatarUrl, avatarId, size = 'md', className }: UserAvatarProps) {
  const { px, text, emoji: emojipx } = SIZE[size]

  // Priority 1: curated avatar
  if (avatarId) {
    const av = getAvatarById(avatarId)
    if (av) {
      return (
        <span
          className={cn('rounded-full flex items-center justify-center flex-shrink-0', className)}
          style={{ width: px, height: px, background: av.gradient }}
        >
          <span style={{ fontSize: emojipx, lineHeight: 1 }}>{av.emoji}</span>
        </span>
      )
    }
  }

  // Priority 2: external avatar URL
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={username}
        width={px}
        height={px}
        className={cn('rounded-full object-cover flex-shrink-0', className)}
        style={{ width: px, height: px }}
      />
    )
  }

  // Priority 3: initials with deterministic color
  return (
    <span
      className={cn(
        'rounded-full flex items-center justify-center flex-shrink-0',
        'font-bold text-white',
        getAvatarColor(username),
        text,
        className,
      )}
      style={{ width: px, height: px }}
    >
      {getInitials(username)}
    </span>
  )
}
