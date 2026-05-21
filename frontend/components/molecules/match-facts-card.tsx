'use client'

import { useState, useEffect } from 'react'
import { BarChart3, ChevronDown, ChevronUp, Flame, Trophy, AlertTriangle, ShieldAlert, ShieldCheck, Activity } from 'lucide-react'
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

    fetch(`/api/matches/${matchId}/facts`, { cache: 'no-store', signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: MatchFacts) => {
        // Invariant check: confidence and player arrays must be consistent
        const homeTotal = d.squad.home.injured.length + d.squad.home.suspended.length + d.squad.home.doubtful.length
        const awayTotal = d.squad.away.injured.length + d.squad.away.suspended.length + d.squad.away.doubtful.length
        if (d.squadConfidence !== 'verified' && (homeTotal > 0 || awayTotal > 0)) {
          console.error(
            `[MatchFacts] ${matchId} — INVARIANT VIOLATION: confidence=${d.squadConfidence} ` +
            `but home=${homeTotal} away=${awayTotal} player entries present. ` +
            `Entries will be forced empty at render.`,
            { home: d.squad.home, away: d.squad.away },
          )
        }

        setFacts(d)
        setStatus('ready')
        console.debug(`[MatchFacts] ${matchId} — squadConfidence=${d.squadConfidence}`, {
          home: {
            injured:   d.squad.home.injured.map(p => ({ name: p.name, validated: p.validated, source: p.source })),
            suspended: d.squad.home.suspended.map(p => ({ name: p.name, validated: p.validated, source: p.source })),
            doubtful:  d.squad.home.doubtful.map(p => ({ name: p.name, validated: p.validated, source: p.source })),
          },
          away: {
            injured:   d.squad.away.injured.map(p => ({ name: p.name, validated: p.validated, source: p.source })),
            suspended: d.squad.away.suspended.map(p => ({ name: p.name, validated: p.validated, source: p.source })),
            doubtful:  d.squad.away.doubtful.map(p => ({ name: p.name, validated: p.validated, source: p.source })),
          },
        })
      })
      .catch(() => setStatus('error'))
      .finally(() => clearTimeout(timer))

    return () => { ctrl.abort(); clearTimeout(timer) }
  }, [matchId])

  if (status === 'error') return null
  if (status === 'loading' || !facts) return <FactsSkeleton />
  if (facts.pendingData)              return <FactsPendingCard homeTeam={homeTeam} awayTeam={awayTeam} />

  // Only expose validated players when confidence is explicitly 'verified'
  const validPlayer = (p: PlayerStatus) =>
    typeof p.name === 'string' && p.name.trim().length >= 2 && p.validated === true

  const allHomeAbsent: PlayerStatus[] = facts.squadConfidence === 'verified' ? [
    ...facts.squad.home.injured,
    ...facts.squad.home.suspended,
    ...facts.squad.home.doubtful,
  ].filter(validPlayer) : []

  const allAwayAbsent: PlayerStatus[] = facts.squadConfidence === 'verified' ? [
    ...facts.squad.away.injured,
    ...facts.squad.away.suspended,
    ...facts.squad.away.doubtful,
  ].filter(validPlayer) : []

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden animate-fade-in shadow-card">
      <div className="divide-y divide-border/50">

        {/* ── Header ── */}
        <div className="flex items-center px-4 py-3.5">
          <div className="flex items-center gap-2">
            <BarChart3 className="size-[15px] text-muted-foreground flex-shrink-0" strokeWidth={1.75} />
            <span className="text-[13px] font-bold text-foreground tracking-[-0.01em]">Match Facts</span>
          </div>
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
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold tracking-[0.13em] uppercase text-muted-foreground">
                Squad News
              </span>
              {facts.squadConfidence === 'verified' ? (
                <span className="text-[9px] font-bold tracking-[0.05em] uppercase px-1.5 py-[2px] rounded border bg-status-won/10 text-status-won border-status-won/20">
                  Verified
                </span>
              ) : (
                <span className="text-[9px] font-bold tracking-[0.05em] uppercase px-1.5 py-[2px] rounded border bg-muted/20 text-muted-foreground/50 border-border/50">
                  No live data
                </span>
              )}
            </div>
            {squadOpen
              ? <ChevronUp   className="size-3.5 text-muted-foreground/50" strokeWidth={2} />
              : <ChevronDown className="size-3.5 text-muted-foreground/50" strokeWidth={2} />
            }
          </button>

          {squadOpen && (
            <div className="px-4 pb-4">
              {facts.squadConfidence !== 'verified' ? (
                <SquadNoDataFallback />
              ) : (
                <div className="flex flex-col gap-4">
                  <TeamSquadBlock
                    code={homeTeam.shortCode}
                    name={homeTeam.name}
                    absent={allHomeAbsent}
                    verified
                  />
                  <TeamSquadBlock
                    code={awayTeam.shortCode}
                    name={awayTeam.name}
                    absent={allAwayAbsent}
                    verified
                  />
                </div>
              )}
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
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold tracking-[0.13em] uppercase text-muted-foreground">
                Team Statistics
              </span>
              {facts.statsConfidence === 'verified' ? (
                <span className="text-[9px] font-bold tracking-[0.05em] uppercase px-1.5 py-[2px] rounded border bg-status-won/10 text-status-won border-status-won/20 flex items-center gap-1">
                  <ShieldCheck className="size-[9px]" strokeWidth={2.5} />
                  Live Match Data
                </span>
              ) : (
                <span className="text-[9px] font-bold tracking-[0.05em] uppercase px-1.5 py-[2px] rounded border bg-muted/20 text-muted-foreground/50 border-border/50">
                  No live data
                </span>
              )}
            </div>
            {statsOpen
              ? <ChevronUp   className="size-3.5 text-muted-foreground/50" strokeWidth={2} />
              : <ChevronDown className="size-3.5 text-muted-foreground/50" strokeWidth={2} />
            }
          </button>

          {statsOpen && (
            <div className="px-4 pb-4">
              {facts.statsConfidence !== 'verified' || facts.stats.length === 0 ? (
                <StatsNoDataFallback matchStatus={facts.statsConfidence} />
              ) : (
                <>
                  <StatsTable
                    stats={facts.stats}
                    homeCode={homeTeam.shortCode}
                    awayCode={awayTeam.shortCode}
                  />
                  {facts.statsFetchedAt && (
                    <p className="text-[9.5px] text-muted-foreground/35 mt-2 text-right">
                      <Activity className="size-[9px] inline mr-0.5 -mt-px" strokeWidth={2} />
                      API-Football · {new Date(facts.statsFetchedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </>
              )}
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

// ─── Squad fallback when there's no real data ────────────────

function SquadNoDataFallback() {
  return (
    <div className="flex flex-col gap-2 py-2">
      <p className="text-[12px] text-muted-foreground/55 italic pl-1">
        No verified squad updates available
      </p>
      <p className="text-[11px] text-muted-foreground/40 pl-1 leading-snug">
        Injury and suspension data appears here once verified by official sources.
      </p>
    </div>
  )
}

function TeamSquadBlock({
  code,
  name,
  absent,
  verified,
}: {
  code:     string
  name:     string
  absent:   PlayerStatus[]
  verified: boolean
}) {
  // Belt-and-suspenders: only render players that pass the validation invariant.
  // Any entry that fails fires console.error so the source is always visible in devtools.
  const safeAbsent = absent.filter(p => {
    const ok =
      typeof p.name === 'string' &&
      p.name.trim().length >= 2 &&
      p.validated === true
    if (!ok) {
      console.error(
        `[SquadBlock:${code}] INVARIANT VIOLATION — unvalidated player reached render. ` +
        `This player will NOT be displayed.`,
        {
          name:       p.name,
          status:     p.status,
          validated:  p.validated,
          source:     p.source,
          fetchedAt:  p.fetchedAt,
          payload:    p,
          stackHint:  new Error().stack?.split('\n').slice(1, 4).join(' | '),
        },
      )
    }
    return ok
  })

  // Log each validated player being rendered so the source is always traceable
  safeAbsent.forEach(p => {
    console.debug(
      `[SquadBlock:${code}] rendering player name=${JSON.stringify(p.name)} status=${p.status} validated=${p.validated} source=${JSON.stringify(p.source)}`,
    )
  })

  return (
    <div>
      {/* Team header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] font-black uppercase tracking-wider text-foreground">{code}</span>
        <span className="text-[11px] text-muted-foreground/60">{name}</span>
      </div>

      {safeAbsent.length === 0 ? (
        <p className="text-[12px] text-muted-foreground/55 italic pl-1">
          {verified ? 'No confirmed injuries or suspensions' : 'No verified squad updates available'}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {safeAbsent.map((p, i) => {
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

// ─── Stats fallback when there's no real data ────────────────

function StatsNoDataFallback({ matchStatus }: { matchStatus?: string }) {
  const isVerifiedButEmpty = matchStatus === 'verified'
  return (
    <div className="flex flex-col gap-2 py-2">
      <p className="text-[12px] text-muted-foreground/55 italic pl-1">
        {isVerifiedButEmpty
          ? 'No statistics returned for this fixture'
          : 'No verified match statistics available yet'}
      </p>
      <p className="text-[11px] text-muted-foreground/40 pl-1 leading-snug">
        Statistics will appear once live match data is available from API-Football.
      </p>
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
