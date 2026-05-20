'use client'

import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch — render only after mount
  useEffect(() => setMounted(true), [])
  if (!mounted) return <div className={cn('size-9', className)} />

  const isDark = theme === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cn(
        'flex items-center justify-center size-9 rounded-full',
        'text-muted-foreground hover:text-foreground hover:bg-accent',
        'transition-colors duration-150',
        className,
      )}
      aria-label="Toggle theme"
    >
      {isDark
        ? <Sun  className="size-5" strokeWidth={1.75} />
        : <Moon className="size-5" strokeWidth={1.75} />
      }
    </button>
  )
}
