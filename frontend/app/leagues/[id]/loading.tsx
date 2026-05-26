import { ContextHeader } from '@/components/layout/context-header'

export default function LeagueDetailLoading() {
  return (
    <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
      <ContextHeader title="League" back="/leagues" />

      <div className="flex flex-col gap-4 p-4">

        {/* League info card */}
        <div className="rounded-2xl border border-border bg-card p-4 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-2">
              <div className="h-5 w-44 bg-muted rounded-lg" />
              <div className="h-4 w-24 bg-muted rounded-lg" />
            </div>
            <div className="flex flex-col gap-1.5 items-end">
              <div className="h-3 w-12 bg-muted rounded" />
              <div className="h-4 w-20 bg-muted rounded" />
              <div className="h-4 w-12 bg-muted rounded" />
            </div>
          </div>
        </div>

        {/* Invite / info card */}
        <div className="rounded-2xl border border-border bg-card p-4 animate-pulse flex flex-col gap-2">
          <div className="h-11 bg-muted rounded-xl" />
          <div className="h-10 bg-muted rounded-xl" />
        </div>

        {/* Standings header */}
        <div className="h-3 w-20 bg-muted rounded animate-pulse" />

        {/* Standings rows */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl bg-card border border-border px-4 py-3 animate-pulse"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-full bg-muted flex-shrink-0" />
              <div className="h-4 w-28 bg-muted rounded" />
              <div className="ml-auto h-4 w-14 bg-muted rounded" />
            </div>
          </div>
        ))}

      </div>
    </div>
  )
}
