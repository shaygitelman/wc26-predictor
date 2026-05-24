import { ContextHeader } from '@/components/layout/context-header'

export default function LeaguesLoading() {
  return (
    <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
      <ContextHeader title="Leagues" />
      <div className="flex flex-col gap-5 p-4">
        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-3">
          <div className="h-[50px] bg-card rounded-2xl border border-border animate-pulse" />
          <div className="h-[50px] bg-card rounded-2xl border border-border animate-pulse" />
        </div>
        {/* League cards */}
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-[64px] bg-card rounded-2xl border border-border animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  )
}
