'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

export interface FilterOption {
  value: string
  label: string
}

interface FilterBarProps {
  options: FilterOption[]
  defaultValue?: string
  onChange?: (value: string) => void
  className?: string
}

export function FilterBar({
  options,
  defaultValue,
  onChange,
  className,
}: FilterBarProps) {
  const [active, setActive] = useState(defaultValue ?? options[0]?.value ?? '')

  const select = (value: string) => {
    setActive(value)
    onChange?.(value)
  }

  return (
    <div className={cn(
      'flex items-center gap-2 overflow-x-auto scrollbar-none py-3 px-4',
      className,
    )}>
      {options.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => select(value)}
          className={cn(
            'flex-shrink-0 px-3.5 py-1.5 rounded-full',
            'text-xs font-semibold whitespace-nowrap',
            'transition-all duration-150',
            active === value
              ? 'bg-primary text-primary-foreground'
              : 'bg-surface-elevated text-muted-foreground hover:text-foreground hover:bg-surface-overlay',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
