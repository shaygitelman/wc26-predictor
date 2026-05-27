'use client'

import { useState } from 'react'
import { Lock, MapPin, Calendar, Check } from 'lucide-react'
import { cn, formatMatchDate, formatKickoffTime } from '@/lib/utils'
import { ContextHeader } from '@/components/layout/context-header'
import { TeamFlag } from '@/components/atoms/team-flag'
import { StatusChip } from '@/components/atoms/status-chip'
import { PointsBadge } from '@/components/atoms/points-badge'
import { RoundBadge } from '@/components/atoms/round-badge'
import { PredictionSheet } from '@/components/molecules/prediction-sheet'
import { MatchInsightsCard } from '@/components/molecules/match-insights-card'
import { MatchFactsCard } from '@/components/molecules/match-facts-card'
import { LeaguePicksCard } from '@/components/molecules/league-picks-card'
import { GroupStandingsCard } from '@/components/molecules/group-standings-card'
import { ROUND_POINTS } from '@/lib/constants'
import { ROUND_LABELS } from '@/types/match'
import type { Match } from '@/types/match'
import type { Prediction } from '@/types/prediction'
import { trackPredictionSubmitted } from '@/lib/analytics'

interface MatchDetailViewProps {
  match: Match
  prediction?: Prediction
}

export function MatchDetailView({ match, prediction: initialPrediction }: MatchDetailViewProps) {
  const [prediction, setPrediction] = useState(initialPrediction)
  const isFinished = match.status === 'finished'
  const isLive     = match.status === 'live'
  const hasPick    = !!prediction

  return (
    <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
      <ContextHeader title="Match" back="/matches" />

      {/* ── Hero — edge-to-edge, dissolves into page ─────── */}
      <div className="relative bg-background overflow-hidden">

        {/* Atmospheric backdrop */}
        <div className={cn(
          'absolute inset-0 pointer-events-none',
          isLive ? 'bg-live-hero-atmosphere' : 'bg-hero-atmosphere',
        )} />

        {/* Top accent line */}
        <div className={cn(
          'h-[3px]',
          isLive
            ? 'bg-gradient-to-r from-transparent via-status-live to-transparent'
            : 'bg-gradient-to-r from-transparent via-gold/50 to-transparent',
        )} />

        {/* Round + status — always shown */}
        <div className="relative px-5">
          <div className="flex items-center justify-between pt-5 pb-3">
            <RoundBadge round={match.round} group={match.group} />
            <StatusChip status={match.status} minute={match.minute} />
          </div>
        </div>

        {/* ── Hero main content ── */}
        {match.status === 'scheduled' && !hasPick ? (
          <InlinePredictionHero match={match} onSaved={setPrediction} />
        ) : (
          <div className="relative px-5">

            {/* ── Teams + Score ── */}
            <div className="flex items-center pb-7 gap-2">

              {/* Home team */}
              <div className="flex flex-col items-center gap-3 flex-1">
                <TeamFlag team={match.homeTeam} size="2xl" />
                <span className="text-[13px] font-bold text-foreground text-center leading-tight max-w-[90px]">
                  {match.homeTeam.name}
                </span>
              </div>

              {/* Score / locked pick */}
              <div className="flex flex-col items-center gap-2 flex-shrink-0">
                {isLive || isFinished ? (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className={cn(
                        'font-black tabular leading-none',
                        isLive ? 'text-[5rem] text-status-live' : 'text-[4.5rem] text-gold-gradient',
                      )}>
                        {match.homeScore ?? 0}
                      </span>
                      <span className="text-[2.25rem] font-thin text-muted-foreground/25 leading-none pb-1">
                        :
                      </span>
                      <span className={cn(
                        'font-black tabular leading-none',
                        isLive ? 'text-[5rem] text-status-live' : 'text-[4.5rem] text-gold-gradient',
                      )}>
                        {match.awayScore ?? 0}
                      </span>
                    </div>

                    {isLive && match.minute && (
                      <div className="flex items-center gap-2 bg-status-live/10 border border-status-live/20 rounded-full px-3 py-1">
                        <span className="size-1.5 rounded-full bg-status-live animate-live-pulse flex-shrink-0" />
                        <span className="text-xs font-bold text-status-live tabular">{match.minute}&apos;</span>
                      </div>
                    )}

                    {isFinished && (
                      <span className="text-2xs font-bold text-muted-foreground/45 tracking-[0.2em] uppercase">
                        Full Time
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="text-[3.5rem] font-black text-foreground tabular leading-none">
                      {formatKickoffTime(match.scheduledAt)}
                    </span>
                    <span className="text-2xs text-muted-foreground/45 font-bold tracking-[0.2em] uppercase">
                      Kick Off
                    </span>
                  </>
                )}
              </div>

              {/* Away team */}
              <div className="flex flex-col items-center gap-3 flex-1">
                <TeamFlag team={match.awayTeam} size="2xl" />
                <span className="text-[13px] font-bold text-foreground text-center leading-tight max-w-[90px]">
                  {match.awayTeam.name}
                </span>
              </div>
            </div>

            {/* Venue + date */}
            <div className="flex items-center justify-center gap-5 pb-5 flex-wrap">
              {(match.venue || match.city) && (
                <div className="flex items-center gap-1.5 text-muted-foreground/50">
                  <MapPin className="size-3 flex-shrink-0" />
                  <span className="text-[11px]">
                    {[match.venue, match.city].filter(Boolean).join(' · ')}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-muted-foreground/50">
                <Calendar className="size-3 flex-shrink-0" />
                <span className="text-[11px]">{formatMatchDate(match.scheduledAt)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Prediction strip — live/finished with pick, or scheduled+hasPick edit */}
        <PredictionStrip
          match={match}
          prediction={prediction}
          hasPick={hasPick}
          isLive={isLive}
          isFinished={isFinished}
          onSaved={setPrediction}
        />

        {/* Hero dissolves into body */}
        <div className="h-7 fade-to-background-b pointer-events-none" />
      </div>

      {/* ── Body ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-5 px-4 pt-1 pb-8">

        {match.round === 'group' && match.group && (
          <GroupStandingsCard
            matchId={match.id}
            homeCode={match.homeTeam.shortCode}
            awayCode={match.awayTeam.shortCode}
            matchStatus={match.status}
            group={match.group}
          />
        )}

        <MatchInsightsCard
          matchId={match.id}
          homeTeam={{ name: match.homeTeam.name, shortCode: match.homeTeam.shortCode }}
          awayTeam={{ name: match.awayTeam.name, shortCode: match.awayTeam.shortCode }}
        />

        <MatchFactsCard
          matchId={match.id}
          homeTeam={{ name: match.homeTeam.name, shortCode: match.homeTeam.shortCode }}
          awayTeam={{ name: match.awayTeam.name, shortCode: match.awayTeam.shortCode }}
          round={match.round}
        />

        <LeaguePicksCard matchId={match.id} matchStatus={match.status} />

        <section className="pt-3">
          <p className="text-[11px] font-black tracking-[0.14em] uppercase text-muted-foreground/50 mb-3 px-1">
            Match Info
          </p>
          <div className="divide-y divide-border/35">
            <InfoRow label="Round" value={match.round === 'group' ? `Group ${match.group}` : ROUND_LABELS[match.round]} />
            {(match.venue || match.city) && (
              <InfoRow
                label="Venue"
                value={[match.venue, match.city].filter(Boolean).join(' · ')}
              />
            )}
            <InfoRow label="Kickoff" value={`${formatMatchDate(match.scheduledAt)} · ${formatKickoffTime(match.scheduledAt)} (Israel)`} />
          </div>
        </section>

        <section className="pb-2">
          <p className="text-[11px] font-black tracking-[0.14em] uppercase text-muted-foreground/50 mb-3 px-1">
            Scoring
          </p>
          {(() => {
            const pts = ROUND_POINTS[match.round] ?? ROUND_POINTS.group
            return (
              <div className="divide-y divide-border/35">
                <InfoRow label="Exact score"     value={`${pts.exact} pts`}     accent />
                <InfoRow label="Goal difference" value={`${pts.direction} pts`} accent />
                <InfoRow label="Correct outcome" value={`${pts.direction} pts`} accent />
                <InfoRow label="Wrong"           value="0 pts" />
              </div>
            )
          })()}
        </section>
      </div>
    </div>
  )
}

// ─── Inline prediction hero ───────────────────────────────────

function InlinePredictionHero({
  match,
  onSaved,
}: {
  match:   Match
  onSaved: (p: Prediction) => void
}) {
  const [home,   setHome]   = useState(1)
  const [away,   setAway]   = useState(0)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [err,    setErr]    = useState('')
  const pts = ROUND_POINTS[match.round] ?? ROUND_POINTS.group

  const confirm = async () => {
    setStatus('saving')
    setErr('')
    try {
      const res = await fetch(`/api/predictions/${match.id}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ predictedHome: home, predictedAway: away }),
      })
      if (!res.ok) throw new Error(await res.text())
      const prediction: Prediction = await res.json()
      trackPredictionSubmitted({
        matchId:   match.id,
        round:     match.round,
        isNew:     true,
        homeScore: home,
        awayScore: away,
      })
      setStatus('saved')
      setTimeout(() => onSaved(prediction), 800)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed. Try again.')
      setStatus('error')
    }
  }

  const busy = status === 'saving' || status === 'saved'

  return (
    <div className="relative px-5 pb-2">

      {/* Teams */}
      <div className="flex items-end justify-between pb-5">
        <div className="flex flex-col items-center gap-2.5 flex-1">
          <TeamFlag team={match.homeTeam} size="2xl" />
          <span className="text-[13px] font-bold text-foreground text-center leading-tight max-w-[90px]">
            {match.homeTeam.name}
          </span>
        </div>
        <div className="flex-shrink-0 pb-2">
          <span className="text-[11px] font-semibold text-muted-foreground/30 tracking-widest uppercase">vs</span>
        </div>
        <div className="flex flex-col items-center gap-2.5 flex-1">
          <TeamFlag team={match.awayTeam} size="2xl" />
          <span className="text-[13px] font-bold text-foreground text-center leading-tight max-w-[90px]">
            {match.awayTeam.name}
          </span>
        </div>
      </div>

      {/* Label */}
      <p className="text-center text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground/50 mb-5">
        Make Your Prediction
      </p>

      {/* Score pickers */}
      <div className="flex items-center justify-center gap-3">
        <HeroStepper value={home} onChange={setHome} disabled={busy} />
        <OutcomeChip
          home={home}
          away={away}
          homeCode={match.homeTeam.shortCode}
          awayCode={match.awayTeam.shortCode}
        />
        <HeroStepper value={away} onChange={setAway} disabled={busy} />
      </div>

      {/* Points tiers */}
      <div className="flex items-center justify-center gap-4 mt-4 mb-5">
        <PointTier label="Exact" pts={pts.exact} highlight />
        <span className="text-border/60 text-sm">·</span>
        <PointTier label="Direction" pts={pts.direction} />
        <span className="text-border/60 text-sm">·</span>
        <PointTier label="Wrong" pts={0} />
      </div>

      {/* Lock-in button */}
      <button
        onClick={confirm}
        disabled={busy}
        className={cn(
          'w-full py-[18px] rounded-2xl font-black text-[15px] tracking-tight',
          'flex items-center justify-center gap-2',
          'transition-all duration-200 active:scale-[0.98]',
          status === 'saved'
            ? 'bg-status-won text-white shadow-[0_0_36px_rgba(0,212,106,0.45)] scale-[1.02]'
            : status === 'error'
            ? 'bg-status-lost/20 text-status-lost border border-status-lost/30'
            : 'bg-primary text-primary-foreground shadow-[0_0_24px_rgba(136,117,255,0.4)] hover:shadow-[0_0_36px_rgba(136,117,255,0.55)]',
          status === 'saving' && 'opacity-70 cursor-wait',
        )}
      >
        {status === 'saved'  ? <><Check className="size-[18px]" strokeWidth={3} /> Locked In!</>
        : status === 'saving' ? 'Saving…'
        : status === 'error'  ? 'Retry'
        : `Lock in ${home} – ${away}`}
      </button>

      {status === 'error' && err && (
        <p className="text-center text-2xs text-status-lost mt-1.5">{err}</p>
      )}

      {/* Venue + date */}
      <div className="flex items-center justify-center gap-5 mt-5 pb-3 flex-wrap">
        {(match.venue || match.city) && (
          <div className="flex items-center gap-1.5 text-muted-foreground/40">
            <MapPin className="size-3 flex-shrink-0" />
            <span className="text-[10px]">{[match.venue, match.city].filter(Boolean).join(' · ')}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-muted-foreground/40">
          <Calendar className="size-3 flex-shrink-0" />
          <span className="text-[10px]">{formatMatchDate(match.scheduledAt)}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Outcome chip ────────────────────────────────────────────

function OutcomeChip({
  home,
  away,
  homeCode,
  awayCode,
}: {
  home:     number
  away:     number
  homeCode: string
  awayCode: string
}) {
  const isDraw = home === away
  const label  = isDraw ? 'Draw' : home > away ? `${homeCode} Win` : `${awayCode} Win`

  return (
    <div className="flex flex-col items-center justify-center self-stretch gap-2 px-1">
      <div className="w-px flex-1 bg-border/35" />
      <span
        key={label}
        className={cn(
          'text-[10px] font-black tracking-[0.1em] uppercase whitespace-nowrap',
          'px-2.5 py-1.5 rounded-lg border animate-score-pop',
          isDraw
            ? 'bg-gold/[0.10] text-gold border-gold/20'
            : 'bg-primary/[0.10] text-primary border-primary/20',
        )}
      >
        {label}
      </span>
      <div className="w-px flex-1 bg-border/35" />
    </div>
  )
}

// ─── Point tier ──────────────────────────────────────────────

function PointTier({ label, pts, highlight }: { label: string; pts: number; highlight?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={cn(
        'text-[14px] font-black tabular',
        highlight ? 'text-primary' : 'text-foreground/60',
      )}>
        {pts > 0 ? `+${pts}` : '0'}
      </span>
      <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/45">{label}</span>
    </div>
  )
}

// ─── Hero score stepper ───────────────────────────────────────

function HeroStepper({
  value,
  onChange,
  disabled,
}: {
  value:     number
  onChange:  (v: number) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl overflow-hidden border border-border/50 bg-surface-elevated">
      <button
        onClick={() => onChange(value + 1)}
        disabled={disabled}
        className={cn(
          'w-[72px] h-11 flex items-center justify-center',
          'text-muted-foreground hover:text-foreground hover:bg-surface-overlay',
          'active:scale-95 active:bg-primary/10 transition-all duration-100',
          'disabled:opacity-30 disabled:cursor-not-allowed',
        )}
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 13l5-6 5 6" />
        </svg>
      </button>

      <div className="w-[72px] h-[76px] flex items-center justify-center border-y border-border/40">
        <span
          key={value}
          className="text-[4rem] font-black tabular-nums text-foreground leading-none animate-score-pop"
        >
          {value}
        </span>
      </div>

      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={disabled || value === 0}
        className={cn(
          'w-[72px] h-11 flex items-center justify-center',
          'text-muted-foreground hover:text-foreground hover:bg-surface-overlay',
          'active:scale-95 active:bg-primary/10 transition-all duration-100',
          'disabled:opacity-20 disabled:cursor-not-allowed',
        )}
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 7l5 6 5-6" />
        </svg>
      </button>
    </div>
  )
}

// ─── Prediction strip ─────────────────────────────────────────

function PredictionStrip({
  match,
  prediction,
  hasPick,
  isLive,
  isFinished,
  onSaved,
}: {
  match:      Match
  prediction: Prediction | undefined
  hasPick:    boolean
  isLive:     boolean
  isFinished: boolean
  onSaved:    (p: Prediction) => void
}) {
  if (!hasPick) return null

  // ── Finished + has pick ──
  if (isFinished) {
    const p = prediction!
    const stripCls =
      p.outcome === 'exact'
        ? 'border-status-won/20 bg-status-won/[0.07]'
        : p.outcome === 'wrong'
        ? 'border-status-lost/15 bg-status-lost/[0.05]'
        : 'border-status-partial/15 bg-status-partial/[0.06]'

    return (
      <div className={cn('relative border-t px-5 py-4 flex items-center gap-4', stripCls)}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div>
            <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-muted-foreground/55 mb-0.5">
              Your pick
            </p>
            <p className="text-[22px] font-black tabular text-foreground leading-none">
              {p.predictedHome}–{p.predictedAway}
            </p>
          </div>
          <div className="w-px h-8 bg-border/35 flex-shrink-0" />
          <div>
            <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-muted-foreground/55 mb-0.5">
              Result
            </p>
            <p className="text-[22px] font-black tabular text-foreground leading-none">
              {match.homeScore}–{match.awayScore}
            </p>
          </div>
        </div>
        {p.pointsEarned !== undefined && (
          <PointsBadge points={p.pointsEarned} outcome={p.outcome ?? 'wrong'} className="flex-shrink-0" />
        )}
      </div>
    )
  }

  // ── Live + has pick ──
  if (isLive) {
    return (
      <div className="relative border-t border-border/25 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Lock className="size-3.5 text-primary flex-shrink-0" strokeWidth={2.5} />
          <div>
            <p className="text-[10px] font-medium text-muted-foreground/55 mb-0.5">Your pick</p>
            <p className="text-[22px] font-black tabular text-foreground leading-none">
              {prediction!.predictedHome}–{prediction!.predictedAway}
            </p>
          </div>
        </div>
        <span className="text-[10px] font-bold tracking-[0.08em] uppercase px-2.5 py-1 rounded-full bg-status-live/10 text-status-live border border-status-live/20">
          Live
        </span>
      </div>
    )
  }

  // ── Scheduled + has pick — prominent edit panel ──
  return (
    <div className="relative border-t border-border/20 px-5 py-4">
      <PredictionSheet
        match={match}
        existingHome={prediction!.predictedHome}
        existingAway={prediction!.predictedAway}
        onSaved={onSaved}
        trigger={
          <div className={cn(
            'flex items-center justify-between px-4 py-3.5 rounded-2xl',
            'bg-primary/[0.07] border border-primary/20',
            'hover:bg-primary/[0.11] hover:border-primary/30',
            'active:scale-[0.98] transition-all duration-150',
          )}>
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-full bg-primary/[0.12] flex items-center justify-center flex-shrink-0">
                <Lock className="size-3.5 text-primary/80" strokeWidth={2} />
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-muted-foreground/55 mb-0.5">
                  Your Prediction
                </p>
                <p className="text-[22px] font-black tabular text-primary leading-none">
                  {prediction!.predictedHome} – {prediction!.predictedAway}
                </p>
              </div>
            </div>
            <span className={cn(
              'flex-shrink-0 px-4 py-2.5 rounded-xl',
              'bg-primary text-primary-foreground',
              'text-[13px] font-black tracking-tight',
              'shadow-[0_0_12px_rgba(136,117,255,0.35)]',
            )}>
              Edit →
            </span>
          </div>
        }
      />
    </div>
  )
}

// ─── InfoRow ─────────────────────────────────────────────────

function InfoRow({
  label,
  value,
  accent,
}: {
  label:   string
  value:   string
  accent?: boolean
}) {
  return (
    <div className="flex items-center justify-between py-3 px-1">
      <span className="text-sm text-muted-foreground/70">{label}</span>
      <span className={cn(
        'text-sm font-semibold',
        accent ? 'text-primary' : 'text-foreground/90',
      )}>
        {value}
      </span>
    </div>
  )
}
