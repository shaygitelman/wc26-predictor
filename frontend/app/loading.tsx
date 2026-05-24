import { ContextHeader } from '@/components/layout/context-header'
import { ThemeToggle } from '@/components/atoms/theme-toggle'

export default function HomeLoading() {
  return (
    <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
      <ContextHeader
        title="MatchPoint26"
        actions={<ThemeToggle />}
      />
      <div className="flex flex-col gap-6 p-4">
        {/* Profile strip */}
        <div className="h-[62px] bg-card rounded-2xl border border-border animate-pulse" />
        {/* Tournament picks */}
        <div className="h-[88px] bg-card rounded-xl border border-border animate-pulse" />
        {/* Match cards */}
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-[96px] bg-card rounded-2xl border border-border animate-pulse" />
          ))}
        </div>
        {/* League cards */}
        <div className="flex flex-col gap-2">
          {[0, 1].map(i => (
            <div key={i} className="h-[64px] bg-card rounded-2xl border border-border animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  )
}
