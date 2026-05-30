import { ContextHeader } from '@/components/layout/context-header'

export default function TournamentLoading() {
  return (
    <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
      <ContextHeader title="Tournament Picks" back="/profile" />

      <div className="flex flex-col gap-6 p-4">

        {/* Points callout */}
        <div className="flex gap-3">
          <div className="flex-1 h-[68px] bg-card rounded-xl border border-border animate-pulse" />
          <div className="flex-1 h-[68px] bg-card rounded-xl border border-border animate-pulse" />
        </div>

        {/* Winner section label */}
        <div>
          <div className="h-2.5 w-36 bg-surface-elevated rounded animate-pulse mb-3" />
          {/* 48-team grid */}
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 48 }).map((_, i) => (
              <div
                key={i}
                className="h-[72px] bg-card rounded-xl border border-border animate-pulse"
                style={{ animationDelay: `${(i % 12) * 30}ms` }}
              />
            ))}
          </div>
        </div>

        {/* Scorer section label */}
        <div className="flex flex-col gap-4">
          <div className="h-2.5 w-32 bg-surface-elevated rounded animate-pulse" />
          {/* Favorites strip */}
          <div className="flex gap-2 overflow-hidden -mx-4 px-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="size-[80px] flex-shrink-0 bg-card rounded-xl border border-border animate-pulse"
                style={{ animationDelay: `${i * 50}ms` }}
              />
            ))}
          </div>
          {/* Search bar */}
          <div className="h-11 bg-surface-elevated rounded-xl border border-border animate-pulse" />
        </div>

        {/* Save button */}
        <div className="h-[52px] bg-surface-elevated rounded-xl animate-pulse" />

      </div>
    </div>
  )
}
