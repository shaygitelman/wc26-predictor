import { ContextHeader } from '@/components/layout/context-header'

export default function GroupsLoading() {
  return (
    <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
      <ContextHeader title="Tournament" />
      {/* Tab bar */}
      <div className="flex border-b border-border bg-card">
        <div className="flex-1 h-12 animate-pulse" />
        <div className="flex-1 h-12 animate-pulse" />
      </div>
      {/* Group selector */}
      <div className="flex gap-1.5 px-4 py-3 border-b border-border bg-card">
        {[0,1,2,3,4,5,6,7,8,9,10,11].map(i => (
          <div key={i} className="size-9 rounded-lg bg-surface-elevated animate-pulse flex-shrink-0" />
        ))}
      </div>
      {/* Standings table */}
      <div className="p-4">
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="h-9 bg-surface-elevated border-b border-border animate-pulse" />
          {[0,1,2,3].map(i => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 border-b border-border last:border-0">
              <div className="w-6 h-4 rounded bg-surface-elevated animate-pulse" />
              <div className="flex items-center gap-2 flex-1">
                <div className="w-5 h-3.5 rounded-sm bg-surface-elevated animate-pulse" />
                <div className="h-4 w-28 rounded bg-surface-elevated animate-pulse" />
              </div>
              <div className="flex gap-1">
                {[0,1,2,3,4,5].map(j => (
                  <div key={j} className="w-7 h-4 rounded bg-surface-elevated animate-pulse" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
