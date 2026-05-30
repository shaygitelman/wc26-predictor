import { ContextHeader } from '@/components/layout/context-header'

export default function LeaderboardLoading() {
  return (
    <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
      <ContextHeader title="Rankings" />

      <div className="flex flex-col">

        {/* Podium */}
        <div className="flex items-end justify-center gap-3 px-8 pt-8 pb-6">
          {/* 2nd */}
          <div className="flex flex-col items-center gap-2">
            <div className="size-14 rounded-full bg-card border border-border animate-pulse" />
            <div className="h-3 w-12 bg-surface-elevated rounded animate-pulse" />
            <div className="w-20 h-16 bg-card border border-border rounded-t-xl animate-pulse" />
          </div>
          {/* 1st */}
          <div className="flex flex-col items-center gap-2">
            <div className="size-16 rounded-full bg-card border border-border animate-pulse" />
            <div className="h-3 w-16 bg-surface-elevated rounded animate-pulse" />
            <div className="w-24 h-24 bg-card border border-border rounded-t-xl animate-pulse" />
          </div>
          {/* 3rd */}
          <div className="flex flex-col items-center gap-2">
            <div className="size-12 rounded-full bg-card border border-border animate-pulse" />
            <div className="h-3 w-10 bg-surface-elevated rounded animate-pulse" />
            <div className="w-20 h-12 bg-card border border-border rounded-t-xl animate-pulse" />
          </div>
        </div>

        {/* Rank rows */}
        <div className="px-4 flex flex-col gap-1 pt-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border animate-pulse"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="w-6 h-4 bg-surface-elevated rounded flex-shrink-0" />
              <div className="size-8 rounded-full bg-surface-elevated flex-shrink-0" />
              <div className="h-4 w-28 bg-surface-elevated rounded" />
              <div className="ml-auto h-4 w-12 bg-surface-elevated rounded" />
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
