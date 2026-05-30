import { ContextHeader } from '@/components/layout/context-header'
import { ThemeToggle } from '@/components/atoms/theme-toggle'

export default function ProfileLoading() {
  return (
    <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
      <ContextHeader title="Profile" actions={<ThemeToggle />} />
      <div className="flex flex-col gap-5 p-4">
        {/* Avatar + name */}
        <div className="flex flex-col items-center gap-3 pt-2 pb-1">
          <div className="size-20 rounded-full bg-card border border-border animate-pulse" />
          <div className="h-6 w-36 rounded bg-surface-elevated animate-pulse" />
          <div className="h-4 w-48 rounded bg-surface-elevated animate-pulse" />
        </div>
        {/* Stats grid — must match grid-cols-5 in profile/page.tsx */}
        <div className="grid grid-cols-5 gap-2">
          {[0,1,2,3,4].map(i => (
            <div key={i} className="h-[68px] bg-card rounded-xl border border-border animate-pulse" />
          ))}
        </div>
        {/* Settings rows */}
        <div className="bg-card rounded-2xl border border-border divide-y divide-border">
          {[0,1,2].map(i => (
            <div key={i} className="h-[52px] animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  )
}
