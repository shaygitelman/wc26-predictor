import { ContextHeader } from '@/components/layout/context-header'

export default function MatchesLoading() {
  return (
    <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
      <ContextHeader title="Schedule" />
      {/* Filter bar */}
      <div className="px-4 py-3 border-b border-border/60">
        <div className="h-10 bg-surface-elevated rounded-xl animate-pulse" />
      </div>
      <div className="flex flex-col gap-6 p-4">
        {[0, 1].map(group => (
          <div key={group} className="flex flex-col gap-3">
            <div className="h-3 w-24 bg-surface-elevated rounded animate-pulse" />
            {[0, 1, 2].map(i => (
              <div key={i} className="h-[96px] bg-card rounded-2xl border border-border animate-pulse" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
