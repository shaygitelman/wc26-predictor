import Link from 'next/link'
import { Lock } from 'lucide-react'
import { cn, formatKickoffTime } from '@/lib/utils'
import { StatusChip } from '@/components/atoms/status-chip'
import { TeamFlag } from '@/components/atoms/team-flag'
import { RoundBadge } from '@/components/atoms/round-badge'
import { PointsBadge } from '@/components/atoms/points-badge'
import type { Match } from '@/types/match'
import type { Prediction } from '@/types/prediction'

interface MatchCardProps {
  match: Match
  prediction?: Prediction
  className?: string
}

export function MatchCard({ match, prediction, className }: MatchCardProps) {
  const isLive     = match.status === 'live'
  const isFinished = match.status === 'finished'
  const hasPick    = !!prediction
  const needsPick  = match.status === 'scheduled' && !hasPick

  return (
    <Link
      href={`/matches/${match.id}`}
      className={cn(
        'relative block rounded-2xl border overflow-hidden transition-all duration-200',
        'active:scale-[0.97]',
        isLive
          ? 'bg-card border-status-live/30 shadow-live'
          : isFinished && hasPick
            ? prediction?.outcome === 'exact'
              ? 'bg-card border-gold/35'
              : prediction?.outcome === 'wrong'
                ? 'bg-card border-status-lost/25'
                : 'bg-card border-status-partial/25'
            : needsPick
              ? 'bg-card border-primary/30 hover:border-primary/60 hover:shadow-primary-glow hover:scale-[1.01]'
              : 'bg-card border-border hover:border-border/80 hover:shadow-raised',
        className,
      )}
    >
      {/* ── Card top sheen — subtle premium gloss ── */}
      <div className="absolute inset-x-0 top-0 h-24 card-sheen pointer-events-none" />

      {/* ── Live atmosphere tint ── */}
      {isLive && (
        <div className="absolute inset-0 bg-live-atmosphere pointer-events-none" />
      )}

      {/* ── Gold ambient tint for exact predictions ── */}
      {isFinished && prediction?.outcome === 'exact' && (
        <div className="absolute inset-0 bg-gradient-to-br from-gold/[0.06] to-transparent pointer-events-none" />
      )}

      {/* ── Top accent strip — outcome-aware ── */}
      {isLive ? (
        <div className="h-[4px] bg-gradient-to-r from-transparent via-status-live to-transparent" />
      ) : isFinished && hasPick ? (
        prediction?.outcome === 'exact' ? (
          <div className="h-[3px] bg-gradient-to-r from-transparent via-gold to-transparent" />
        ) : prediction?.outcome === 'wrong' ? (
          <div className="h-[2px] bg-gradient-to-r from-transparent via-status-lost/55 to-transparent" />
        ) : (
          <div className="h-[2px] bg-gradient-to-r from-transparent via-status-partial/60 to-transparent" />
        )
      ) : needsPick ? (
        <div className="h-[3px] bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      ) : null}

      {/* ── Round + Status header ── */}
      <div className="relative flex items-center justify-between px-4 pt-3 pb-2">
        <RoundBadge round={match.round} group={match.group} />
        <StatusChip status={match.status} minute={match.minute} />
      </div>

      {/* ── Teams + Score ── */}
      <div className="relative flex items-center px-4 pt-1 pb-4 gap-2">

        {/* Home team */}
        <div className="flex flex-col items-center gap-2 flex-1">
          <TeamFlag team={match.homeTeam} size="xl" />
          <span className="text-[13px] font-bold text-foreground text-center leading-tight line-clamp-2 max-w-[84px]">
            {match.homeTeam.name}
          </span>
        </div>

        {/* Score / time */}
        <div className="flex flex-col items-center justify-center gap-1 min-w-[88px] flex-shrink-0">
          {isLive || isFinished ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className={cn(
                  'font-black tabular leading-none tracking-tighter',
                  isLive
                    ? 'text-[3.5rem] text-status-live live-score-glow'
                    : 'text-[3rem] text-gold-gradient',
                )}>
                  {match.homeScore ?? 0}
                </span>
                <span className="text-2xl font-thin text-muted-foreground/20 leading-none">
                  :
                </span>
                <span className={cn(
                  'font-black tabular leading-none tracking-tighter',
                  isLive
                    ? 'text-[3.5rem] text-status-live live-score-glow'
                    : 'text-[3rem] text-gold-gradient',
                )}>
                  {match.awayScore ?? 0}
                </span>
              </div>
              {isLive && match.minute && (
                <div className="flex items-center gap-1.5">
                  <span className="size-[5px] rounded-full bg-status-live animate-live-pulse flex-shrink-0" />
                  <span className="text-[11px] font-bold text-status-live tabular">{match.minute}&apos;</span>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <span className="text-[1.625rem] font-black tabular leading-none text-foreground">
                {formatKickoffTime(match.scheduledAt)}
              </span>
              <span className="text-2xs text-muted-foreground/55 font-bold tracking-[0.14em] uppercase">
                kick off
              </span>
            </div>
          )}
        </div>

        {/* Away team */}
        <div className="flex flex-col items-center gap-2 flex-1">
          <TeamFlag team={match.awayTeam} size="xl" />
          <span className="text-[13px] font-bold text-foreground text-center leading-tight line-clamp-2 max-w-[84px]">
            {match.awayTeam.name}
          </span>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="relative flex items-center justify-between px-4 py-2.5 border-t border-border/50">
        <span className="text-2xs text-muted-foreground/50 truncate max-w-[150px]">
          {[match.venue, match.city].filter(Boolean).join(' · ')}
        </span>

        {isFinished && hasPick ? (
          <div className="flex items-center gap-1.5">
            {prediction?.isAutoPick && (
              <span className="text-[9px] font-black tracking-widest uppercase text-muted-foreground/50 bg-surface-elevated px-1.5 py-0.5 rounded">
                AUTO
              </span>
            )}
            <PointsBadge
              points={prediction.pointsEarned ?? 0}
              outcome={prediction.outcome ?? 'wrong'}
            />
          </div>
        ) : hasPick ? (
          <span className="flex items-center gap-1.5 text-primary">
            {prediction?.isAutoPick && (
              <span className="text-[9px] font-black tracking-widest uppercase text-muted-foreground/50 bg-surface-elevated px-1.5 py-0.5 rounded">
                AUTO
              </span>
            )}
            <Lock className="size-3 flex-shrink-0" strokeWidth={2.5} />
            <span className="text-xs font-bold tabular">
              {prediction.predictedHome} – {prediction.predictedAway}
            </span>
          </span>
        ) : match.status === 'scheduled' ? (
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold tracking-wide shadow-[0_2px_20px_rgba(136,117,255,0.55)]">
            Predict →
          </span>
        ) : null}
      </div>
    </Link>
  )
}
