import { ContextHeader } from '@/components/layout/context-header'

export default function MatchDetailLoading() {
  return (
    <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
      <ContextHeader title="Match" back="/matches" />

      {/* ── Hero skeleton ─────────────────────────────────── */}
      <div className="relative bg-background overflow-hidden">
        <div className="h-[3px] bg-gradient-to-r from-transparent via-gold/30 to-transparent" />

        {/* Round badge + status chip */}
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <div className="h-6 w-24 rounded-full bg-card border border-border animate-pulse" />
          <div className="h-6 w-16 rounded-full bg-card border border-border animate-pulse" />
        </div>

        {/* Teams + time */}
        <div className="px-5 pb-7 flex items-center gap-2">
          {/* Home */}
          <div className="flex flex-col items-center gap-3 flex-1">
            <div className="size-16 rounded-full bg-card border border-border animate-pulse" />
            <div className="h-4 w-20 rounded-full bg-surface-elevated animate-pulse" />
          </div>

          {/* Score / time */}
          <div className="flex flex-col items-center gap-2 flex-shrink-0">
            <div className="h-16 w-28 rounded-xl bg-card border border-border animate-pulse" />
            <div className="h-3.5 w-16 rounded-full bg-surface-elevated animate-pulse" />
          </div>

          {/* Away */}
          <div className="flex flex-col items-center gap-3 flex-1">
            <div className="size-16 rounded-full bg-card border border-border animate-pulse" />
            <div className="h-4 w-20 rounded-full bg-surface-elevated animate-pulse" />
          </div>
        </div>

        {/* Venue + date */}
        <div className="flex items-center justify-center gap-5 pb-5">
          <div className="h-3.5 w-32 rounded-full bg-surface-elevated animate-pulse" />
          <div className="h-3.5 w-24 rounded-full bg-surface-elevated animate-pulse" />
        </div>

        {/* Prediction strip placeholder */}
        <div className="border-t border-border/20 px-5 py-4">
          <div className="h-[60px] rounded-2xl bg-card border border-border animate-pulse" />
        </div>

        <div className="h-7 fade-to-background-b pointer-events-none" />
      </div>

      {/* ── Cards skeleton ────────────────────────────────── */}
      <div className="flex flex-col gap-5 px-4 pt-1 pb-8">
        {/* Group standings */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden animate-pulse">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
            <div className="h-3.5 w-28 rounded-full bg-surface-elevated" />
          </div>
          <div className="px-3 py-1.5 border-b border-border/40 bg-surface-elevated/60">
            <div className="h-2.5 w-40 rounded-full bg-surface-elevated" />
          </div>
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-3 px-3 py-3 border-b border-border/40 last:border-0">
              <div className="w-5 h-2.5 rounded-full bg-surface-elevated" />
              <div className="w-5 h-3.5 rounded-sm bg-surface-elevated" />
              <div className="h-3 w-20 rounded-full bg-surface-elevated" />
              <div className="ml-auto h-2.5 w-32 rounded-full bg-surface-elevated" />
            </div>
          ))}
        </div>

        {/* Insights card */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden animate-pulse">
          <div className="h-[3px] w-full bg-surface-elevated" />
          <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
            <div className="h-4 w-36 rounded-full bg-surface-elevated" />
            <div className="h-5 w-20 rounded-full bg-surface-elevated" />
          </div>
          <div className="p-4 flex flex-col gap-3">
            <div className="h-3 w-full rounded-full bg-surface-elevated" />
            <div className="h-3 w-4/5 rounded-full bg-surface-elevated" />
            <div className="h-3 w-3/5 rounded-full bg-surface-elevated" />
          </div>
          <div className="px-4 pb-4 flex flex-col gap-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-surface-elevated/40 border border-border/30">
                <div className="size-8 rounded-lg bg-surface-elevated flex-shrink-0" />
                <div className="flex-1 flex flex-col gap-2">
                  <div className="h-3 w-3/4 rounded-full bg-surface-elevated" />
                  <div className="h-2.5 w-full rounded-full bg-surface-elevated" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Facts card */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden animate-pulse">
          <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
            <div className="h-4 w-32 rounded-full bg-surface-elevated" />
            <div className="h-5 w-16 rounded-full bg-surface-elevated" />
          </div>
          <div className="p-4 flex flex-col gap-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                <div className="h-3 w-24 rounded-full bg-surface-elevated" />
                <div className="flex gap-2">
                  <div className="h-3 w-8 rounded-full bg-surface-elevated" />
                  <div className="h-3 w-8 rounded-full bg-surface-elevated" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* League picks card */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden animate-pulse">
          <div className="px-4 py-3 border-b border-border/50 flex items-center gap-2">
            <div className="h-4 w-32 rounded-full bg-surface-elevated" />
          </div>
          <div className="flex gap-2 px-3 py-2.5 border-b border-border/40">
            {[0, 1].map(i => (
              <div key={i} className="h-7 w-24 rounded-full bg-surface-elevated" />
            ))}
          </div>
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border/40 last:border-0">
              <div className="size-8 rounded-full bg-surface-elevated" />
              <div className="h-3.5 w-28 rounded-full bg-surface-elevated" />
              <div className="ml-auto h-5 w-12 rounded-full bg-surface-elevated" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
