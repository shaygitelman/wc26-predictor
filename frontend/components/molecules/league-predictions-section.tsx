'use client'

import { useState, useEffect, useRef } from 'react'
import { Lock, Trophy, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  MatchLeaguePredictions,
  LeaguePredictionGroup,
  LeaguePredictionEntry,
  PredictionOutcome,
} from '@/types/match-league-predictions'

// ─── Helpers ──────────────────────────────────────────────────

function formatBeforeKickoff(submittedAt: string, scheduledAt: string): string | null {
  const diffMs = new Date(scheduledAt).getTime() - new Date(submittedAt).getTime()
  if (diffMs <= 0) return null

  const diffS = Math.floor(diffMs / 1000)
  if (diffS < 60)   return 'at kickoff'
  if (diffS < 3600) return `${Math.floor(diffS / 60)}m before kickoff`

  const h = Math.floor(diffS / 3600)
  const m = Math.floor((diffS % 3600) / 60)
  return m > 0 ? `${h}h ${m}m before kickoff` : `${h}h before kickoff`
}

// ─── Avatar ───────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-violet-500/20 text-violet-400',
  'bg-blue-500/20   text-blue-400',
  'bg-emerald-500/20 text-emerald-400',
  'bg-amber-500/20  text-amber-400',
  'bg-rose-500/20   text-rose-400',
  'bg-cyan-500/20   text-cyan-400',
]

function Avatar({ username, avatarId, size = 32 }: { username: string; avatarId?: string | null; size?: number }) {
  const colorIdx = username.charCodeAt(0) % AVATAR_COLORS.length
  const letter   = username[0]?.toUpperCase() ?? '?'

  if (avatarId) {
    return (
      <div
        className="rounded-full bg-surface-elevated flex items-center justify-center flex-shrink-0 text-base leading-none"
        style={{ width: size, height: size }}
      >
        {avatarId}
      </div>
    )
  }

  return (
    <div
      className={cn('rounded-full flex items-center justify-center flex-shrink-0 font-black', AVATAR_COLORS[colorIdx])}
      style={{ width: size, height: size, fontSize: size * 0.44 }}
    >
      {letter}
    </div>
  )
}

// ─── Outcome badge ────────────────────────────────────────────

function OutcomeBadge({ outcome }: { outcome: PredictionOutcome | null }) {
  if (!outcome || outcome === 'pending') return null

  if (outcome === 'exact') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full bg-status-won/12 border border-status-won/25 text-status-won text-[10px] font-bold whitespace-nowrap flex-shrink-0">
        <span>🟢</span> Exact
      </span>
    )
  }

  if (outcome === 'difference' || outcome === 'outcome') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold whitespace-nowrap flex-shrink-0">
        <span>🔵</span> Correct
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full bg-muted/20 border border-border text-muted-foreground/60 text-[10px] font-bold whitespace-nowrap flex-shrink-0">
      <span>⚪</span> Wrong
    </span>
  )
}

// ─── Single prediction row ────────────────────────────────────

function PredictionRow({
  entry,
  matchScheduledAt,
  matchStatus,
  index,
}: {
  entry:            LeaguePredictionEntry
  matchScheduledAt: string
  matchStatus:      string
  index:            number
}) {
  const isFinished    = matchStatus === 'finished'
  const beforeKickoff = formatBeforeKickoff(entry.submittedAt, matchScheduledAt)
  const timeLabel     = entry.isAutoPick ? null : beforeKickoff

  const scoreChipCls = isFinished && entry.outcome && entry.outcome !== 'pending'
    ? entry.outcome === 'exact'
      ? 'bg-status-won/10 border-status-won/30 text-status-won'
      : entry.outcome === 'wrong'
      ? 'bg-status-lost/10 border-status-lost/20 text-status-lost/80'
      : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
    : entry.isCurrentUser
    ? 'bg-primary/[0.09] border-primary/25 text-primary'
    : 'bg-surface-elevated border-border/40 text-foreground'

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 border-b border-border/30 last:border-0',
        entry.isCurrentUser && 'bg-primary/[0.03]',
        'animate-fade-in',
      )}
      style={{ animationDelay: `${index * 55}ms`, animationFillMode: 'backwards' }}
    >
      {/* Rank */}
      <span className="text-[11px] font-bold text-muted-foreground/35 w-4 text-center flex-shrink-0 tabular-nums">
        {entry.rank ?? '—'}
      </span>

      {/* Avatar */}
      <Avatar username={entry.username} avatarId={entry.avatarId} size={30} />

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={cn(
            'text-[13px] font-semibold truncate max-w-[120px]',
            entry.isCurrentUser ? 'text-primary' : 'text-foreground',
          )}>
            {entry.username}
          </span>
          {entry.isCurrentUser && (
            <span className="text-[9px] font-black uppercase tracking-wider text-primary/60 bg-primary/10 px-1.5 py-[1px] rounded-full flex-shrink-0">
              You
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[11px] text-muted-foreground/45 tabular-nums">
            {entry.totalPoints !== null ? `${entry.totalPoints} pts` : '—'}
          </span>
          {(entry.isAutoPick || timeLabel) && (
            <span className="text-[10px] text-muted-foreground/30">·</span>
          )}
          {entry.isAutoPick ? (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/40 font-semibold">
              <Zap className="size-[9px]" strokeWidth={2.5} />
              Auto pick
            </span>
          ) : timeLabel ? (
            <span className="text-[10px] text-muted-foreground/35">{timeLabel}</span>
          ) : null}
        </div>
      </div>

      {/* Score + outcome */}
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        <div className={cn('flex items-center gap-0.5 px-2.5 py-1 rounded-lg border', scoreChipCls)}>
          <span className="text-[14px] font-black tabular-nums leading-none">
            {entry.predictedHome}–{entry.predictedAway}
          </span>
          {isFinished && entry.outcome === 'exact' && (
            <span className="text-[11px] leading-none ml-0.5">★</span>
          )}
        </div>
        {isFinished && <OutcomeBadge outcome={entry.outcome} />}
      </div>
    </div>
  )
}

// ─── League tab body ──────────────────────────────────────────

function LeagueTabBody({
  group,
  matchStatus,
  matchScheduledAt,
}: {
  group:            LeaguePredictionGroup
  matchStatus:      string
  matchScheduledAt: string
}) {
  const revealed = matchStatus !== 'scheduled'

  if (!revealed) {
    return (
      <div className="px-4 py-6 flex flex-col items-center gap-1.5">
        <Lock className="size-4 text-muted-foreground/25" strokeWidth={1.75} />
        <p className="text-[12px] font-semibold text-muted-foreground/50 text-center leading-snug">
          Predictions will be revealed<br />when the match starts
        </p>
        {group.predictedCount > 0 && (
          <span className="mt-1 text-[11px] text-muted-foreground/35">
            {group.predictedCount} {group.predictedCount === 1 ? 'member' : 'members'} already predicted
          </span>
        )}
      </div>
    )
  }

  if (group.predictions.length === 0) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-[12px] text-muted-foreground/40">No predictions for this match</p>
      </div>
    )
  }

  return (
    <div>
      {group.predictions.map((entry, i) => (
        <PredictionRow
          key={entry.userId}
          entry={entry}
          matchScheduledAt={matchScheduledAt}
          matchStatus={matchStatus}
          index={i}
        />
      ))}
    </div>
  )
}

// ─── Tab bar ──────────────────────────────────────────────────

function LeagueTabBar({
  leagues,
  activeId,
  onSelect,
}: {
  leagues:  LeaguePredictionGroup[]
  activeId: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-none px-3 pt-3 pb-0">
      {leagues.map(league => {
        const isActive = league.leagueId === activeId
        return (
          <button
            key={league.leagueId}
            type="button"
            onClick={() => onSelect(league.leagueId)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-t-xl text-[12px] font-bold whitespace-nowrap flex-shrink-0 transition-colors',
              'border-b-2',
              isActive
                ? 'text-foreground border-primary bg-surface-elevated'
                : 'text-muted-foreground/55 border-transparent hover:text-muted-foreground hover:bg-surface-elevated/50',
            )}
          >
            {league.isDefault && (
              <Trophy className="size-[11px] text-gold flex-shrink-0" strokeWidth={2} />
            )}
            <span className="max-w-[120px] truncate">{league.leagueName}</span>
            <span className={cn(
              'text-[10px] font-semibold tabular-nums',
              isActive ? 'text-muted-foreground/60' : 'text-muted-foreground/35',
            )}>
              {league.predictedCount}/{league.totalMembers}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Section skeleton ─────────────────────────────────────────

function SectionSkeleton() {
  return (
    <div className="bg-card rounded-2xl border border-border animate-pulse overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="size-[14px] rounded bg-surface-elevated" />
          <div className="h-3.5 w-28 rounded-full bg-surface-elevated" />
        </div>
        <div className="h-4 w-16 rounded-full bg-surface-elevated" />
      </div>
      {/* Tab bar */}
      <div className="flex gap-1 px-3 pt-3 pb-0 border-b border-border/40">
        {[80, 100, 72].map((w, i) => (
          <div key={i} className="h-8 rounded-t-xl bg-surface-elevated flex-shrink-0" style={{ width: w }} />
        ))}
      </div>
      {/* Rows */}
      {[0, 1, 2].map(r => (
        <div key={r} className="flex items-center gap-3 px-4 py-3 border-b border-border/30 last:border-0">
          <div className="w-4 h-3 rounded-full bg-surface-elevated" />
          <div className="size-[30px] rounded-full bg-surface-elevated" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-24 rounded-full bg-surface-elevated" />
            <div className="h-2.5 w-16 rounded-full bg-surface-elevated" />
          </div>
          <div className="h-7 w-14 rounded-lg bg-surface-elevated" />
        </div>
      ))}
    </div>
  )
}

// ─── Main section ─────────────────────────────────────────────

interface Props {
  matchId:      string
  matchStatus:  string
  initialData?: MatchLeaguePredictions
}

export function LeaguePredictionsSection({ matchId, matchStatus, initialData }: Props) {
  const [data,           setData]           = useState<MatchLeaguePredictions | null>(initialData ?? null)
  const [loading,        setLoading]        = useState(initialData === undefined)
  const [error,          setError]          = useState(false)
  const [activeLeagueId, setActiveLeagueId] = useState<string | null>(null)
  const isLive = matchStatus === 'live'

  const hasPushedSSR = useRef(initialData !== undefined)

  // Set the first league as active whenever data arrives
  useEffect(() => {
    if (data && data.leagues.length > 0) {
      setActiveLeagueId(prev => prev ?? data.leagues[0].leagueId)
    }
  }, [data])

  const fetchData = (cancelled?: { current: boolean }) => {
    fetch(`/api/matches/${matchId}/league-predictions`, { cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<MatchLeaguePredictions>
      })
      .then(d => {
        if (cancelled?.current) return
        setData(d)
        setLoading(false)
        setError(false)
      })
      .catch(() => {
        if (!cancelled?.current) { setError(true); setLoading(false) }
      })
  }

  // Initial load (only if SSR didn't provide data)
  useEffect(() => {
    if (hasPushedSSR.current) return
    const cancelled = { current: false }
    fetchData(cancelled)
    return () => { cancelled.current = true }
  }, [matchId])  // eslint-disable-line react-hooks/exhaustive-deps

  // 30-second auto-refresh while live
  useEffect(() => {
    if (!isLive) return
    const id = setInterval(() => fetchData(), 30_000)
    return () => clearInterval(id)
  }, [isLive, matchId])  // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] font-black tracking-[0.14em] uppercase text-muted-foreground/50 px-1">
        League Predictions
      </p>
      <SectionSkeleton />
    </div>
  )

  if (error || !data || data.leagues.length === 0) return null

  const activeGroup = data.leagues.find(l => l.leagueId === activeLeagueId) ?? data.leagues[0]

  return (
    <div className="flex flex-col gap-3">
      {/* Section label */}
      <div className="flex items-center gap-2 px-1">
        <p className="text-[11px] font-black tracking-[0.14em] uppercase text-muted-foreground/50">
          League Predictions
        </p>
        {isLive && (
          <span className="size-[5px] rounded-full bg-status-live animate-live-pulse flex-shrink-0" />
        )}
      </div>

      {/* Single card */}
      <div className="bg-card rounded-2xl border border-border shadow-card overflow-hidden animate-fade-in">
        {/* Card header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Trophy className="size-[14px] text-gold flex-shrink-0" strokeWidth={1.75} />
            <span className="text-[13px] font-bold text-foreground">League Predictions</span>
          </div>
          {data.leagues.length > 1 && (
            <span className="text-[10px] font-bold text-muted-foreground/40 flex-shrink-0">
              {data.leagues.length} leagues
            </span>
          )}
        </div>

        {/* Tab bar — only shown when there are multiple leagues */}
        {data.leagues.length > 1 && (
          <div className="border-b border-border/50">
            <LeagueTabBar
              leagues={data.leagues}
              activeId={activeGroup.leagueId}
              onSelect={setActiveLeagueId}
            />
          </div>
        )}

        {/* Active league body */}
        <LeagueTabBody
          group={activeGroup}
          matchStatus={data.matchStatus}
          matchScheduledAt={data.matchScheduledAt}
        />
      </div>
    </div>
  )
}
