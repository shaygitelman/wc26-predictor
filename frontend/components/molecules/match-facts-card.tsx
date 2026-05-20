'use client'

import { useState, useEffect } from 'react'
import { BarChart3, ChevronDown, ChevronUp, Flame, Trophy, AlertTriangle, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MatchFacts, StatRow, TeamSquadStatus, MatchContext, ContextType, PlayerStatus } from '@/types/match-facts'

// ─── Props ───────────────────────────────────────────────────

interface Props {
  matchId:  string
  homeTeam: { name: string; shortCode: string }
  awayTeam: { name: string; shortCode: string }
  round:    string
}

// ─── Context banner config ────────────────────────────────────

const CONTEXT_CFG: Record<ContextType, { icon: React.ElementType; cls: string }> = {
  rivalry:            { icon: Flame,       cls: 'text-violet-400 bg-violet-500/10 border-violet-500/20' },
  'must-win':         { icon: ShieldAlert, cls: 'text-red-400 bg-red-500/10 border-red-500/20' },
  'elimination-risk': { icon: ShieldAlert, cls: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  'group-decider':    { icon: Trophy,      cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  'knockout-pressure':{ icon: Trophy,      cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  'upset-alert':      { icon: AlertTriangle, cls: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  'high-stakes':      { icon: Trophy,      cls: 'text-primary bg-primary/10 border-primary/20' },
}

// ─── Status display ───────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; dot: string; chip: string }> = {
  injured:   { label: 'Injured',   dot: 'bg-red-500',   chip: 'bg-red-500/15 text-red-400' },
  suspended: { label: 'Suspended', dot: 'bg-amber-500', chip: 'bg-amber-500/15 text-amber-400' },
  doubtful:  { label: 'Doubtful',  dot: 'bg-yellow-400', chip: 'bg-yellow-400/15 text-yellow-500' },
}

// ─── Main component ──────────────────────────────────────────

export function MatchFactsCard({ matchId, homeTeam, awayTeam }: Props) {
  const [facts,      setFacts]     = useState<MatchFacts | null>(null)
  const [status,     setStatus]    = useState<'loading' | 'ready' | 'error'>('loading')
  const [squadOpen,  setSquadOpen] = useState(true)
  const [statsOpen,  setStatsOpen] = useState(true)

  useEffect(() => {
    const ctrl  = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 6000)

    fetch(`/api/matches/${matchId}/facts`, { signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: MatchFacts) => { setFacts(d); setStatus('ready') })
      .catch(() => setStatus('error'))
      .finally(() => clearTimeout(timer))

    return () => { ctrl.abort(); clearTimeout(timer) }
  }, [matchId])

  if (status === 'error') return null
  if (status === 'loading' || !facts) return <FactsSkeleton />
  if (facts.pendingData) return <FactsPendingCard homeTeam={homeTeam} awayTeam={awayTeam} />

  const allHomeAbsent: PlayerStatus[] = [
    ...facts.squad.home.injured,
    ...facts.squad.home.suspended,
    ...facts.squad.home.doubtful,
  ]
  const allAwayAbsent: PlayerStatus[] = [
    ...facts.squad.away.injured,
    ...facts.squad.away.suspended,
    ...facts.squad.away.doubtful,
  ]

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden animate-fade-in shadow-card">
      <div className="divide-y divide-border/50">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2">
            <BarChart3 className="size-[15px] text-muted-foreground flex-shrink-0" strokeWidth={1.75} />
            <span className="text-[13px] font-bold text-foreground tracking-[-0.01em]">Match Facts</span>
          </div>
          <span className="text-[10px] italic text-muted-foreground/60">Estimated data</span>
        </div>

        {/* ── Context banners ── */}
        {facts.context.length > 0 && (
          <div className="px-4 py-3 flex flex-col gap-2">
            {facts.context.map((ctx, i) => <ContextBanner key={i} ctx={ctx} />)}
          </div>
        )}

        {/* ── Squad News ── */}
        <section>
          <button
            type="button"
            onClick={() => setSquadOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <span className="text-[10px] font-bold tracking-[0.13em] uppercase text-muted-foreground">
              Squad News
            </span>
            {squadOpen
              ? <ChevronUp   className="size-3.5 text-muted-foreground/50" strokeWidth={2} />
              : <ChevronDown className="size-3.5 text-muted-foreground/50" strokeWidth={2} />
            }
          </button>

          {squadOpen && (
            <div className="px-4 pb-4 flex flex-col gap-4">
              <TeamSquadBlock
                code={homeTeam.shortCode}
                name={homeTeam.name}
                absent={allHomeAbsent}
              />
              <TeamSquadBlock
                code={awayTeam.shortCode}
                name={awayTeam.name}
                absent={allAwayAbsent}
              />
            </div>
          )}
        </section>

        {/* ── Team Statistics ── */}
        <section>
          <button
            type="button"
            onClick={() => setStatsOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <span className="text-[10px] font-bold tracking-[0.13em] uppercase text-muted-foreground">
              Team Statistics
            </span>
            {statsOpen
              ? <ChevronUp   className="size-3.5 text-muted-foreground/50" strokeWidth={2} />
              : <ChevronDown className="size-3.5 text-muted-foreground/50" strokeWidth={2} />
            }
          </button>

          {statsOpen && (
            <div className="px-4 pb-4">
              <StatsTable
                stats={facts.stats}
                homeCode={homeTeam.shortCode}
                awayCode={awayTeam.shortCode}
              />
            </div>
          )}
        </section>

      </div>
    </div>
  )
}

// ─── Context banner ───────────────────────────────────────────

function ContextBanner({ ctx }: { ctx: MatchContext }) {
  const { icon: Icon, cls } = CONTEXT_CFG[ctx.type]
  return (
    <div className={cn('flex items-start gap-2.5 rounded-xl border px-3 py-2.5', cls)}>
      <Icon className="size-3.5 flex-shrink-0 mt-[1px]" strokeWidth={2} />
      <div>
        <p className="text-[12px] font-bold leading-tight">{ctx.label}</p>
        {ctx.detail && (
          <p className="text-[11px] opacity-75 leading-snug mt-0.5">{ctx.detail}</p>
        )}
      </div>
    </div>
  )
}

// ─── Squad block ──────────────────────────────────────────────

function TeamSquadBlock({
  code,
  name,
  absent,
}: {
  code:   string
  name:   string
  absent: PlayerStatus[]
}) {
  return (
    <div>
      {/* Team header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] font-black uppercase tracking-wider text-foreground">{code}</span>
        <span className="text-[11px] text-muted-foreground/60">{name}</span>
      </div>

      {absent.length === 0 ? (
        <p className="text-[12px] text-muted-foreground/70 italic pl-1">Full squad available</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {absent.map((p, i) => {
            const cfg = STATUS_CFG[p.status]
            return (
              <div key={i} className="flex items-start gap-2 pl-1">
                <span className={cn('mt-[5px] size-[5px] rounded-full flex-shrink-0', cfg.dot)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[12px] font-semibold text-foreground">{p.name}</span>
                    <span className={cn('text-[10px] font-bold px-1.5 py-[2px] rounded', cfg.chip)}>
                      {cfg.label}
                    </span>
                  </div>
                  {p.detail && (
                    <p className="text-[11px] text-muted-foreground/60 leading-tight mt-0.5">{p.detail}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Stats table ──────────────────────────────────────────────

function StatsTable({
  stats,
  homeCode,
  awayCode,
}: {
  stats:    StatRow[]
  homeCode: string
  awayCode: string
}) {
  return (
    <div className="rounded-xl border border-border/50 overflow-hidden">
      {/* Column headers */}
      <div className="grid grid-cols-[1fr_64px_64px] bg-surface-elevated border-b border-border/50">
        <div className="px-3 py-2" />
        <div className="py-2 text-center text-[10px] font-black uppercase tracking-wider text-muted-foreground border-l border-border/50">
          {homeCode}
        </div>
        <div className="py-2 text-center text-[10px] font-black uppercase tracking-wider text-muted-foreground border-l border-border/50">
          {awayCode}
        </div>
      </div>

      {/* Stat rows */}
      {stats.map((row, i) => {
        const homeWins = row.higherIsBetter ? row.home >= row.away : row.home <= row.away
        const awayWins = row.higherIsBetter ? row.away >  row.home : row.away <  row.home
        const fmtVal = (v: number) =>
          (row.format === 'decimal' ? v.toFixed(1) : String(v)) + row.unit

        return (
          <div
            key={i}
            className={cn(
              'grid grid-cols-[1fr_64px_64px] border-b border-border/40 last:border-0',
            )}
          >
            <div className="px-3 py-2.5 text-[12px] text-muted-foreground">
              {row.label}
            </div>
            <div className={cn(
              'py-2.5 text-center text-[13px] font-bold tabular-nums border-l border-border/40',
              homeWins ? 'text-foreground' : 'text-muted-foreground/50',
            )}>
              {fmtVal(row.home)}
            </div>
            <div className={cn(
              'py-2.5 text-center text-[13px] font-bold tabular-nums border-l border-border/40',
              awayWins ? 'text-foreground' : 'text-muted-foreground/50',
            )}>
              {fmtVal(row.away)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Pending placeholder ──────────────────────────────────────

function FactsPendingCard({
  homeTeam, awayTeam,
}: { homeTeam: { name: string }; awayTeam: { name: string } }) {
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="divide-y divide-border/50">
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2">
            <BarChart3 className="size-[15px] text-muted-foreground/50 flex-shrink-0" strokeWidth={1.75} />
            <span className="text-[13px] font-bold text-muted-foreground tracking-[-0.01em]">Match Facts</span>
          </div>
          <span className="text-[10px] font-bold tracking-[0.06em] uppercase px-2 py-[3px] rounded-full border bg-muted/20 text-muted-foreground/60 border-border">
            Pending
          </span>
        </div>
        <div className="px-4 py-8 flex flex-col items-center gap-3">
          <div className="size-9 rounded-full bg-surface-elevated flex items-center justify-center">
            <BarChart3 className="size-4 text-muted-foreground/50" strokeWidth={1.75} />
          </div>
          <div className="text-center">
            <p className="text-[13px] font-semibold text-foreground/70 mb-1">Facts Pending</p>
            <p className="text-[12px] text-muted-foreground leading-relaxed max-w-[220px] mx-auto">
              Squad news and team statistics will be available once{' '}
              {homeTeam.name === 'TBD' && awayTeam.name === 'TBD'
                ? 'both teams have confirmed their places'
                : homeTeam.name === 'TBD'
                  ? `${awayTeam.name}'s opponent has been confirmed`
                  : awayTeam.name === 'TBD'
                    ? `${homeTeam.name}'s opponent has been confirmed`
                    : 'the teams have been confirmed'}.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────

function FactsSkeleton() {
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="divide-y divide-border/50 animate-pulse">
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2">
            <div className="size-[15px] rounded bg-surface-elevated" />
            <div className="h-3.5 w-24 rounded-full bg-surface-elevated" />
          </div>
          <div className="h-3 w-20 rounded-full bg-surface-elevated" />
        </div>
        <div className="px-4 py-3 space-y-2">
          <div className="h-10 rounded-xl bg-surface-elevated" />
        </div>
        <div className="px-4 py-3 space-y-3">
          <div className="h-2.5 w-20 rounded-full bg-surface-elevated" />
          <div className="space-y-1.5">
            <div className="h-3 w-28 rounded-full bg-surface-elevated" />
            <div className="h-3 w-40 rounded-full bg-surface-elevated" />
            <div className="h-3 w-32 rounded-full bg-surface-elevated" />
          </div>
        </div>
        <div className="px-4 py-3 space-y-2">
          <div className="h-2.5 w-24 rounded-full bg-surface-elevated" />
          <div className="h-32 rounded-xl bg-surface-elevated" />
        </div>
      </div>
    </div>
  )
}
