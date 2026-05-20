import { cn } from '@/lib/utils'
import type { FormResult } from '@/types/insights'

interface FormBubbleProps {
  result: FormResult
  size?:  'sm' | 'md'
}

const CONFIG: Record<FormResult, string> = {
  W: 'bg-status-won     text-white',
  D: 'bg-status-partial text-white',
  L: 'bg-status-lost    text-white',
}

export function FormBubble({ result, size = 'md' }: FormBubbleProps) {
  return (
    <span className={cn(
      'flex items-center justify-center rounded-full font-black leading-none flex-shrink-0 tabular',
      CONFIG[result],
      size === 'sm' ? 'size-5 text-[9px]' : 'size-[22px] text-[10px]',
    )}>
      {result}
    </span>
  )
}
