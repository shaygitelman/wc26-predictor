'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Calendar, Trophy, Medal, User } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/',            label: 'Home',     Icon: Home     },
  { href: '/matches',     label: 'Matches',  Icon: Calendar },
  { href: '/leagues',     label: 'Leagues',  Icon: Trophy   },
  { href: '/leaderboard', label: 'Rankings', Icon: Medal    },
  { href: '/profile',     label: 'Profile',  Icon: User     },
] as const

export function BottomTabBar() {
  const pathname = usePathname()

  return (
    <nav
      className={cn(
        'relative fixed bottom-0 left-0 right-0 z-50',
        'bg-surface/97 backdrop-blur-xl border-t border-border',
        'pb-safe',
      )}
    >
      {/* Gold accent line at top */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent pointer-events-none" />
      {/* Gradient fade — blends nav into page content */}
      <div className="absolute -top-10 left-0 right-0 h-10 bg-gradient-to-b from-transparent to-surface/90 pointer-events-none" />

      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-1">
        {TABS.map(({ href, label, Icon }) => {
          const isActive = href === '/'
            ? pathname === '/'
            : pathname.startsWith(href)

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1 flex-1 h-full',
                'rounded-xl transition-all duration-200',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {/* Active indicator — wider pill with stronger glow */}
              {isActive && (
                <span className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-[3px] rounded-full bg-primary shadow-[0_0_16px_rgba(136,117,255,0.85)]" />
              )}
              <Icon
                className={cn(
                  'size-[22px] transition-all duration-200',
                  isActive && 'scale-[1.15]',
                )}
                strokeWidth={isActive ? 2.5 : 1.75}
              />
              <span className={cn(
                'text-2xs tracking-wide transition-all duration-200',
                isActive ? 'font-black text-primary' : 'font-medium text-muted-foreground',
              )}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
